import { describe, it, expect } from "vitest";
import { buildFilename, sanitizeFilename } from "../src/pure/filename-template";

/* Vereinigung der Testmengen der drei Quell-Repos —
 *   yijing-oracle/tests/filename.test.ts        (8 Fälle, strip-Semantik)
 *   obsidian-paperize/tests/core/filename.test.ts (11 Fälle, replace + lastResort)
 *   obsidian-letterhead/tests/core/filename.test.ts (Fälle zu buildFilename/sanitizeFilename;
 *     isoDate/migrateFilenameTemplate/PLACEHOLDERS bleiben repo-lokal und fehlen hier bewusst)
 * — plus die Fälle, die erst durch die Parametrisierung entstehen (onInvalid, fallbacks,
 * lastResort) und je einen Regressionstest für die im Schnitt gemessenen Defekte.
 *
 * Die Werte-Maps unten sind exakt das, was der jeweilige lokale Shim in Phase 3 baut:
 * Feld-Kappung (yijings slugQuestion, letterheads clip) ist dort schon passiert. */

const STRIP = { onInvalid: "strip" } as const;

/** yijing-oracle: strip, ein Fallback-Template, KEIN lastResort. */
const yijingOpts = { onInvalid: "strip", fallbacks: ["{date} {time} {hexpair}"] } as const;
const Y = (over: Record<string, string> = {}): Record<string, string> => ({
  date: "2026-07-12",
  time: "1034",
  hex: "3",
  resulting: "54",
  hexpair: "H3-H54",
  question: "",
  ...over,
});

/** obsidian-paperize: replace, Fallback auf den Titel, dann die Konstante. */
const paperizeOpts = { fallbacks: ["{title}"], lastResort: "Dokument" } as const;
const P = (over: Record<string, string> = {}): Record<string, string> => ({
  title: "Mein Bericht",
  date: "2026-07-16",
  time: "1435",
  folder: "Projekte",
  version: "1",
  ...over,
});

/** obsidian-letterhead: replace, Fallback auf den Notiznamen, dann die Konstante. */
const letterheadOpts = { fallbacks: ["{notiz}"], lastResort: "Brief" } as const;
const L = (over: Record<string, string> = {}): Record<string, string> => ({
  notiz: "Beispielbrief",
  datum: "2026-06-09",
  datum_lang: "9.6.2026",
  empfaenger: "Mustermann GmbH",
  betreff: "Angebot Nr. 2026-0042",
  unserzeichen: "JK-2026-07",
  ...over,
});

describe("sanitizeFilename", () => {
  it("ersetzt OS-illegale Zeichen per Default durch _ (paperize)", () => {
    expect(sanitizeFilename("a/b:c?")).toBe("a_b_c_");
  });

  it("ersetzt auch die Obsidian-eigenen Zeichen # ^ [ ] (paperize)", () => {
    expect(sanitizeFilename("a#b^c[d]e")).toBe("a_b_c_d_e");
  });

  it("deckt die vollständige Zeichenklasse ab (letterhead)", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("a_b_c_d_e_f_g_h_i_j_k_l_m_n");
  });

  it("kollabiert Whitespace und trimmt (paperize, letterhead)", () => {
    expect(sanitizeFilename("  a   b  ")).toBe("a b");
    expect(sanitizeFilename("  Herr   Max   Mustermann  ")).toBe("Herr Max Mustermann");
  });

  it("leere Eingabe → leere Ausgabe (paperize)", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("kann keinen Path-Traversal durchschmuggeln (letterhead)", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("../../etc/passwd", STRIP)).not.toContain("/");
  });

  it("onInvalid:'strip' löscht statt zu ersetzen (yijing)", () => {
    expect(sanitizeFilename("  a  /  b:c  ", STRIP)).toBe("a bc");
  });

  // Neu durch die Parametrisierung: die beiden ratifizierten Semantiken stehen
  // nebeneinander, und der Default ist die replace-Seite.
  it("strip und replace unterscheiden sich NUR im Ersatzzeichen", () => {
    expect(sanitizeFilename("Re: A/B")).toBe("Re_ A_B");
    expect(sanitizeFilename("Re: A/B", STRIP)).toBe("Re AB");
  });

  it("ohne Optionen gilt replace — leeres Options-Objekt ändert daran nichts", () => {
    expect(sanitizeFilename("a/b")).toBe("a_b");
    expect(sanitizeFilename("a/b", {})).toBe("a_b");
    expect(sanitizeFilename("a/b", { onInvalid: "replace" })).toBe("a_b");
  });

  // Regression: der (s || "")-Nullguard stand nur in letterhead. yijing und paperize
  // werfen heute bei undefined — ein Defekt unterhalb der Schwelle, weil getypt unerreichbar.
  it("wirft nicht, wenn ein untypisierter Aufrufer undefined hereinreicht", () => {
    expect(sanitizeFilename(undefined as unknown as string)).toBe("");
    expect(sanitizeFilename(null as unknown as string, STRIP)).toBe("");
  });
});

