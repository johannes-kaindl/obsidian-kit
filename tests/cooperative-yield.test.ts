import { describe, it, expect, vi } from "vitest";
import { createCooperativeYield, type NowPort } from "../src/pure/cooperative-yield";

// Vereinigung der Testmengen beider Quell-Repos, auf die Einheit „ein tick pro Runde"
// heruntergebrochen:
//   apple-health/tests/core/pipeline-abort.test.ts — exakte Kadenz (2× `toBe(10)`),
//     Verdrahtung bei `yieldEveryMs: 0`, Fortschritt OHNE yieldToUi, Lauf ohne Optionen.
//   obsidian-transmute/tests/vault-run.test.ts — Freigabe in jedem Iterations-Ausgang
//     (die `continue`-Regression aus dem GUI-Smoke 2026-08-16) und die Negativprobe
//     „Uhr steht → keine Freigabe".
// Neu, weil die Parametrisierung sie erst ermöglicht bzw. der Drift sie erzwingt:
// Synchronität der beiden Schranken, Uhr-Lesungen pro tick, Rückgabewert von tick(),
// Stempelzeitpunkt vor dem await, Reihenfolge onDue → yieldToUi.

/** Uhr, deren Wert der Test setzt. Zählt die Lesungen mit — die Kadenz-Tests hängen
 *  davon ab, dass `tick()` genau einmal liest. */
function manualClock(): { port: NowPort; set: (v: number) => void; reads: () => number } {
  let t = 0;
  let reads = 0;
  return {
    port: { now: () => { reads++; return t; } },
    set: (v) => { t = v; },
    reads: () => reads,
  };
}

/** Uhr, die bei JEDER Lesung um `step` vorrückt — obsidian-transmutes Test-Idiom
 *  (`now: () => (t += 300)`). Genau diese Bauart macht eine überzählige Lesung sichtbar. */
function steppingClock(step: number): NowPort {
  let t = 0;
  return { now: () => (t += step) };
}

describe("createCooperativeYield — Kadenz", () => {
  it("yieldet exakt einmal pro Zeitfenster (100 Runden à 10 ms, Schwelle 100 → 10)", async () => {
    // apple-healths schärfste Zusicherung: `expect(yields).toBe(10)`. Ohne funktionierende
    // Zeitschranke (jede Runde oder gar keine) schlägt das fehl.
    const clock = manualClock();
    let now = 0;
    let yields = 0;
    const pacer = createCooperativeYield({
      yieldToUi: () => { yields++; return Promise.resolve(); },
      everyMs: 100,
      clock: clock.port,
    });
    for (let i = 0; i < 100; i++) {
      now += 10;
      clock.set(now);
      await pacer.tick();
    }
    expect(yields).toBe(10);
    expect(yields).toBeLessThan(100);
  });

  it("meldet Fortschritt im selben Zeittakt", async () => {
    const clock = manualClock();
    let now = 0;
    const dues: number[] = [];
    const pacer = createCooperativeYield({
      yieldToUi: () => Promise.resolve(),
      everyMs: 100,
      clock: clock.port,
    });
    for (let i = 0; i < 100; i++) {
      now += 10;
      clock.set(now);
      await pacer.tick(() => { dues.push(i); });
    }
    expect(dues).toHaveLength(10);
  });

  it("meldet Fortschritt auch OHNE yieldToUi", async () => {
    // Regression (apple-health): `onProgress` hing am `yieldToUi`-Guard, sodass ein
    // Aufrufer ohne Renderer — CLI/Batch, der nur loggen will — null Aufrufe bekam.
    const clock = manualClock();
    let now = 0;
    const dues: number[] = [];
    const pacer = createCooperativeYield({ everyMs: 100, clock: clock.port });
    for (let i = 0; i < 100; i++) {
      now += 10;
      clock.set(now);
      const yielded = await pacer.tick(() => { dues.push(i); });
      expect(yielded).toBe(false);
    }
    expect(dues).toHaveLength(10);
  });

  it("yieldet bei everyMs 0 in jeder Runde (Verdrahtungsprüfung, keine Drosselprüfung)", async () => {
    const clock = manualClock();
    let yields = 0;
    const pacer = createCooperativeYield({
      yieldToUi: () => { yields++; return Promise.resolve(); },
      everyMs: 0,
      clock: clock.port,
    });
    for (let i = 0; i < 5; i++) await pacer.tick();
    expect(yields).toBe(5);
  });

  it("verwendet 250 ms als Default-Schrittweite", async () => {
    const clock = manualClock();
    let yields = 0;
    const pacer = createCooperativeYield({
      yieldToUi: () => { yields++; return Promise.resolve(); },
      clock: clock.port,
    });
    clock.set(249);
    await pacer.tick();
    expect(yields).toBe(0);
    clock.set(250);
    await pacer.tick();
    expect(yields).toBe(1);
  });

  it("yieldet nie, solange die Uhr steht", async () => {
    // obsidian-transmutes Negativprobe (`now: () => 0`).
    const yieldToUi = vi.fn(() => Promise.resolve());
    const onDue = vi.fn();
    const pacer = createCooperativeYield({ yieldToUi, everyMs: 250, clock: { now: () => 0 } });
    for (let i = 0; i < 5; i++) expect(await pacer.tick(onDue)).toBe(false);
    expect(yieldToUi).not.toHaveBeenCalled();
    expect(onDue).not.toHaveBeenCalled();
  });

  it("ist ohne Optionen ein No-op, das false liefert", async () => {
    // apple-healths „läuft ohne Optionen unverändert durch". Echte Uhr, zwei Ticks
    // hintereinander — die liegen weit unter den 250 ms Default-Schrittweite.
    const pacer = createCooperativeYield();
    expect(await pacer.tick()).toBe(false);
    expect(await pacer.tick(() => { throw new Error("darf im Fenster nicht feuern"); })).toBe(false);
  });
});

