import { describe, it, expect } from "vitest";
import { wrapCallout, type CalloutFold } from "../src/pure/callout";

// Vereinigung der Testmengen der drei Quell-Repos:
//  · yijing-oracle/tests/callout.test.ts:5-16 (3 Fälle)
//  · finance-ledger-plugin/26-011-finanzplan-plugin/tests/core/notes/render.test.ts:110-133 (5 Fälle)
//  · vault-rag/tests/reformat_mechanical.test.ts:48-55 (2 Fälle, auf die neue Signatur übersetzt)
// plus die Fälle, die der dritte fold-Zustand "static" und die Kopf-Härtung neu einführen,
// plus Regressionstests für die im Schnitt gemessenen Defekte.

describe("wrapCallout — faltbar (Übernahme yijing-oracle)", () => {
  it("baut geschlossenen Callout mit zeilen-geprefixtem Body", () => {
    expect(wrapCallout("Denkprozess", "Zeile 1\nZeile 2", "note", false))
      .toBe("> [!note]- Denkprozess\n> Zeile 1\n> Zeile 2");
  });

  it("offener Callout mit +", () => {
    expect(wrapCallout("T", "x", "quote", true)).toBe("> [!quote]+ T\n> x");
  });

  it("erhält Leerzeilen als '>'-Zeilen (Callout-Kontinuität)", () => {
    expect(wrapCallout("T", "a\n\nb", "note", false)).toBe("> [!note]- T\n> a\n>\n> b");
  });
});

describe("wrapCallout — faltbar (Übernahme finance-ledger)", () => {
  it("zitiert jede Zeile des Rumpfs", () => {
    expect(wrapCallout("Titel", "zeile1\nzeile2", "quote", false))
      .toBe("> [!quote]- Titel\n> zeile1\n> zeile2");
  });

  it("erhält Leerzeilen im Rumpf als nackte '>'-Zeile", () => {
    expect(wrapCallout("T", "a\n\nb", "quote", false)).toBe("> [!quote]- T\n> a\n>\n> b");
  });

  it("übernimmt den Callout-Typ in den Kopf", () => {
    expect(wrapCallout("T", "x", "info", false)).toContain("> [!info]- T");
  });

  it("öffnet den Callout mit einem Plus", () => {
    expect(wrapCallout("T", "x", "quote", true)).toContain("> [!quote]+ T");
  });

  it("lässt bei leerem Titel kein Leerzeichen am Kopf stehen", () => {
    expect(wrapCallout("", "x", "quote", false)).toBe("> [!quote]-\n> x");
  });
});

describe("wrapCallout — markerlos (Übernahme vault-rag wrapInCallout)", () => {
  it("packt mehrzeiligen Text in einen Callout", () => {
    expect(wrapCallout("", "Hallo\nWelt", "note")).toBe("> [!note]\n> Hallo\n> Welt");
  });

  it("nutzt den übergebenen Typ", () => {
    expect(wrapCallout("", "X", "warning")).toBe("> [!warning]\n> X");
  });
});

describe("wrapCallout — der dritte fold-Zustand", () => {
  const marker: Array<[CalloutFold, string]> = [
    [true, "+"],
    [false, "-"],
    ["static", ""],
  ];

  it("bildet jeden fold-Zustand auf seinen Marker ab", () => {
    for (const [fold, m] of marker) {
      expect(wrapCallout("T", "x", "note", fold)).toBe(`> [!note]${m} T\n> x`);
    }
  });

  it("Default ist \"static\" — weggelassenes fold == explizites \"static\"", () => {
    expect(wrapCallout("T", "x", "note")).toBe(wrapCallout("T", "x", "note", "static"));
    expect(wrapCallout("", "x", "note")).toBe(wrapCallout("", "x", "note", "static"));
  });

  it("static mit Titel: Kopf trägt genau EIN Leerzeichen vor dem Titel", () => {
    expect(wrapCallout("Rolle", "Beschreibung", "info", "static"))
      .toBe("> [!info] Rolle\n> Beschreibung");
  });

  it("static ohne Titel: trimEnd entfernt das Leerzeichen hinter der Klammer", () => {
    const head = wrapCallout("", "x", "note", "static").split("\n")[0];
    expect(head).toBe("> [!note]");
    expect(head?.endsWith(" ")).toBe(false);
  });
});

describe("wrapCallout — Byte-Gleichheit mit finance-ledgers handgebauten Stellen", () => {
  // Belegt, dass Phase 3 (kontoNotes.ts:156,159 / vertragNotes.ts:245,249 anschliessen)
  // die generierten Notizen für einzeilige Werte nicht verändert.
  it("kontoNotes.ts:156 — '> [!info] Rolle' + einzeiliger YAML-Wert", () => {
    const rolleBeschreibung = "Gehaltskonto, alle Fixkosten laufen hierüber.";
    expect(wrapCallout("Rolle", rolleBeschreibung, "info"))
      .toBe(`> [!info] Rolle\n> ${rolleBeschreibung}`);
  });

  it("kontoNotes.ts:159 — statischer mehrzeiliger Warnhinweis", () => {
    const zeilen = [
      "`saldo_eur` zeigt nur die kumulierte Summe aller Buchungen aus dem Import.",
      "Echter Bank-Saldo = `anfangssaldo_eur` + dieser Wert. Steht dort `null`,",
      "einmal aus dem Online-Banking nachtragen und `anfangssaldo_stand_am` setzen.",
      "Der Importer überschreibt diese beiden Felder nie.",
    ];
    expect(wrapCallout("Saldo ist relativ", zeilen.join("\n"), "warning")).toBe(
      "> [!warning] Saldo ist relativ\n" + zeilen.map(z => `> ${z}`).join("\n"),
    );
  });

  it("vertragNotes.ts:245 — leerer Zusatz-Warnhinweis bleibt am Aufrufer, nicht hier", () => {
    // Die Quelle entscheidet VOR dem Aufruf (`spec.noteExtraWarning === "" ? "" : ...`);
    // wrapCallout selbst erzeugt bei leerem Body korrekt eine nackte '>'-Zeile.
    expect(wrapCallout("Hinweis aus Auto-Generation", "", "warning"))
      .toBe("> [!warning] Hinweis aus Auto-Generation\n>");
  });
});

