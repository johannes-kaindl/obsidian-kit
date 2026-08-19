import { describe, it, expect } from "vitest";
import { makeRunState, type RunState } from "../src/pure/run-state";

// Vereinigungsmenge der Testmengen der drei Quell-Repos, jeweils gegen eine konkrete
// Instanziierung gefahren, damit die Zusicherungen wörtlich erhalten bleiben:
//   apple-health/tests/core/import-state.test.ts   (8 Fälle)
//   obsidian-transmute/tests/vault-state.test.ts   (9 Fälle)
//   audio-interface/tests/core/run-state.test.ts   (5 Fälle)
// Dazu die Fälle, die erst durch die Parametrisierung entstehen (§ "Parametrisierung"),
// und je ein Regressionstest für die drei beim Heben gemessenen Drift-Befunde (§ "Drift").

// ── Instanz 1: apple-health (Import) ────────────────────────────────────────────────
type ImportPhase = "unzipping" | "parsing" | "writing";
const imp = makeRunState<ImportPhase, { records: number; fileName: string }, { records: number }>({
  abortableIn: (p) => p !== "writing",
});
const started = (fileName: string, phase: ImportPhase) => imp.begin(phase, { records: 0, fileName });

// ── Instanz 2: obsidian-transmute (Vault-Lauf) ──────────────────────────────────────
type RunPhase = "reading" | "matching" | "writing" | "restoring";
const vault = makeRunState<RunPhase, { done: number; total: number; path: string }, { files: number; hits: number }>({
  abortableIn: (p) => p === "reading" || p === "matching",
  onPhaseChange: () => ({ done: 0, path: "" }),
});
const runStarted = (total: number) => vault.begin("reading", { done: 0, total, path: "" });

// ── Instanz 3: audio-interface (Synthese/Export) ────────────────────────────────────
type ExportPhase = "preparing" | "downloading" | "synthesizing" | "encoding" | "writing";
const exp = makeRunState<ExportPhase, { done: number; total: number }, { detail: string }>({
  abortableIn: (p) => p !== "writing",
});
const begun = (phase: ExportPhase) => exp.begin(phase, { done: 0, total: 0 });

describe("run-state — apple-health-Fassung (Import)", () => {
  it("startet im Leerlauf und geht mit dem Dateinamen in den Lauf", () => {
    expect(imp.IDLE).toEqual({ status: "idle" });
    expect(started("Export.zip", "unzipping")).toEqual({
      status: "running", phase: "unzipping", records: 0, fileName: "Export.zip",
    });
  });

  // Eine direkt gewählte .xml durchläuft nie eine Entpack-Phase — der Aufrufer
  // (import-controller.ts) startet sie daher direkt in "parsing".
  it("startet eine .xml direkt in der Phase parsing, ohne unzipping", () => {
    expect(started("Export.xml", "parsing")).toEqual({
      status: "running", phase: "parsing", records: 0, fileName: "Export.xml",
    });
  });

  it("zählt Records und wechselt Phasen, ohne den Dateinamen zu verlieren", () => {
    const s1 = imp.progress(started("Export.zip", "unzipping"), { records: 250_000 });
    expect(s1).toEqual({
      status: "running", phase: "unzipping", records: 250_000, fileName: "Export.zip",
    });
    const s2 = imp.progress(s1, { phase: "parsing" });
    expect(s2).toEqual({
      status: "running", phase: "parsing", records: 250_000, fileName: "Export.zip",
    });
  });

  it("ignoriert Fortschritt und Phasenwechsel, wenn nicht gelaufen wird", () => {
    expect(imp.progress(imp.IDLE, { records: 5 })).toBe(imp.IDLE);
    expect(imp.progress(imp.IDLE, { phase: "parsing" })).toBe(imp.IDLE);
  });

  it("schließt mit Erfolg, Abbruch oder Fehler ab", () => {
    expect(imp.finish(started("Export.zip", "unzipping"), { records: 5_719_032 }))
      .toEqual({ status: "done", records: 5_719_032 });
    expect(imp.abort(started("Export.zip", "unzipping"))).toEqual({ status: "aborted" });
    expect(imp.fail(started("Export.zip", "unzipping"), "kaputt"))
      .toEqual({ status: "failed", message: "kaputt" });
  });

  // Regel 1: Der Abbruch bricht den Stream ab, was in aller Regel noch einen Fehler nach
  // sich zieht. Der darf den Abbruch nicht überschreiben — sonst sieht der Nutzer
  // "fehlgeschlagen", obwohl er selbst abgebrochen hat.
  it("lässt einen Fehler nach dem Abbruch den Abbruch nicht überschreiben", () => {
    const abgebrochen = imp.abort(started("Export.zip", "unzipping"));
    expect(imp.fail(abgebrochen, "stream closed")).toEqual({ status: "aborted" });
  });

  it("bricht aus dem Leerlauf heraus nicht ab", () => {
    expect(imp.abort(imp.IDLE)).toBe(imp.IDLE);
  });

  // Symmetrisch zu fail(): Wird während des abschließenden Schreibens abgebrochen, darf ein
  // danach ankommendes finish() den Abbruch nicht überschreiben — sonst meldet die UI einen
  // Erfolg, den der Nutzer bereits abgebrochen gesehen hat.
  it("lässt einen Erfolg nach dem Abbruch den Abbruch nicht überschreiben", () => {
    const abgebrochen = imp.abort(started("Export.zip", "unzipping"));
    expect(imp.finish(abgebrochen, { records: 5_719_032 })).toEqual({ status: "aborted" });
  });
});

