import { describe, expect, it } from "vitest";
import {
  streamIntoCache,
  type CacheLike,
  type CancellableTimer,
  type FetchLike,
  type StreamIntoCacheOptions,
} from "../src/pure/cache-download";

const KEY = "https://asset.invalid/0.1.0/model.onnx";
const LABEL = "sd-turbo/unet/model.onnx";

function bytesOf(n: number, seed = 1): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * seed + 3) & 0xff;
  return b;
}

type FakeCache = CacheLike & {
  map: Map<string, Uint8Array>;
  puts: { key: string; headers: Headers }[];
  deletes: string[];
  log: string[];
};

/** Map-Fake des Cache-Ports — die Vereinigung der beiden Fakes aus den Quell-Repos
 *  (`fakeCache` in local-image-generator, `memCache` in audio-interface), erweitert um
 *  Protokolle fuer die Reihenfolge-Zusicherungen. */
function fakeCache(log: string[] = []): FakeCache {
  const map = new Map<string, Uint8Array>();
  const puts: { key: string; headers: Headers }[] = [];
  const deletes: string[] = [];
  return {
    map,
    puts,
    deletes,
    log,
    async match(key) {
      const v = map.get(key);
      return v === undefined ? undefined : new Response(v as unknown as BodyInit);
    },
    async put(key, res) {
      puts.push({ key, headers: new Headers(res.headers) });
      log.push("put:start");
      map.set(key, new Uint8Array(await res.arrayBuffer()));
      log.push("put:done");
    },
    async delete(key) {
      deletes.push(key);
      return map.delete(key);
    },
  };
}

interface StreamOpts {
  chunk?: number;
  status?: number;
  /** `undefined` = Header mit der echten Laenge, `false` = kein Header, sonst der rohe Wert. */
  contentLength?: number | string | false;
  signal?: AbortSignal;
  /** Schliesst den Stream vorzeitig, sobald so viele Bytes abgegeben wurden. */
  stopAfter?: number;
  extraHeaders?: Record<string, string>;
}

function streamResponse(data: Uint8Array, o: StreamOpts = {}): Response {
  const chunk = o.chunk ?? 7;
  let off = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (o.signal?.aborted) return ctrl.error(new DOMException("aborted", "AbortError"));
      if (o.stopAfter !== undefined && off >= o.stopAfter) return ctrl.close();
      if (off >= data.length) return ctrl.close();
      ctrl.enqueue(data.slice(off, off + chunk));
      off += chunk;
    },
  });
  const headers: Record<string, string> = { ...(o.extraHeaders ?? {}) };
  if (o.contentLength !== false) headers["content-length"] = String(o.contentLength ?? data.length);
  return new Response(body, { status: o.status ?? 200, headers });
}

function opts(cache: CacheLike, fetchFn: FetchLike, over: Partial<StreamIntoCacheOptions> = {}): StreamIntoCacheOptions {
  return {
    cache,
    fetchFn,
    url: "https://host/sd-turbo/unet/model.onnx",
    key: KEY,
    signal: new AbortController().signal,
    label: LABEL,
    ...over,
  };
}

const timer: CancellableTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => { clearTimeout(id); };
};

const tick = (ms = 10): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