describe("buildFilename — Substitution", () => {
  it("füllt die dokumentierten Platzhalter (letterhead)", () => {
    expect(buildFilename("{datum} {empfaenger}", L(), letterheadOpts)).toBe("2026-06-09 Mustermann GmbH");
    expect(buildFilename("{datum_lang}", L(), letterheadOpts)).toBe("9.6.2026");
    expect(buildFilename("{notiz}", L(), letterheadOpts)).toBe("Beispielbrief");
    expect(buildFilename("{unserzeichen} {betreff}", L(), letterheadOpts)).toBe("JK-2026-07 Angebot Nr. 2026-0042");
  });

  it("löst jeden Platzhalter eines Schemas auf (paperize)", () => {
    expect(buildFilename("{title} {date} {time} {folder} v{version}", P(), paperizeOpts))
      .toBe("Mein Bericht 2026-07-16 1435 Projekte v1");
  });

  it("behandelt alles ausserhalb der Klammern als Literal (letterhead)", () => {
    expect(buildFilename("Brief an {empfaenger} vom {datum}", L(), letterheadOpts))
      .toBe("Brief an Mustermann GmbH vom 2026-06-09");
  });

  it("lässt einen unbekannten Platzhalter wörtlich stehen (paperize, letterhead)", () => {
    expect(buildFilename("{title} {foo}", P(), paperizeOpts)).toBe("Mein Bericht {foo}");
    expect(buildFilename("{foo} {datum}", L(), letterheadOpts)).toBe("{foo} 2026-06-09");
  });

  it("ist case-sensitiv (letterhead)", () => {
    expect(buildFilename("{Datum}", L(), letterheadOpts)).toBe("{Datum}");
  });

  it("sanitisiert das aufgelöste Ergebnis (paperize)", () => {
    expect(buildFilename("{title}", P({ title: "A/B" }), paperizeOpts)).toBe("A_B");
  });

  it("kollabiert die Lücke eines leeren Platzhalters (paperize: Notiz im Vault-Root)", () => {
    expect(buildFilename("{title} {folder}", P({ folder: "" }), paperizeOpts)).toBe("Mein Bericht");
  });

  it("ein leerer Wert ist ein Wert, kein unbekannter Platzhalter (yijing)", () => {
    expect(buildFilename("{date} {question}", Y({ question: "" }), yijingOpts)).toBe("2026-07-12");
  });

  it("sanitisiert mit strip, wenn onInvalid so gesetzt ist (yijing)", () => {
    expect(buildFilename("{question} {hexpair}", Y({ question: 'a/b:c*?"<>|' }), yijingOpts))
      .toBe("abc H3-H54");
    expect(buildFilename("{hex}→{resulting} {question}", Y({ question: "Was jetzt" }), yijingOpts))
      .toBe("3→54 Was jetzt");
  });

  it("jeder Platzhalter der Wertemap substituiert wirklich (letterhead)", () => {
    for (const key of Object.keys(L())) {
      expect(buildFilename(`{${key}}`, L(), letterheadOpts)).not.toBe(`{${key}}`);
    }
  });
});

