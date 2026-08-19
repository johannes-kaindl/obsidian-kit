import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../src/pure/clipboard";

// Vereinigung der Testmengen beider Quell-Repos:
// - apple-health/tests/obsidian/clipboard.test.ts (3 Faelle: kein Throw ohne API, Callback bei
//   Erfolg mit dem uebergebenen Text, abgelehntes writeText schlaegt nicht durch)
// - json_viewer/tests/obsidian/clipboard.test.ts + CopyButton.test.ts (Erfolgspfad, fehlende API
//   meldet SYNCHRON — dort als Notice unmittelbar nach dem Klick geprueft)
// Dazu die Faelle, die erst durch die Parametrisierung entstehen (reason/error, Promise<boolean>)
// und je ein Regressionstest fuer die im Schnitt gemessenen Defekte: ungeschuetzter
// Property-Read, fehlendes `writeText`, synchron werfendes `writeText`.

/** Ruft `call` und weist nach, dass dabei synchron nichts fliegt — die zentrale Zusage des
 *  Moduls. Gibt das Promise weiter, damit der Test auch sein Ergebnis pruefen kann. */
function noThrow(call: () => Promise<boolean>): Promise<boolean> {
  let result!: Promise<boolean>;
  expect(() => { result = call(); }).not.toThrow();
  return result;
}

/** `navigator` mit genau diesem `writeText` unterschieben. */
function stubClipboard(writeText: unknown): void {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("writeClipboard — Erfolgspfad", () => {
  it("schreibt den uebergebenen Text und ruft onCopied genau einmal", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onCopied = vi.fn();
    const onFailed = vi.fn();

    await expect(writeClipboard("hallo", { onCopied, onFailed })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hallo");
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("kommt ohne Optionen aus (Fire-and-forget, markdown-presentation)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    await expect(noThrow(() => writeClipboard("theme-key"))).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("theme-key");
  });

  it("reicht den leeren String durch, statt ihn als Fehlschlag umzudeuten", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    await expect(writeClipboard("")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });

  it("akzeptiert ein writeText, das gar kein Promise liefert (WebView-Shim)", async () => {
    const writeText = vi.fn().mockReturnValue(undefined);
    stubClipboard(writeText);
    const onCopied = vi.fn();

    // Ohne die Promise.resolve-Umhuellung waere `.then` hier ein synchroner TypeError.
    await expect(noThrow(() => writeClipboard("x", { onCopied }))).resolves.toBe(true);
    expect(onCopied).toHaveBeenCalledTimes(1);
  });
});

describe("writeClipboard — Clipboard-API nicht vorhanden", () => {
  it("ohne navigator.clipboard: kein Throw, kein onCopied, false", async () => {
    vi.stubGlobal("navigator", {});
    const onCopied = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onCopied }))).resolves.toBe(false);
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("meldet reason=unavailable mit einem gesetzten Fehler (nie undefined)", async () => {
    vi.stubGlobal("navigator", {});
    const onFailed = vi.fn();

    await writeClipboard("x", { onFailed });
    expect(onFailed).toHaveBeenCalledTimes(1);
    const [reason, error] = onFailed.mock.calls[0] ?? [];
    expect(reason).toBe("unavailable");
    expect(error).toBeInstanceOf(Error);
    // obsidian-transmute baut die Meldung aus err.message — der darf nicht leer sein.
    expect(String((error as Error).message)).not.toBe("");
  });

  it("ruft onFailed SYNCHRON, noch vor der Rueckgabe", async () => {
    // Load-bearing: json_viewer prueft die Fehler-Notice unmittelbar nach btn.click(),
    // ohne Microtask-Flush. Ein deferred Aufruf braeche diesen Test still.
    vi.stubGlobal("navigator", {});
    const seen: string[] = [];

    const pending = writeClipboard("x", { onFailed: (reason) => { seen.push(reason); } });
    expect(seen).toEqual(["unavailable"]);
    await expect(pending).resolves.toBe(false);
  });

  it("faengt einen WERFENDEN Property-Read ab — der Bug beider Vorlagen", async () => {
    // Weder json_viewer noch apple-health umschliessen `navigator.clipboard` mit try,
    // obwohl beide Doc-Kommentare genau diesen Fall als Begruendung nennen.
    const boom = new Error("insecure context");
    vi.stubGlobal("navigator", Object.defineProperty({}, "clipboard", {
      configurable: true,
      get(): never { throw boom; },
    }));
    const onFailed = vi.fn();
    const onCopied = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onCopied, onFailed }))).resolves.toBe(false);
    expect(onFailed).toHaveBeenCalledWith("unavailable", boom);
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("faengt ein fehlendes globales navigator ab", async () => {
    vi.stubGlobal("navigator", undefined);
    const onFailed = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onFailed }))).resolves.toBe(false);
    expect(onFailed.mock.calls[0]?.[0]).toBe("unavailable");
  });

  it("faengt ein clipboard-Objekt ohne writeText ab", async () => {
    vi.stubGlobal("navigator", { clipboard: {} });
    const onFailed = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onFailed }))).resolves.toBe(false);
    expect(onFailed.mock.calls[0]?.[0]).toBe("unavailable");
  });
});

describe("writeClipboard — Schreiben schlaegt fehl", () => {
  it("abgelehntes writeText schlaegt nicht durch und ruft kein onCopied", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const onCopied = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onCopied }))).resolves.toBe(false);
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("reicht den Ablehnungsgrund unveraendert an onFailed weiter", async () => {
    const cause = new Error("Document is not focused");
    stubClipboard(vi.fn().mockRejectedValue(cause));
    const onFailed = vi.fn();

    await writeClipboard("x", { onFailed });
    expect(onFailed).toHaveBeenCalledWith("denied", cause);
  });

  it("das zurueckgegebene Promise rejectet nie", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("nope")));

    const settled = await writeClipboard("x").then(
      (value) => ({ rejected: false, value }),
      () => ({ rejected: true, value: null }),
    );
    expect(settled).toEqual({ rejected: false, value: false });
  });

  it("faengt ein synchron werfendes writeText ab", async () => {
    const boom = new Error("shim exploded");
    stubClipboard(vi.fn().mockImplementation(() => { throw boom; }));
    const onFailed = vi.fn();

    await expect(noThrow(() => writeClipboard("x", { onFailed }))).resolves.toBe(false);
    expect(onFailed).toHaveBeenCalledWith("denied", boom);
  });

  it("meldet Fehlschlag genau einmal, nicht zusaetzlich als unavailable", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("nope")));
    const onFailed = vi.fn();

    await writeClipboard("x", { onFailed });
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