describe("streamIntoCache — Erfolgsfall", () => {
  it("laedt den Stream in den Cache, meldet Fortschritt je Chunk und liefert received + contentLength", async () => {
    const data = bytesOf(20);
    const cache = fakeCache();
    const progress: [number, number | null][] = [];
    const urls: string[] = [];
    const r = await streamIntoCache(
      opts(cache, async (url) => { urls.push(url); return streamResponse(data); }, {
        onProgress: (rec, cl) => progress.push([rec, cl]),
      }),
    );
    expect(r).toEqual({ received: 20, contentLength: 20 });
    expect(urls).toEqual(["https://host/sd-turbo/unet/model.onnx"]);
    expect(cache.map.get(KEY)).toEqual(data);
    expect(progress).toEqual([[7, 20], [14, 20], [20, 20]]);
    expect(cache.deletes).toEqual([]);
  });

  it("onChunk sieht jeden Chunk vollstaendig und in Reihenfolge — und laeuft VOR onProgress", async () => {
    const data = bytesOf(20);
    const seen: number[] = [];
    const seq: string[] = [];
    await streamIntoCache(
      opts(fakeCache(), async () => streamResponse(data), {
        onChunk: (c) => { for (const b of c) seen.push(b); seq.push(`chunk:${c.byteLength}`); },
        onProgress: (rec) => seq.push(`progress:${rec}`),
      }),
    );
    expect(new Uint8Array(seen)).toEqual(data);
    expect(seq).toEqual(["chunk:7", "progress:7", "chunk:7", "progress:14", "chunk:6", "progress:20"]);
  });

  it("der Cache-Zweig laeuft NEBEN der Leseschleife an: Fortschritt kommt, bevor der put fertig ist (0.4-Befund)", async () => {
    const data = bytesOf(30);
    const map = new Map<string, Uint8Array>();
    let release = (): void => {};
    const gate = new Promise<void>((r) => { release = () => r(); });
    const progress: number[] = [];
    const cache: CacheLike = {
      async match(key) { const v = map.get(key); return v === undefined ? undefined : new Response(v as unknown as BodyInit); },
      async put(key, res) {
        const buf = new Uint8Array(await res.arrayBuffer());
        await gate;
        map.set(key, buf);
      },
      async delete(key) { return map.delete(key); },
    };
    const p = streamIntoCache(opts(cache, async () => streamResponse(data), { onProgress: (rec) => progress.push(rec) }));
    await tick();
    // Die Leseschleife ist durch, obwohl der put noch haengt. Mit `await putDone` VOR der
    // Schleife waere hier noch kein einziger Fortschritt gemeldet — und der ungelesene
    // Fortschritts-Zweig laege komplett im Speicher.
    expect(progress.at(-1)).toBe(30);
    expect(map.size).toBe(0);
    release();
    await expect(p).resolves.toEqual({ received: 30, contentLength: 30 });
    expect(map.get(KEY)).toEqual(data);
  });
});

describe("streamIntoCache — Annahme der Antwort", () => {
  it("HTTP-Fehler: wirft mit Status und label, nichts wird in den Cache gelegt", async () => {
    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => streamResponse(new Uint8Array(0), { status: 404 }))),
    ).rejects.toThrow(/download failed: HTTP 404 for sd-turbo\/unet\/model\.onnx/);
    expect(cache.puts).toEqual([]);
    expect(cache.map.size).toBe(0);
    expect(cache.deletes).toEqual([]);
  });

  it("Default akzeptiert jedes res.ok; die accept-Option verengt auf genau 200", async () => {
    const data = bytesOf(10);
    await expect(
      streamIntoCache(opts(fakeCache(), async () => streamResponse(data, { status: 206 }))),
    ).resolves.toMatchObject({ received: 10 });

    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => streamResponse(data, { status: 206 }), { accept: (r) => r.status === 200 })),
    ).rejects.toThrow(/HTTP 206/);
    expect(cache.puts).toEqual([]);
  });
});

describe("streamIntoCache — Groessenpruefung", () => {
  it("content-length ungleich empfangen: Eintrag geloescht, Fehler nennt beide Zahlen", async () => {
    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => streamResponse(bytesOf(300), { stopAfter: 10 }))),
    ).rejects.toThrow(/download incomplete for sd-turbo\/unet\/model\.onnx \(14\/300 bytes\)/);
    expect(cache.map.has(KEY)).toBe(false);
    expect(cache.deletes).toEqual([KEY]);
  });

  it("expectedBytes greift auch ohne content-length-Header", async () => {
    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => streamResponse(bytesOf(300), { contentLength: false }), { expectedBytes: 999 })),
    ).rejects.toThrow(/incomplete for sd-turbo\/unet\/model\.onnx \(300\/999 bytes\)/);
    expect(cache.map.has(KEY)).toBe(false);
  });

  it("ohne Header und ohne expectedBytes wird gar nicht auf die Groesse geprueft", async () => {
    const cache = fakeCache();
    const r = await streamIntoCache(opts(cache, async () => streamResponse(bytesOf(300), { contentLength: false })));
    expect(r).toEqual({ received: 300, contentLength: null });
    expect(cache.map.get(KEY)?.byteLength).toBe(300);
  });

  it("ein unbrauchbarer content-length-Header gilt als nicht vorhanden (nicht als 0)", async () => {
    const cache = fakeCache();
    const r = await streamIntoCache(opts(cache, async () => streamResponse(bytesOf(21), { contentLength: "" })));
    expect(r).toEqual({ received: 21, contentLength: null });
    expect(cache.map.has(KEY)).toBe(true);
  });

  it("expectedBytes null zaehlt wie 'keine Manifest-Erwartung'", async () => {
    const cache = fakeCache();
    const r = await streamIntoCache(
      opts(cache, async () => streamResponse(bytesOf(21), { contentLength: false }), { expectedBytes: null }),
    );
    expect(r.received).toBe(21);
    expect(cache.map.has(KEY)).toBe(true);
  });
});