describe("run-state — obsidian-transmute-Fassung (Vault-Lauf)", () => {
  it("startet in der Lesephase mit bekannter Gesamtzahl", () => {
    expect(runStarted(412)).toEqual({ status: "running", phase: "reading", done: 0, total: 412, path: "" });
  });

  it("zaehlt Fortschritt mit und merkt sich den Pfad", () => {
    expect(vault.progress(runStarted(412), { done: 17, path: "a.md" }))
      .toMatchObject({ status: "running", done: 17, path: "a.md" });
  });

  it("ignoriert Fortschritt, wenn der Lauf nicht laeuft", () => {
    expect(vault.progress(vault.IDLE, { done: 5, path: "a.md" })).toBe(vault.IDLE);
  });

  it("wechselt die Phase und setzt den Zaehler zurueck", () => {
    const s = vault.progress(vault.progress(runStarted(10), { done: 10, path: "a.md" }), { phase: "writing" });
    expect(s).toMatchObject({ status: "running", phase: "writing", done: 0, path: "", total: 10 });
  });

  it("ein Abbruch ueberlebt einen nachfolgenden Fehler", () => {
    const abgebrochen = vault.abort(runStarted(10));
    expect(vault.fail(abgebrochen, "stream kaputt")).toEqual({ status: "aborted" });
  });

  it("ein Abbruch ueberschreibt kein fertiges Ergebnis", () => {
    const fertig = vault.finish(runStarted(10), { files: 10, hits: 40 });
    expect(vault.abort(fertig)).toBe(fertig);
  });

  it("erlaubt Abbruch beim Lesen und Rechnen", () => {
    expect(vault.canAbort(runStarted(10))).toBe(true);
    expect(vault.canAbort(vault.progress(runStarted(10), { phase: "matching" }))).toBe(true);
  });

  it("verweigert den Abbruch in der Schreibphase", () => {
    expect(vault.canAbort(vault.progress(runStarted(10), { phase: "writing" }))).toBe(false);
    expect(vault.canAbort(vault.progress(runStarted(10), { phase: "restoring" }))).toBe(false);
  });

  it("verweigert den Abbruch im Ruhezustand", () => {
    expect(vault.canAbort(vault.IDLE)).toBe(false);
  });
});

describe("run-state — audio-interface-Fassung (Export)", () => {
  it("begin → running mit Phase, progress aktualisiert nur im running", () => {
    const s = begun("preparing");
    expect(s).toEqual({ status: "running", phase: "preparing", done: 0, total: 0 });
    expect(exp.progress(s, { phase: "synthesizing", done: 2, total: 5 }))
      .toEqual({ status: "running", phase: "synthesizing", done: 2, total: 5 });
    expect(exp.progress(exp.IDLE, { phase: "synthesizing", done: 2, total: 5 })).toBe(exp.IDLE);
  });

  it("abort: running (nicht writing) → aborted; writing bleibt; idle bleibt", () => {
    expect(exp.abort(begun("synthesizing"))).toEqual({ status: "aborted" });
    const w = exp.progress(begun("writing"), { phase: "writing", done: 0, total: 1 });
    expect(exp.abort(w)).toBe(w);
    expect(exp.abort(exp.IDLE)).toBe(exp.IDLE);
    expect(exp.canAbort(begun("downloading"))).toBe(true);
    expect(exp.canAbort(w)).toBe(false);
    expect(exp.canAbort(exp.IDLE)).toBe(false);
  });

  it("ein Fehler nach Abbruch überschreibt den Abbruch nicht", () => {
    const a = exp.abort(begun("downloading"));
    expect(exp.fail(a, "stream closed")).toBe(a);
    expect(exp.fail(begun("downloading"), "404")).toEqual({ status: "failed", message: "404" });
  });

  it("finish nach Abbruch bleibt aborted; sonst done mit Detail", () => {
    const a = exp.abort(begun("synthesizing"));
    expect(exp.finish(a, { detail: "x.wav" })).toBe(a);
    expect(exp.finish(begun("writing"), { detail: "x.wav" })).toEqual({ status: "done", detail: "x.wav" });
  });

  it("isBusy nur bei running", () => {
    expect(exp.isBusy(begun("preparing"))).toBe(true);
    expect(exp.isBusy(exp.IDLE)).toBe(false);
    expect(exp.isBusy(exp.finish(begun("writing"), { detail: "" }))).toBe(false);
    expect(exp.isBusy(exp.abort(begun("preparing")))).toBe(false);
    expect(exp.isBusy(exp.fail(begun("preparing"), "x"))).toBe(false);
  });
});