describe("wrapCallout — Regressionen aus dem Schnitt-Befund", () => {
  it("REGRESSION finance-ledger: mehrzeiliger YAML-Wert bleibt IM Callout", () => {
    // Gemessener Defekt: kontoNotes.ts:157 / vertragNotes.ts:245 schreiben `> ${wert}` roh.
    // Ein mehrzeiliges `rolle_beschreibung: |` liess ab Zeile 2 nackten Text neben dem
    // Callout stehen. Jede Body-Zeile muss ihr eigenes '> ' bekommen.
    const mehrzeilig = "erste Zeile\nzweite Zeile\ndritte Zeile";
    const out = wrapCallout("Rolle", mehrzeilig, "info");
    expect(out).toBe("> [!info] Rolle\n> erste Zeile\n> zweite Zeile\n> dritte Zeile");
    expect(out.split("\n").every(l => l.startsWith(">"))).toBe(true);
  });

  it("REGRESSION Kopf-Härtung: ein \\n im Titel sprengt den Callout nicht mehr", () => {
    // Alle drei Quellfassungen erzeugten hier "> [!note]- A\nB\n> x" — 'B' stand als
    // nackter Text NEBEN dem Callout, ohne Typ- oder Testfehler.
    const out = wrapCallout("A\nB", "x", "note", false);
    expect(out).toBe("> [!note]- A B\n> x");
    expect(out.split("\n").every(l => l.startsWith(">"))).toBe(true);
  });

  it("REGRESSION Kopf-Härtung: ein \\n im Typ sprengt den Callout nicht mehr", () => {
    // yijings `type` kommt aus einem freien Textfeld (settings/note-section.ts:139).
    const out = wrapCallout("T", "x", "no\nte", false);
    expect(out).toBe("> [!no te]- T\n> x");
    expect(out.split("\n").every(l => l.startsWith(">"))).toBe(true);
  });

  it("Kopf-Härtung: \\r\\n und Umbruch-Folgen werden zu EINEM Space", () => {
    expect(wrapCallout("A\r\n\nB", "x", "note", false)).toBe("> [!note]- A B\n> x");
  });

  it("Kopf-Härtung ist byte-neutral für Titel ohne Umbruch", () => {
    expect(wrapCallout("A B  C", "x", "note", false)).toBe("> [!note]- A B  C\n> x");
  });

  it("Titel aus reinem Umbruch verhält sich wie leerer Titel", () => {
    expect(wrapCallout("\n", "x", "note", false)).toBe(wrapCallout("", "x", "note", false));
  });
});

describe("wrapCallout — festgenagelte Randfälle (Entscheidung, kein Versehen)", () => {
  it("leerer Body ergibt genau eine nackte '>'-Zeile", () => {
    expect(wrapCallout("T", "", "note", false)).toBe("> [!note]- T\n>");
  });

  it("trailing \\n im Body erzeugt bewusst eine '>'-Schlusszeile (kein stilles Trimmen)", () => {
    expect(wrapCallout("T", "a\n", "note", false)).toBe("> [!note]- T\n> a\n>");
  });

  it("leading \\n im Body erzeugt bewusst eine '>'-Kopfzeile", () => {
    expect(wrapCallout("T", "\na", "note", false)).toBe("> [!note]- T\n>\n> a");
  });

  it("hängt nie einen abschliessenden Zeilenumbruch an", () => {
    expect(wrapCallout("T", "a\nb", "note", false).endsWith("\n")).toBe(false);
  });

  it("Body mit Leerzeichen-Zeile bleibt unangetastet ('> ' + Space, nicht '>')", () => {
    // Nur die LEERE Zeile wird zu '>'; eine Zeile aus einem Space ist Inhalt.
    expect(wrapCallout("T", "a\n \nb", "note", false)).toBe("> [!note]- T\n> a\n>  \n> b");
  });

  it("Titel wird nicht getrimmt, nur das Kopfende", () => {
    expect(wrapCallout("  T", "x", "note", false)).toBe("> [!note]-   T\n> x");
  });

  it("verschachtelte Callouts bleiben möglich (Body-Zeilen werden nur geprefixt)", () => {
    const inner = wrapCallout("Innen", "y", "note", "static");
    expect(wrapCallout("Aussen", inner, "info", "static"))
      .toBe("> [!info] Aussen\n> > [!note] Innen\n> > y");
  });
});