describe("streamIntoCache — Abbruch", () => {
  it("Abbruch vor dem fetch: wirft, ohne den Transport ueberhaupt zu rufen", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let calls = 0;
    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => { calls++; return streamResponse(bytesOf(5)); }, { signal: ctrl.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
    expect(cache.puts).toEqual([]);
  });

  it("Abbruch mitten im Stream: AbortError, angefangener Eintrag weg", async () => {
    const ctrl = new AbortController();
    const cache = fakeCache();
    await expect(
      streamIntoCache(
        opts(cache, async (_url, init) => streamResponse(bytesOf(300), { chunk: 5, signal: init.signal }), {
          signal: ctrl.signal,
          onProgress: (rec) => { if (rec >= 40) ctrl.abort(); },
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.map.has(KEY)).toBe(false);
    expect(cache.deletes).toEqual([KEY]);
  });

  it("abortError-Option: der Aufrufer bekommt seine eigene Fehlerklasse", async () => {
    class DownloadAborted extends Error {
      constructor() { super("download aborted"); this.name = "DownloadAborted"; }
    }
    const ctrl = new AbortController();
    await expect(
      streamIntoCache(
        opts(fakeCache(), async (_url, init) => streamResponse(bytesOf(300), { chunk: 5, signal: init.signal }), {
          signal: ctrl.signal,
          abortError: () => new DownloadAborted(),
          onProgress: (rec) => { if (rec >= 40) ctrl.abort(); },
        }),
      ),
    ).rejects.toBeInstanceOf(DownloadAborted);
  });

  it("Regression (gemessen 2026-08-19): ein put, der NACH dem Abbruch fertig wird, hinterlaesst keinen Teil-Eintrag", async () => {
    // Der Fehler in local-image-generator: `cache.delete(key)` lief, WAEHREND der put noch offen
    // war — der put konnte danach fertig werden und den Teil-Eintrag zurueckschreiben. Dieser
    // Fake schreibt bewusst spaet und unabhaengig vom Stream (so wie ein echter Cache, der die
    // schon empfangenen Bytes bereits auf der Platte hat).
    const map = new Map<string, string>();
    const order: string[] = [];
    let release = (): void => {};
    const gate = new Promise<void>((r) => { release = () => r(); });
    const cache: CacheLike = {
      async match(key) { const v = map.get(key); return v === undefined ? undefined : new Response(v); },
      async put(key, _res) { await gate; order.push("put"); map.set(key, "teil"); },
      async delete(key) { order.push("delete"); return map.delete(key); },
    };
    const ctrl = new AbortController();
    const p = streamIntoCache(
      opts(cache, async (_url, init) => streamResponse(bytesOf(300), { chunk: 5, signal: init.signal }), {
        signal: ctrl.signal,
        onProgress: (rec) => { if (rec >= 40) ctrl.abort(); },
      }),
    );
    await tick();
    expect(order).toEqual([]); // der Kern wartet auf den put, statt schon geloescht zu haben
    release();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(order).toEqual(["put", "delete"]);
    expect(map.size).toBe(0);
  });
});

describe("streamIntoCache — Stillstand", () => {
  it("keine Bytes ueber die Frist: Fehler 'stalled', kein Teil-Eintrag, und es haengt nicht", async () => {
    const cache = fakeCache();
    // Ein Chunk, dann Stille: der Stream schliesst nie und scheitert auch nie — genau der Fall,
    // in dem ein unbedingtes `await putDone` ewig laufen wuerde.
    const p = streamIntoCache(
      opts(cache, async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytesOf(10)); } }), { status: 200 }), {
        stallMs: 30,
        timer,
      }),
    );
    await expect(p).rejects.toThrow(/download stalled: no data for 0\.03s \(sd-turbo\/unet\/model\.onnx\)/);
    expect(cache.map.has(KEY)).toBe(false);
    expect(cache.deletes).toEqual([KEY]);
  });

  it("Stall-Timer: je Datei genau ein aktiver Timer, nach jedem Chunk neu gestellt, am Ende abgeraeumt (kein Leak)", async () => {
    const data = bytesOf(700); // 100 Chunks a 7 Byte
    let armed = 0, cancelled = 0, live = 0, maxLive = 0;
    const countingTimer: CancellableTimer = (fn, ms) => {
      armed++; live++; maxLive = Math.max(maxLive, live);
      const id = setTimeout(fn, ms);
      return () => { clearTimeout(id); live--; cancelled++; };
    };
    await streamIntoCache(
      opts(fakeCache(), async () => streamResponse(data), { stallMs: 10_000, timer: countingTimer }),
    );
    expect(armed).toBe(101); // einmal vor der Schleife, einmal je Chunk
    expect(maxLive).toBe(1);
    expect(live).toBe(0);
    expect(cancelled).toBe(armed);
  });

  it("ohne stallMs (oder ohne timer) wird gar nicht auf Stillstand geprueft — kein Timer wird gestellt", async () => {
    let armed = 0;
    const countingTimer: CancellableTimer = (fn, ms) => {
      armed++;
      const id = setTimeout(fn, ms);
      return () => { clearTimeout(id); };
    };
    await streamIntoCache(opts(fakeCache(), async () => streamResponse(bytesOf(50)), { timer: countingTimer }));
    expect(armed).toBe(0);
    await streamIntoCache(opts(fakeCache(), async () => streamResponse(bytesOf(50)), { stallMs: 5 }));
    expect(armed).toBe(0);
  });
});