describe("createCooperativeYield — Synchronität der beiden Schranken", () => {
  it("startet beide Barrieren aus EINER Uhr-Lesung: Fortschritt und Freigabe fallen in dieselben Runden", async () => {
    // Der Drift-Befund: obsidian-transmute liest beim Setzen der Barrieren zweimal
    // (`let lastProgress = now(); let lastYield = now();`). Unter der Wanduhr sind das
    // ~0 ms und unsichtbar — unter einer bei jeder Lesung vorrückenden Test-Uhr stehen
    // die Barrieren dauerhaft einen Schritt auseinander und die Schranken feuern in
    // VERSCHIEDENEN Runden. Mit zwei Lesungen ergäbe dieser Lauf [2,5,8] gegen [3,6,9].
    const clock = steppingClock(100);
    const dueRounds: number[] = [];
    const yieldRounds: number[] = [];
    const pacer = createCooperativeYield({
      yieldToUi: () => Promise.resolve(),
      everyMs: 250,
      clock,
    });
    for (let round = 1; round <= 9; round++) {
      const yielded = await pacer.tick(() => { dueRounds.push(round); });
      if (yielded) yieldRounds.push(round);
    }
    expect(dueRounds).toEqual(yieldRounds);
    expect(yieldRounds).toEqual([3, 6, 9]);
  });

  it("liest die Uhr genau einmal bei der Konstruktion und genau einmal je tick", async () => {
    const clock = manualClock();
    const pacer = createCooperativeYield({
      yieldToUi: () => Promise.resolve(),
      everyMs: 0,
      clock: clock.port,
    });
    expect(clock.reads()).toBe(1);
    await pacer.tick(() => { /* feuert, weil everyMs 0 */ });
    expect(clock.reads()).toBe(2);
    await pacer.tick(() => { /* feuert ebenfalls */ });
    expect(clock.reads()).toBe(3);
  });
});

describe("createCooperativeYield — Rückgabewert von tick", () => {
  it("meldet true genau in den Runden, in denen tatsächlich geyieldet wurde", async () => {
    // Grundlage für apple-healths Abbruch-Nachprüfung:
    //   `if (await pacer.tick(onDue) && signal?.aborted) throw new ImportAbortedError();`
    const clock = manualClock();
    let now = 0;
    const results: boolean[] = [];
    const pacer = createCooperativeYield({
      yieldToUi: () => Promise.resolve(),
      everyMs: 100,
      clock: clock.port,
    });
    for (let i = 0; i < 6; i++) {
      now += 50;
      clock.set(now);
      results.push(await pacer.tick());
    }
    // 50-ms-Schritte, 100-ms-Schwelle → jede zweite Runde.
    expect(results).toEqual([false, true, false, true, false, true]);
  });

  it("meldet false ohne yieldToUi, auch wenn die Schranke längst fällig ist", async () => {
    const clock = manualClock();
    const onDue = vi.fn();
    const pacer = createCooperativeYield({ everyMs: 100, clock: clock.port });
    clock.set(10_000);
    expect(await pacer.tick(onDue)).toBe(false);
    expect(onDue).toHaveBeenCalledTimes(1);
  });
});

