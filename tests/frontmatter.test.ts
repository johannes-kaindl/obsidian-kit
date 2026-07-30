import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  assertParseable,
  valueEquals,
} from "../src/pure/frontmatter";

describe("parseFrontmatter", () => {
  it("ohne Delimiter → leeres data/order, ganzer Text als body", () => {
    const text = "# Titel\n\nNur Body, kein Frontmatter.\n";
    const r = parseFrontmatter(text);
    expect(r.data).toEqual({});
    expect(r.order).toEqual([]);
    expect(r.body).toBe(text);
  });
});

describe("serializeFrontmatter Round-Trip", () => {
  it("Emoji-Wert, Wikilink und Liste überleben serialize→parse unverändert", () => {
    const data = { type: "💻 Coding", up: "[[X]]", tags: ["a", "b"] };
    const order = ["type", "up", "tags"];
    const out = serializeFrontmatter(data, order);
    const rt = parseFrontmatter(out + "Body\n");
    expect(rt.data).toEqual(data);
    expect(rt.order).toEqual(order);
    expect(rt.body).toBe("Body\n");
  });
});

describe("serializeFrontmatter Quoting-Edge-Cases", () => {
  it("Werte mit ':' '#' und führendem Emoji bleiben reparse-stabil", () => {
    const data = {
      title: "Plan: Phase 1",     // ":" → muss gequotet werden
      note: "C# und #tag",         // "#" → sonst YAML-Kommentar
      icon: "🔥 heiß",             // führendes Emoji
    };
    const order = ["title", "note", "icon"];
    const out = serializeFrontmatter(data, order);
    expect(out).toContain('title: "Plan: Phase 1"');
    expect(out).toContain('note: "C# und #tag"');
    expect(parseFrontmatter(out + "x").data).toEqual(data);
  });
});

describe("Round-Trip-Self-Check", () => {
  it("akzeptiert sauber serialisierbares Frontmatter", () => {
    const fm = { data: { title: "Plan: X", up: "[[Y]]" }, order: ["title", "up"] };
    expect(() => assertParseable(fm)).not.toThrow();
  });
  it("verweigert nicht reparse-stabiles Frontmatter (Korruption)", () => {
    // Wert mit eingebetteter Zeilenschaltung kann unser flacher Serializer nicht
    // reparse-stabil emittieren → Self-Check MUSS werfen statt korruptes YAML zu liefern.
    const fm = { data: { note: "Zeile1\nZeile2: kaputt" }, order: ["note"] };
    expect(() => assertParseable(fm)).toThrow();
  });
});

describe("parseInlineList – Kommas in gequoteten Listenelementen", () => {
  it("serialize→parse Round-Trip für Listenelement mit Komma bleibt stabil und wirft nicht", () => {
    const data = { tags: ["machine learning, ai", "obsidian"] };
    const order = ["tags"];
    const out = serializeFrontmatter(data, order);
    const rt = parseFrontmatter(out + "Body\n");
    expect(rt.data).toEqual(data);
    expect(rt.order).toEqual(order);
    const fm = { data, order };
    expect(() => assertParseable(fm)).not.toThrow();
  });
});

describe("parseFrontmatter #-Kommentare", () => {
  it("trennt nachgestellten #-Kommentar vom Wert und sammelt ihn in comments", () => {
    const r = parseFrontmatter("---\nart: Gespräch  # Meeting | Telefonat\n---\nBody\n", { comments: true });
    expect(r.data.art).toBe("Gespräch");
    expect(r.comments?.art).toBe("Meeting | Telefonat");
  });
  it("leerer Wert mit Kommentar → Wert leer, Kommentar gesammelt", () => {
    const r = parseFrontmatter("---\nbereich:  # Arbeit | Privat\n---\n", { comments: true });
    expect(r.data.bereich).toBe("");
    expect(r.comments?.bereich).toBe("Arbeit | Privat");
  });
  it("gequotetes # bleibt Teil des Werts (kein Kommentar)", () => {
    const r = parseFrontmatter('---\nnote: "C# und #tag"\n---\n', { comments: true });
    expect(r.data.note).toBe("C# und #tag");
    expect(r.comments?.note ?? "").toBe("");
  });
  it("# ohne führenden Whitespace ist kein Kommentar", () => {
    const r = parseFrontmatter("---\nslug: foo#bar\n---\n", { comments: true });
    expect(r.data.slug).toBe("foo#bar");
    expect(r.comments?.slug ?? "").toBe("");
  });
  it("gequoteter Wert mit nachgestelltem Kommentar wird sauber getrennt", () => {
    const r = parseFrontmatter('---\nstatus: "✅ Abgeschlossen"   # Geplant | Archiv\n---\n', { comments: true });
    expect(r.data.status).toBe("✅ Abgeschlossen");
    expect(r.comments?.status).toBe("Geplant | Archiv");
  });
  it("Kommentar an einem Block-Listen-Key: Kommentar gesammelt, Items bleiben Liste", () => {
    const r = parseFrontmatter("---\nteilnehmer:  # jede genannte Person\n  - \"[[Dr. Berger]]\"\n  - \"[[Anna Klein]]\"\n---\n", { comments: true });
    expect(r.comments?.teilnehmer).toBe("jede genannte Person");
    expect(r.data.teilnehmer).toEqual(["[[Dr. Berger]]", "[[Anna Klein]]"]);
  });
});

describe("parseFrontmatter opt-in #-Kommentar-Flag (Datenverlust-Regression)", () => {
  it("OHNE comments-Flag bleibt ein unquoted #-Wert unverändert (kein Datenverlust)", () => {
    const r = parseFrontmatter("---\nnote: some text # detail\n---\n");
    expect(r.data.note).toBe("some text # detail");
    expect(r.comments?.note ?? "").toBe("");
  });
  it("MIT comments-Flag wird der #-Kommentar getrennt", () => {
    const r = parseFrontmatter("---\nnote: some text # detail\n---\n", { comments: true });
    expect(r.data.note).toBe("some text");
    expect(r.comments?.note).toBe("detail");
  });
  it("escaped \\\" im double-quoted Wert truncatet nicht (comments-Flag)", () => {
    const r = parseFrontmatter('---\nk: "a \\" b # c"\n---\n', { comments: true });
    expect(r.data.k).toBe('a " b # c');
    expect(r.comments?.k ?? "").toBe("");
  });
});

describe("number-Werte (Typ-Asymmetrie)", () => {
  it("number landet ungequotet", () => {
    const out = serializeFrontmatter({ seed: 199801046 }, ["seed"]);
    expect(out).toBe("---\nseed: 199801046\n---\n");
  });
  it("zahl-aussehender String bleibt gequotet — die Regel kippt nicht", () => {
    const out = serializeFrontmatter({ seed: "199801046" }, ["seed"]);
    expect(out).toBe('---\nseed: "199801046"\n---\n');
  });
  it("assertParseable überlebt einen number-Wert (Reparse liefert String)", () => {
    expect(() => assertParseable({ data: { seed: 199801046 }, order: ["seed"] })).not.toThrow();
    expect(valueEquals(199801046, "199801046")).toBe(true);
  });
});

describe("Quoting-Negativfälle (Regressionsschutz)", () => {
  it("Anführungszeichen und Backslashes MITTEN im Wert lösen kein Quoting aus", () => {
    const data = { a: 'er sagte "hallo"', b: "C:\\pfad\\datei" };
    const out = serializeFrontmatter(data, ["a", "b"]);
    expect(out).toContain('a: er sagte "hallo"');
    expect(out).toContain("b: C:\\pfad\\datei");
  });
});