describe("buildFilename — Prototyp-Guard (gemessener Live-Bug in yijing + paperize)", () => {
  /* Mit `subs[key] ?? "{key}"` ist subs["toString"] bei einer als Objekt-Literal gebauten
     Map Function.prototype.toString statt undefined — der Literal-Fallback feuert nie und
     der Funktions-Quelltext landet im Dateinamen. Das Schema ist in allen drei Repos ein
     freies Textfeld im Settings-Tab. Der Guard sitzt hier im Kit, deshalb baut der Aufrufer
     seine Map bewusst weiter als gewöhnliches Literal — genau wie unten. */
  const PROTO_KEYS = [
    "toString", "constructor", "valueOf", "hasOwnProperty", "isPrototypeOf",
    "toLocaleString", "propertyIsEnumerable", "__proto__", "__defineGetter__",
  ];

  it("leakt keine Object.prototype-Member in den Dateinamen", () => {
    for (const key of PROTO_KEYS) {
      const out = buildFilename(`{${key}}`, L(), letterheadOpts);
      expect(out).toBe(`{${key}}`);
      expect(out).not.toMatch(/function|native code|\[object/i);
    }
  });

  it("gilt auch für die strip-Semantik und ohne lastResort", () => {
    for (const key of PROTO_KEYS) {
      expect(buildFilename(`{${key}}`, Y(), yijingOpts)).toBe(`{${key}}`);
    }
  });

  it("der Guard blockiert nicht zu viel: ein EIGENES Feld namens toString substituiert", () => {
    expect(buildFilename("{toString}", { toString: "Titel" })).toBe("Titel");
  });

  it("ein eigenes Feld mit undefined-Wert bleibt literal statt 'undefined' zu schreiben", () => {
    const leaky = { title: undefined } as unknown as Record<string, string>;
    expect(buildFilename("{title}", leaky, { lastResort: "Dokument" })).toBe("{title}");
  });
});

describe("buildFilename — Fallback-Kette", () => {
  it("leeres Schema → Fallback-Template (yijing)", () => {
    expect(buildFilename("", Y(), yijingOpts)).toBe("2026-07-12 1034 H3-H54");
  });

  it("leeres Schema → Titel (paperize)", () => {
    expect(buildFilename("", P(), paperizeOpts)).toBe("Mein Bericht");
  });

  it("Schema und Titel leer → lastResort (paperize)", () => {
    expect(buildFilename("", P({ title: "" }), paperizeOpts)).toBe("Dokument");
  });

  it("weg-sanitisiertes Schema → Notizname (letterhead)", () => {
    expect(buildFilename("{empfaenger}", L({ empfaenger: "" }), letterheadOpts)).toBe("Beispielbrief");
    expect(buildFilename("   ", L(), letterheadOpts)).toBe("Beispielbrief");
  });

  it("auch der Notizname leer → 'Brief' (letterhead)", () => {
    expect(buildFilename("{empfaenger}", L({ empfaenger: "", notiz: "" }), letterheadOpts)).toBe("Brief");
  });

  it("liefert für kein Platzhalter-Schema einen leeren Namen (letterhead)", () => {
    const empty = L({ notiz: "", datum: "", datum_lang: "", empfaenger: "", betreff: "", unserzeichen: "" });
    for (const key of Object.keys(empty)) {
      expect(buildFilename(`{${key}}`, empty, letterheadOpts).length).toBeGreaterThan(0);
    }
  });

  // Neu durch die Parametrisierung: die Kette ist mehrgliedrig, geordnet, und ihre Glieder
  // sind Templates — nicht fertige Namen.
  it("probiert mehrere Fallbacks in der angegebenen Reihenfolge", () => {
    const subs = { a: "", b: "", c: "Ziel" };
    expect(buildFilename("{a}", subs, { fallbacks: ["{b}", "{c}"], lastResort: "X" })).toBe("Ziel");
  });

  it("Fallbacks sind Templates: Platzhalter darin werden aufgelöst und sanitisiert", () => {
    expect(buildFilename("", { title: "A/B" }, { fallbacks: ["{title}"] })).toBe("A_B");
    expect(buildFilename("", { title: "A/B" }, { onInvalid: "strip", fallbacks: ["{title}"] })).toBe("AB");
  });

  it("greift nicht, solange das Haupt-Template etwas rendert", () => {
    expect(buildFilename("{title}", P(), paperizeOpts)).toBe("Mein Bericht");
    expect(buildFilename("Fix", {}, { fallbacks: ["{nope}"], lastResort: "X" })).toBe("Fix");
  });

  it("ohne fallbacks und ohne lastResort ist '' das dokumentierte Ergebnis", () => {
    expect(buildFilename("", {})).toBe("");
    expect(buildFilename("{leer}", { leer: "" })).toBe("");
  });

  it("lastResort wird verbatim zurückgegeben, nicht sanitisiert", () => {
    // Absicht: Sanitisieren könnte die Konstante auf "" reduzieren und damit genau die
    // Zusage brechen, für die es lastResort gibt.
    expect(buildFilename("", {}, { lastResort: "A/B" })).toBe("A/B");
  });
});

describe("buildFilename — was bewusst NICHT im Kit steckt", () => {
  it("kürzt nichts: Feld- und Gesamtlänge bleiben Sache des lokalen Shims", () => {
    const long = "x".repeat(200);
    expect(buildFilename("{question}", Y({ question: long }), yijingOpts)).toHaveLength(200);
  });

  it("die Kappung des Shims wirkt VOR der Substitution und bleibt dadurch wirksam", () => {
    // yijings slugQuestion / letterheads clip: 48 Zeichen, gebaut beim Füllen der Map.
    const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max).trim() : s);
    const out = buildFilename("{question}", Y({ question: clip("x".repeat(200), 48) }), yijingOpts);
    expect(out).toHaveLength(48);
  });
});

describe("buildFilename — Replay der drei ratifizierten Default-Schemata", () => {
  it("yijing-oracle: '{date} {time} Yijing {hexpair}'", () => {
    expect(buildFilename("{date} {time} Yijing {hexpair}", Y(), yijingOpts))
      .toBe("2026-07-12 1034 Yijing H3-H54");
    // ohne wandelnde Linien ist hexpair nur H<primär> — der Shim baut den Wert
    expect(buildFilename("{date} {time} Yijing {hexpair}", Y({ hexpair: "H3", resulting: "" }), yijingOpts))
      .toBe("2026-07-12 1034 Yijing H3");
  });

  it("obsidian-paperize: '{title}'", () => {
    expect(buildFilename("{title}", P(), paperizeOpts)).toBe("Mein Bericht");
  });

  it("obsidian-letterhead: '{datum} {empfaenger}' und das Legacy-Schema '{notiz}'", () => {
    expect(buildFilename("{datum} {empfaenger}", L(), letterheadOpts)).toBe("2026-06-09 Mustermann GmbH");
    expect(buildFilename("{notiz}", L(), letterheadOpts)).toBe("Beispielbrief");
  });
});