describe("createCooperativeYield — Reihenfolge und Stempelzeitpunkt", () => {
  it("ruft onDue vor yieldToUi", async () => {
    const log: string[] = [];
    const pacer = createCooperativeYield({
      yieldToUi: () => { log.push("yield"); return Promise.resolve(); },
      everyMs: 0,
      clock: manualClock().port,
    });
    await pacer.tick(() => { log.push("due"); });
    expect(log).toEqual(["due", "yield"]);
  });

  it("stempelt die Yield-Barriere VOR dem await — eine lange Pause verschiebt das Fenster nicht", async () => {
    // Beide Quellfassungen setzen `lastYield = ts` vor `await yieldToUi()`. Stempelte man
    // danach, begänne das Fenster am ENDE der Pause: hier wäre die zweite Runde
    // (1050 − 1000 = 50 < 100) dann keine Freigabe mehr.
    const clock = manualClock();
    let yields = 0;
    const pacer = createCooperativeYield({
      yieldToUi: () => {
        yields++;
        clock.set(1000); // die Pause selbst hat 900 ms gekostet
        return Promise.resolve();
      },
      everyMs: 100,
      clock: clock.port,
    });
    clock.set(100);
    expect(await pacer.tick()).toBe(true);
    clock.set(1050);
    expect(await pacer.tick()).toBe(true);
    expect(yields).toBe(2);
  });

  it("wertet onDue pro Runde aus (per-Iteration gebundener Payload)", async () => {
    // obsidian-transmute meldet `path` aus `for (const path of paths)` — der Payload
    // kann deshalb nicht bei der Konstruktion festgelegt werden. Nur die Runden, in denen
    // die Schranke fällt, dürfen ihren eigenen Wert melden.
    const clock = manualClock();
    let now = 0;
    const seen: string[] = [];
    const pacer = createCooperativeYield({ everyMs: 200, clock: clock.port });
    for (const path of ["a.md", "b.md", "c.md", "d.md"]) {
      now += 100;
      clock.set(now);
      await pacer.tick(() => { seen.push(path); });
    }
    expect(seen).toEqual(["b.md", "d.md"]);
  });
});

describe("createCooperativeYield — Schleifenform", () => {
  it("gibt die Oberfläche in JEDEM Iterations-Ausgang frei, wenn tick am Ende steht", async () => {
    // Regression (obsidian-transmute, GUI-Smoke 2026-08-16): Fortschritt und Freigabe
    // standen hinter dem `continue` für „zu viele Treffer". Ein Muster wie [a-z] reißt
    // diese Grenze in JEDER Datei — ausgerechnet der teuerste Ausgang gab die Oberfläche
    // also nie frei, und der Abbrechen-Knopf war dort Dekoration. 403 grüne Unit-Tests
    // sahen es nicht. Die beiden dortigen Tests (Obergrenze / unlesbare Datei) fallen auf
    // dieser Ebene in einen zusammen: es ist dieselbe Aussage über die Platzierung.
    const clock = steppingClock(300);
    const yieldToUi = vi.fn(() => Promise.resolve());
    const onDue = vi.fn();
    const pacer = createCooperativeYield({ yieldToUi, everyMs: 250, clock });
    const items = ["ok", "too-many", "unreadable", "too-many", "ok"] as const;
    const handled: string[] = [];
    for (const item of items) {
      if (item === "unreadable") {
        handled.push("skip");
      } else if (item === "too-many") {
        handled.push("cap"); // der teuerste Ausgang — früher hier: `continue`
      } else {
        handled.push("scan");
      }
      // Bewusst OHNE `continue` darüber: tick MUSS in jedem Ausgang erreicht werden.
      await pacer.tick(onDue);
    }
    expect(handled).toHaveLength(5);
    expect(yieldToUi).toHaveBeenCalledTimes(5);
    expect(onDue).toHaveBeenCalledTimes(5);
  });
});

describe("createCooperativeYield — Uhr-Default und Fehlerpfade", () => {
  it("nutzt ohne clock-Option Date.now() (vi.spyOn(Date, \"now\") bleibt wirksam)", async () => {
    // apple-healths bestehende Tests patchen `Date.now`. Der Default `clock = Date` schlägt
    // `now` bei jedem Aufruf frisch auf dem Objekt nach — deshalb greift der Spy weiter.
    let now = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => now);
    let yields = 0;
    try {
      const pacer = createCooperativeYield({
        yieldToUi: () => { yields++; return Promise.resolve(); },
        everyMs: 100,
      });
      for (let i = 0; i < 100; i++) {
        now += 10;
        await pacer.tick();
      }
    } finally {
      spy.mockRestore();
    }
    expect(yields).toBe(10);
  });

  it("reicht einen Fehler aus yieldToUi durch", async () => {
    const pacer = createCooperativeYield({
      yieldToUi: () => Promise.reject(new Error("Renderer weg")),
      everyMs: 0,
      clock: manualClock().port,
    });
    await expect(pacer.tick()).rejects.toThrow("Renderer weg");
  });

  it("reicht einen Fehler aus onDue durch", async () => {
    const pacer = createCooperativeYield({ everyMs: 0, clock: manualClock().port });
    await expect(pacer.tick(() => { throw new Error("Anzeige kaputt"); }))
      .rejects.toThrow("Anzeige kaputt");
  });
});