// ── Neu durch die Parametrisierung ──────────────────────────────────────────────────

describe("run-state — Defaults ohne Konfiguration", () => {
  type P = "a" | "b";
  const bare = makeRunState<P>();

  it("ohne abortableIn ist jede laufende Phase abbrechbar", () => {
    expect(bare.canAbort(bare.begin("a", {}))).toBe(true);
    expect(bare.canAbort(bare.begin("b", {}))).toBe(true);
    expect(bare.abort(bare.begin("b", {}))).toEqual({ status: "aborted" });
    expect(bare.canAbort(bare.IDLE)).toBe(false);
  });

  it("ohne onPhaseChange lässt ein Phasenwechsel die Nutzlast unangetastet", () => {
    const keep = makeRunState<P, { n: number }>();
    const s = keep.progress(keep.begin("a", { n: 42 }), { phase: "b" });
    expect(s).toEqual({ status: "running", phase: "b", n: 42 });
  });

  it("kommt ohne Nutzlast-Typen aus (Default-Typparameter)", () => {
    expect(bare.begin("a", {})).toEqual({ status: "running", phase: "a" });
    expect(bare.finish(bare.begin("a", {}), {})).toEqual({ status: "done" });
  });

  it("IDLE ist ein Singleton je Fabrik-Instanz, aber je Instanz ein eigenes", () => {
    expect(bare.IDLE).toBe(bare.IDLE);
    expect(bare.IDLE).not.toBe(imp.IDLE);
    expect(bare.IDLE).toEqual(imp.IDLE);
  });
});

describe("run-state — onPhaseChange", () => {
  type P = "a" | "b";
  const seen: Array<{ n: number; next: P }> = [];
  const reset = makeRunState<P, { n: number }>({
    onPhaseChange: (payload, next) => { seen.push({ n: payload.n, next }); return { n: 0 }; },
  });

  it("bekommt die laufende Nutzlast und die neue Phase", () => {
    seen.length = 0;
    reset.progress(reset.begin("a", { n: 7 }), { phase: "b" });
    expect(seen).toEqual([{ n: 7, next: "b" }]);
  });

  // Load-bearing: apple-health ruft seinen Phasenwechsel auf JEDEM Fortschritts-Tick mit
  // derselben Phase auf (import-controller.ts:60). Feuerte onPhaseChange bei jedem gesetzten
  // `phase`, würde ein dort später konfigurierter Reset den Zähler bei jedem Tick nullen.
  it("feuert NICHT, wenn die Phase gleich bleibt", () => {
    seen.length = 0;
    const s1 = reset.progress(reset.begin("a", { n: 5 }), { phase: "a" });
    expect(s1).toEqual({ status: "running", phase: "a", n: 5 });
    const s2 = reset.progress(s1, { phase: "a", n: 9 });
    expect(s2).toEqual({ status: "running", phase: "a", n: 9 });
    expect(seen).toEqual([]);
  });

  it("feuert nicht bei einem Patch ganz ohne Phase", () => {
    seen.length = 0;
    expect(reset.progress(reset.begin("a", { n: 5 }), { n: 6 }))
      .toEqual({ status: "running", phase: "a", n: 6 });
    expect(seen).toEqual([]);
  });

  it("ein explizit mitgegebener Wert schlägt den Reset", () => {
    seen.length = 0;
    expect(reset.progress(reset.begin("a", { n: 5 }), { phase: "b", n: 3 }))
      .toEqual({ status: "running", phase: "b", n: 3 });
  });

  it("feuert nicht aus einem nicht-laufenden Zustand", () => {
    seen.length = 0;
    expect(reset.progress(reset.IDLE, { phase: "b" })).toBe(reset.IDLE);
    expect(seen).toEqual([]);
  });
});