describe("streamIntoCache — Header des Cache-Eintrags", () => {
  it("Default erzwingt content-type octet-stream und uebernimmt KEIN content-encoding der Antwort", async () => {
    const cache = fakeCache();
    await streamIntoCache(
      opts(cache, async () => streamResponse(bytesOf(9), { extraHeaders: { "content-encoding": "gzip", "x-etag": "abc" } })),
    );
    expect(cache.puts.at(0)?.headers.get("content-type")).toBe("application/octet-stream");
    expect(cache.puts.at(0)?.headers.get("content-encoding")).toBeNull();
    expect(cache.puts.at(0)?.headers.get("x-etag")).toBeNull();
  });

  it("putHeaders-Option kopiert die Antwort-Header in den Eintrag", async () => {
    const cache = fakeCache();
    await streamIntoCache(
      opts(cache, async () => streamResponse(bytesOf(9), { extraHeaders: { "x-etag": "abc" } }), { putHeaders: (r) => r.headers }),
    );
    expect(cache.puts.at(0)?.headers.get("x-etag")).toBe("abc");
  });
});

describe("streamIntoCache — Fehler aus den Ports", () => {
  it("scheitert cache.put, wirft streamIntoCache dessen Fehler und raeumt den Schluessel ab", async () => {
    const map = new Map<string, Uint8Array>();
    const deletes: string[] = [];
    const cache: CacheLike = {
      async match(key) { const v = map.get(key); return v === undefined ? undefined : new Response(v as unknown as BodyInit); },
      put: () => Promise.reject(new Error("quota exceeded")),
      async delete(key) { deletes.push(key); return map.delete(key); },
    };
    await expect(streamIntoCache(opts(cache, async () => streamResponse(bytesOf(20))))).rejects.toThrow(/quota exceeded/);
    expect(deletes).toEqual([KEY]);
  });

  it("wirft onChunk (z. B. der Digest), wird der Fehler durchgereicht und der Eintrag verworfen", async () => {
    const cache = fakeCache();
    await expect(
      streamIntoCache(opts(cache, async () => streamResponse(bytesOf(100)), { onChunk: () => { throw new Error("hasher kaputt"); } })),
    ).rejects.toThrow(/hasher kaputt/);
    expect(cache.map.has(KEY)).toBe(false);
    expect(cache.deletes).toEqual([KEY]);
  });
});