describe("run-state — Patch-Kanten", () => {
  it("`phase: undefined` heißt „unverändert“, nicht „Phase löschen“", () => {
    const s = imp.progress(started("Export.zip", "parsing"), { phase: undefined, records: 3 });
    expect(s).toEqual({ status: "running", phase: "parsing", records: 3, fileName: "Export.zip" });
  });

  it("eine Nutzlast mit eigenem `status`/`phase`-Feld kippt den Diskriminator nicht", () => {
    const odd = makeRunState<"a", { status: string; phase: string; note: string }>();
    const s = odd.begin("a", { status: "boom", phase: "zzz", note: "x" });
    expect(s).toMatchObject({ status: "running", phase: "a", note: "x" });
  });

  it("begin ist bewusst ungewächtelt — ein neuer Lauf startet aus jedem Zustand", () => {
    const nachFehler = imp.fail(started("a.zip", "parsing"), "kaputt");
    expect(started("b.zip", "parsing")).toEqual({
      status: "running", phase: "parsing", records: 0, fileName: "b.zip",
    });
    expect(nachFehler).toEqual({ status: "failed", message: "kaputt" });
  });
});

// ── Regressionen zu den drei beim Heben gemessenen Drift-Befunden ────────────────────

describe("run-state — Drift-Befund A: abort und canAbort sind DASSELBE Prädikat", () => {
  // Gemessen: derselbe Aufruf ergab in den drei Kopien verschiedene Ergebnisse —
  // abort(running/writing) lieferte in audio-interface `running/writing`, in apple-health
  // dagegen `aborted`, weil dessen Zustandsmodul Regel 2 gar nicht trug.
  it("verweigert den Abbruch in der Schreibphase auch im Übergang, nicht nur in der UI", () => {
    const schreibend = imp.progress(started("Export.zip", "unzipping"), { phase: "writing" });
    expect(imp.canAbort(schreibend)).toBe(false);
    expect(imp.abort(schreibend)).toBe(schreibend);
  });

  it("stimmt für jede Phase mit canAbort überein", () => {
    const phasen: RunPhase[] = ["reading", "matching", "writing", "restoring"];
    for (const p of phasen) {
      const s = vault.progress(runStarted(3), { phase: p });
      const nachher: RunState<RunPhase, { done: number; total: number; path: string }, { files: number; hits: number }> = vault.abort(s);
      expect(nachher === s).toBe(!vault.canAbort(s));
    }
  });
});

describe("run-state — Drift-Befund C: Endzustände sind endgültig", () => {
  // In allen drei Quell-Fassungen überschrieb fail(done, msg) ein fertiges Ergebnis; die
  // Symmetrie, die für `aborted` in drei Kommentarblöcken begründet wird, fehlte für `done`.
  it("ein Fehler überschreibt kein fertiges Ergebnis", () => {
    const fertig = imp.finish(started("Export.zip", "parsing"), { records: 12 });
    expect(imp.fail(fertig, "zu spät")).toBe(fertig);
  });

  it("ein Erfolg überschreibt kein fertiges Ergebnis", () => {
    const fertig = vault.finish(runStarted(10), { files: 10, hits: 40 });
    expect(vault.finish(fertig, { files: 0, hits: 0 })).toBe(fertig);
  });

  // apple-health und audio-interface wächtelten finish nur gegen `aborted` und erzeugten
  // aus `idle` einen done-Zustand aus dem Nichts.
  it("aus dem Leerlauf entsteht kein Ergebnis aus dem Nichts", () => {
    expect(imp.finish(imp.IDLE, { records: 99 })).toBe(imp.IDLE);
    expect(exp.finish(exp.IDLE, { detail: "x.wav" })).toBe(exp.IDLE);
  });

  it("aus dem Leerlauf entsteht kein Fehler aus dem Nichts", () => {
    expect(imp.fail(imp.IDLE, "nichts läuft")).toBe(imp.IDLE);
  });

  it("ein gescheiterter Lauf bleibt gescheitert", () => {
    const kaputt = imp.fail(started("Export.zip", "parsing"), "kaputt");
    expect(imp.progress(kaputt, { records: 1 })).toBe(kaputt);
    expect(imp.abort(kaputt)).toBe(kaputt);
    expect(imp.finish(kaputt, { records: 1 })).toBe(kaputt);
    expect(imp.fail(kaputt, "noch kaputter")).toBe(kaputt);
  });

  it("ein abgebrochener Lauf bleibt abgebrochen", () => {
    const weg = exp.abort(begun("downloading"));
    expect(exp.progress(weg, { done: 1 })).toBe(weg);
    expect(exp.abort(weg)).toBe(weg);
    expect(exp.finish(weg, { detail: "x" })).toBe(weg);
    expect(exp.fail(weg, "danach")).toBe(weg);
  });
});
