import { describe, expect, it } from "vitest";
import {
  validateSettings,
  isPlainObject,
  oneOf,
  check,
  clampIntField,
  clampFloatField,
  nonEmptyString,
  arrayOf,
  arrayThen,
  type FieldCheck,
  type SettingsSchema,
} from "../src/pure/settings_schema";

// Vereinigung der Testmengen der fünf Quell-Repos, auf die generische Signatur übersetzt:
//   3d-codeblocks/tests/core/settings-types.test.ts      (mergeSettings, 11 Fälle)
//   local-image-generator/tests/settings.test.ts         (sanitizeSettings, 22 Fälle)
//   koda-agent/tests/settings_types.test.ts              (mergeKodaSettings, 13 Fälle)
//   audio-interface/tests/core/settings-types.test.ts    (normalizeSettings, 8 Fälle)
//   apple-health/tests/obsidian/main-host.test.ts        (loadPluginData, 3 Fälle)
// Dazu die Fälle, die erst durch die Parametrisierung entstehen (Schema-Eintrag schlägt die
// generische Prüfung, beide Trim-Fassungen, Klon-Tiefe) und je ein Regressionstest für die
// im Schnitt-Vorschlag gemessenen Defekte.

interface Demo {
  name: string;
  count: number;
  flag: boolean;
  list: string[];
  nested: { a: number };
}

const DEMO: Demo = { name: "default", count: 3, flag: true, list: ["x", "y"], nested: { a: 1 } };

describe("validateSettings · Grundvertrag", () => {
  it("liefert für null/undefined/String/Zahl eine reine Default-Kopie", () => {
    expect(validateSettings(DEMO, null)).toEqual(DEMO);
    expect(validateSettings(DEMO, undefined)).toEqual(DEMO);
    expect(validateSettings(DEMO, "kaputt")).toEqual(DEMO);
    expect(validateSettings(DEMO, 42)).toEqual(DEMO);
  });

  it("ein Array als raw ist kein Settings-Objekt → Defaults", () => {
    // Regression: LIG las `(raw ?? {})` und hätte ein Array indiziert; 3d prüfte nur
    // `typeof === "object"` und hätte es ebenfalls durchgelassen.
    expect(validateSettings(DEMO, [1, 2, 3])).toEqual(DEMO);
  });

  it("übernimmt gespeicherte Werte", () => {
    const s = validateSettings(DEMO, { name: "gesetzt", count: 9, flag: false });
    expect(s.name).toBe("gesetzt");
    expect(s.count).toBe(9);
    expect(s.flag).toBe(false);
  });

  it("füllt fehlende Felder aus den Defaults (altes data.json lädt ohne Migration)", () => {
    const s = validateSettings(DEMO, { name: "nur das" });
    expect(s).toEqual({ ...DEMO, name: "nur das" });
  });

  it("geschlossene Welt: unbekannte Felder werden verworfen", () => {
    const s = validateSettings(DEMO, { nope: true, future: 1 });
    expect(s).toEqual(DEMO);
    expect((s as unknown as Record<string, unknown>)["nope"]).toBeUndefined();
    expect((s as unknown as Record<string, unknown>)["future"]).toBeUndefined();
  });

  it("die Schlüsselmenge ist exakt Object.keys(defaults)", () => {
    expect(Object.keys(validateSettings(DEMO, { extra: 1 }))).toEqual(Object.keys(DEMO));
  });

  it("ist idempotent — das eigene Ergebnis darf zurückgefüttert werden (Schreibpfad Settings-Tab)", () => {
    const once = validateSettings(DEMO, { name: "a", count: 7, weg: true });
    const twice = validateSettings(DEMO, { ...once, flag: false });
    expect(twice).toEqual({ ...DEMO, name: "a", count: 7, flag: false });
    expect(validateSettings(DEMO, once)).toEqual(once);
  });
});

describe("validateSettings · generische Bauform-Prüfung", () => {
  it("verwirft falsch getypte Felder feldweise auf ihren Default", () => {
    const s = validateSettings(DEMO, { name: 42, count: "viel", flag: "yes" });
    expect(s.name).toBe("default");
    expect(s.count).toBe(3);
    expect(s.flag).toBe(true);
  });

  it("prüft JEDES deklarierte Feld, nicht nur die mit Schema-Eintrag", () => {
    // Regression koda-agent: 6 von 16 Feldern liefen ungeprüft durch den Kit-Merge, weil
    // dort nur die Felder mit clamp-Aufruf angefasst wurden. Das Nachbarrepo audio-interface
    // hatte den Fix (generische Schleife) — hier ist er der Default.
    const garbage: Record<string, unknown> = {};
    for (const key of Object.keys(DEMO)) garbage[key] = Symbol("müll");
    expect(validateSettings(DEMO, garbage)).toEqual(DEMO);
  });

  it("NaN und Infinity sind keine gültigen Zahlen", () => {
    expect(validateSettings(DEMO, { count: Number.NaN }).count).toBe(3);
    expect(validateSettings(DEMO, { count: Number.POSITIVE_INFINITY }).count).toBe(3);
    expect(validateSettings(DEMO, { count: 0 }).count).toBe(0);
    expect(validateSettings(DEMO, { count: -5 }).count).toBe(-5);
  });

  it("null zählt nie als gültiger Wert für einen typisierten Default", () => {
    expect(validateSettings(DEMO, { name: null, list: null, nested: null })).toEqual(DEMO);
  });

  it("Array-Default nimmt nur Arrays, Objekt-Default nur Plain-Objects", () => {
    expect(validateSettings(DEMO, { list: { 0: "x" } }).list).toEqual(["x", "y"]);
    expect(validateSettings(DEMO, { nested: [1] }).nested).toEqual({ a: 1 });
    expect(validateSettings(DEMO, { list: ["neu"] }).list).toEqual(["neu"]);
    expect(validateSettings(DEMO, { nested: { a: 2 } }).nested).toEqual({ a: 2 });
  });

  it("ein leerer String ist ein gültiger Wert (kein Schema-Eintrag = kein Leer-Verbot)", () => {
    // 3d `lockedNodePrefixes` = "nichts sperren", audio `exportFolder` = "neben der Notiz".
    expect(validateSettings(DEMO, { name: "" }).name).toBe("");
  });

  it("ein null-Default trägt keine Typinformation und nimmt jeden vorhandenen Wert", () => {
    const defs = { limit: null as number | null };
    expect(validateSettings(defs, { limit: 300 }).limit).toBe(300);
    expect(validateSettings(defs, {}).limit).toBeNull();
    // Dokumentierte Konsequenz: ohne Schema-Eintrag ist so ein Feld faktisch ungeprüft.
    expect(validateSettings(defs, { limit: "hoch" as unknown as number }).limit).toBe("hoch");
    const geprueft = validateSettings(defs, { limit: "hoch" as unknown as number }, {
      limit: check((v) => v === null || (typeof v === "number" && Number.isFinite(v))),
    });
    expect(geprueft.limit).toBeNull();
  });
});

describe("validateSettings · Referenz-Schutz (Regression: dreimal unabhängig entdeckt)", () => {
  it("das Ergebnis ist nie das Defaults-Objekt selbst", () => {
    expect(validateSettings(DEMO, {})).not.toBe(DEMO);
  });

  it("teilt keine Array-/Objekt-Referenz mit den Defaults", () => {
    const s = validateSettings(DEMO, {});
    expect(s.list).not.toBe(DEMO.list);
    expect(s.nested).not.toBe(DEMO.nested);
  });

  it("klont rekursiv — auch die ELEMENTE eines Default-Arrays", () => {
    // Regression LIG: `mergeSettings` klont nur eine Ebene (slice()), die Preset-Objekte
    // blieben geteilt. koda-agents Default `endpoints: [{ url: ... }]` hat dieselbe Falle.
    const defs = { rows: [{ id: "a" }, { id: "b" }], deep: { inner: { n: 1 } } };
    const s = validateSettings(defs, {});
    expect(s.rows).toEqual(defs.rows);
    s.rows.forEach((row, i) => expect(row).not.toBe(defs.rows[i]));
    expect(s.deep.inner).not.toBe(defs.deep.inner);
  });

  it("zwei Instanzen ohne gespeicherte Felder teilen keine Referenz (kein Cross-Instance-Leak)", () => {
    // Regression apple-health: die erste Plugin-Instanz im Prozess verunreinigte sonst die
    // Modul-Vorlage, jede spätere sah deren Endzustand statt der Defaults.
    const first = validateSettings(DEMO, null);
    first.list.push("verunreinigt");
    first.nested.a = 99;
    const second = validateSettings(DEMO, null);
    expect(second.list).toEqual(["x", "y"]);
    expect(second.nested.a).toBe(1);
    expect(DEMO.list).toEqual(["x", "y"]);
    expect(DEMO.nested.a).toBe(1);
  });

  it("auch ein raw, das aus den Defaults gespreadet wurde, leakt nicht", () => {
    // `{ ...DEFAULTS }` teilt seine Arrays mit der Modul-Vorlage — genau die Form, die der
    // Settings-Tab-Schreibpfad und die Tests der Quell-Repos benutzen.
    const s = validateSettings(DEMO, { ...DEMO });
    expect(s.list).not.toBe(DEMO.list);
    s.list.push("verunreinigt");
    expect(DEMO.list).toEqual(["x", "y"]);
  });

  it("ein FieldCheck bekommt einen frischen fallback und darf ihn verändern", () => {
    const greedy: FieldCheck<string[]> = (_raw, fallback) => {
      fallback.push("angehängt");
      return fallback;
    };
    const s = validateSettings(DEMO, {}, { list: greedy });
    expect(s.list).toEqual(["x", "y", "angehängt"]);
    expect(DEMO.list).toEqual(["x", "y"]);
  });

  it("nicht rekonstruierbare Werte (Date) werden durchgereicht statt zerlegt", () => {
    const stamp = new Date("2026-08-19T00:00:00.000Z");
    const defs = { at: stamp };
    expect(validateSettings(defs, {}).at).toBe(stamp);
  });
});

describe("validateSettings · Schema-Einträge", () => {
  it("ein Schema-Eintrag ERSETZT die generische Prüfung und sieht den ROHEN Wert", () => {
    // Ohne diese Regel käme koda-agents "25" nie bei clampInt an.
    expect(validateSettings(DEMO, { count: "25" }).count).toBe(3);
    expect(validateSettings(DEMO, { count: "25" }, { count: clampIntField(1, 50) }).count).toBe(25);
  });

  it("ein Schema-Eintrag für ein Feld, das nicht in den Defaults steht, wird ignoriert", () => {
    const schema = { erfunden: oneOf(["a", "b"]) } as unknown as SettingsSchema<Demo>;
    expect(validateSettings(DEMO, { erfunden: "a" }, schema)).toEqual(DEMO);
  });

  it("ein leeres Schema verhält sich wie gar keins", () => {
    expect(validateSettings(DEMO, { name: 1 }, {})).toEqual(validateSettings(DEMO, { name: 1 }));
  });
});

describe("isPlainObject", () => {
  it("null und Arrays sind keine Plain-Objects", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(0)).toBe(false);
  });
  it("Objekte sind welche", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });
});

describe("oneOf", () => {
  const mode = oneOf(["immediate", "on-click"]);
  it("nimmt einen erlaubten Wert", () => {
    expect(mode("on-click", "immediate")).toBe("on-click");
  });
  it("verwirft alles andere auf den Default", () => {
    expect(mode("sideways", "immediate")).toBe("immediate");
    expect(mode(7, "immediate")).toBe("immediate");
    expect(mode(null, "immediate")).toBe("immediate");
    expect(mode(undefined, "immediate")).toBe("immediate");
  });
});

describe("check", () => {
  const positive = check<number>((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  it("übernimmt den rohen Wert, wenn das Prädikat hält", () => {
    expect(positive(250, 400)).toBe(250);
  });
  it("verwirft sonst auf den Default (klemmt NICHT)", () => {
    expect(positive(0, 400)).toBe(400);
    expect(positive("tall", 400)).toBe(400);
    expect(positive(-3, 400)).toBe(400);
  });
});

describe("clampIntField (String-tolerant)", () => {
  const budget = clampIntField(1000, 100000);
  it("klemmt nach unten und oben", () => {
    expect(budget(10, 6000)).toBe(1000);
    expect(budget(999999, 6000)).toBe(100000);
  });
  it("lässt einen Wert innerhalb der Spanne unverändert durch", () => {
    // Regression koda-agent: bis 0.3.0 kappte eine zu enge Obergrenze von Hand gesetzte
    // Wünsche (25 Runden, 80000 Zeichen) still weg.
    expect(budget(80000, 6000)).toBe(80000);
    expect(clampIntField(1, 50)(25, 8)).toBe(25);
    expect(clampIntField(1, 50)(0, 8)).toBe(1);
  });
  it("nimmt Zahl-Strings an", () => {
    expect(budget("2500", 6000)).toBe(2500);
  });
  it("Müll fällt auf den Default zurück", () => {
    expect(budget("viel", 6000)).toBe(6000);
    expect(budget(null, 6000)).toBe(6000);
    expect(budget(Number.NaN, 6000)).toBe(6000);
    expect(budget({}, 6000)).toBe(6000);
  });
  it("trunct Floats (Semantik von pure/num.clampInt)", () => {
    expect(budget(2500.9, 6000)).toBe(2500);
  });
});

describe("clampFloatField (nicht String-tolerant)", () => {
  const rate = clampFloatField(0.5, 2);
  it("klemmt auf die Spanne", () => {
    expect(rate(9, 1)).toBe(2);
    expect(rate(0.1, 1)).toBe(0.5);
    expect(rate(1.5, 1)).toBe(1.5);
  });
  it("ein String im Zahlenfeld ist ein kaputtes data.json, kein Wunsch", () => {
    expect(rate("1.5", 1)).toBe(1);
    expect(rate(Number.NaN, 1)).toBe(1);
    expect(rate(Number.POSITIVE_INFINITY, 1)).toBe(1);
  });
});

describe("nonEmptyString", () => {
  it("ohne trim: nur \"\" ist leer", () => {
    const s = nonEmptyString();
    expect(s("wert", "D")).toBe("wert");
    expect(s("", "D")).toBe("D");
    expect(s("   ", "D")).toBe("   ");
    expect(s(42, "D")).toBe("D");
  });
  it("trim: \"check\" — Ränder zählen beim Leer-Test, gespeichert wird der ROHE Wert (audio-interface)", () => {
    const s = nonEmptyString({ trim: "check" });
    expect(s("   ", "{{note}}")).toBe("{{note}}");
    expect(s("{{date}}-{{note}}", "{{note}}")).toBe("{{date}}-{{note}}");
    expect(s(" mit Rand ", "{{note}}")).toBe(" mit Rand ");
  });
  it("trim: true — gespeichert wird der GETRIMMTE Wert (local-image-generator)", () => {
    const s = nonEmptyString({ trim: true });
    expect(s("  ", "https://default")).toBe("https://default");
    expect(s(" http://127.0.0.1:7862 ", "https://default")).toBe("http://127.0.0.1:7862");
    expect(s("http://127.0.0.1:7862/", "https://default")).toBe("http://127.0.0.1:7862/");
  });
});

describe("arrayOf", () => {
  const isPreset = (p: unknown): boolean =>
    isPlainObject(p) && typeof p["id"] === "string" && typeof p["label"] === "string" && typeof p["suffix"] === "string";
  const presets = arrayOf<{ id: string; label: string; suffix: string }>(isPreset);
  const FALLBACK = [{ id: "sumi-e", label: "Sumi-e", suffix: "ink" }];

  it("Nicht-Array wird zum Default", () => {
    expect(presets(null, FALLBACK)).toEqual(FALLBACK);
    expect(presets("nope", FALLBACK)).toEqual(FALLBACK);
    expect(presets({}, FALLBACK)).toEqual(FALLBACK);
  });
  it("ein kaputter Eintrag kostet nicht die ganze Liste", () => {
    const ok = { id: "ok", label: "OK", suffix: "ok-suffix" };
    expect(presets([ok, { id: "broken", label: "Broken" }], FALLBACK)).toEqual([ok]);
    expect(presets([null, ok], FALLBACK)).toEqual([ok]);
  });
  it("eine leere Liste bleibt leer (kein Default-Nachschub)", () => {
    expect(presets([], FALLBACK)).toEqual([]);
  });
});

describe("arrayThen", () => {
  const favorites = arrayThen<string>((items) => items.filter((i): i is string => typeof i === "string").map((i) => i.toUpperCase()));
  it("Nicht-Array wird zum Default", () => {
    expect(favorites(null, ["fallback"])).toEqual(["fallback"]);
    expect(favorites("a", ["fallback"])).toEqual(["fallback"]);
  });
  it("ein Array läuft als Ganzes durch die Migration", () => {
    expect(favorites(["a", 7, "b"], [])).toEqual(["A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// Die fünf Quell-Fassungen, mit ihren eigenen Testfällen nachgestellt.
// ---------------------------------------------------------------------------

describe("Quelle 3d-codeblocks (mergeSettings)", () => {
  const MAX_CONTEXTS_LIMIT = 12;
  interface S {
    viewMode: "immediate" | "on-click";
    defaultHeight: number;
    autoRotate: boolean;
    showGrid: boolean;
    maxContexts: number;
    panelPlacement: "auto" | "sidebar" | "toolbar";
    lockedNodePrefixes: string;
  }
  const D: S = {
    viewMode: "immediate", defaultHeight: 400, autoRotate: false, showGrid: false,
    maxContexts: 6, panelPlacement: "auto", lockedNodePrefixes: "env__",
  };
  const SCHEMA: SettingsSchema<S> = {
    viewMode: oneOf(["immediate", "on-click"]),
    defaultHeight: check((v) => typeof v === "number" && Number.isFinite(v) && v > 0),
    panelPlacement: oneOf(["auto", "sidebar", "toolbar"]),
    // Klemme MIT Sonderregel: 0 ist gültig ("unbegrenzt"), 13 wird zu 12, aber −3 fällt auf
    // den Default statt auf 0. Bleibt eine Lambda, weil es 3ds Regel ist.
    maxContexts: (v, fb) =>
      typeof v === "number" && Number.isFinite(v) && Math.round(v) >= 0
        ? Math.min(MAX_CONTEXTS_LIMIT, Math.round(v))
        : fb,
  };
  const merge = (raw: unknown): S => validateSettings(D, raw, SCHEMA);

  it("returns the defaults for null or undefined", () => {
    expect(merge(null)).toEqual(D);
    expect(merge(undefined)).toEqual(D);
  });
  it("keeps stored values", () => {
    expect(merge({ defaultHeight: 250 }).defaultHeight).toBe(250);
  });
  it("drops an unknown view mode", () => {
    expect(merge({ viewMode: "sideways" }).viewMode).toBe("immediate");
  });
  it("drops a non-positive height", () => {
    expect(merge({ defaultHeight: 0 }).defaultHeight).toBe(400);
    expect(merge({ defaultHeight: "tall" }).defaultHeight).toBe(400);
  });
  it("allows 0 (off) and clamps the top to 12", () => {
    expect(merge({ maxContexts: 0 }).maxContexts).toBe(0);
    expect(merge({ maxContexts: 13 }).maxContexts).toBe(12);
    expect(merge({ maxContexts: 999 }).maxContexts).toBe(12);
  });
  it("rejects a negative maxContexts back to the default", () => {
    expect(merge({ maxContexts: -3 }).maxContexts).toBe(6);
  });
  it("ignores unknown keys", () => {
    expect(merge({ nope: true })).toEqual(D);
  });
  it("panelPlacement: gültig bleibt, Müll fällt auf auto", () => {
    expect(merge({ panelPlacement: "toolbar" }).panelPlacement).toBe("toolbar");
    expect(merge({ panelPlacement: "somewhere" }).panelPlacement).toBe("auto");
    expect(merge({ panelPlacement: 7 }).panelPlacement).toBe("auto");
  });
  it("lockedNodePrefixes: \"\" ist gültig, fremde Typen fallen auf den Default", () => {
    expect(merge({ lockedNodePrefixes: "" }).lockedNodePrefixes).toBe("");
    expect(merge({ lockedNodePrefixes: 42 }).lockedNodePrefixes).toBe("env__");
    expect(merge({ lockedNodePrefixes: "sky__, env__" }).lockedNodePrefixes).toBe("sky__, env__");
  });
  it("Schreibpfad des Settings-Tabs: { ...settings, [key]: value } bleibt gültig", () => {
    const settings = merge(null);
    expect(merge({ ...settings, maxContexts: 99 }).maxContexts).toBe(12);
  });
});

describe("Quelle local-image-generator (sanitizeSettings)", () => {
  interface Preset { id: string; label: string; suffix: string }
  interface Entry { prompt: string; seed: number; steps: number; model: string; created: string; width: number; height: number; negativePrompt: string; cfg: number }
  interface S {
    engine: "builtin" | "server";
    assetBaseUrl: string;
    outputFolder: string;
    defaultSteps: number;
    createMode: "image" | "note";
    presets: Preset[];
    history: Entry[];
    historyView: "recent" | "grouped";
    sectionsCollapsed: Record<string, boolean>;
  }
  const DEFAULT_PRESETS: Preset[] = [
    { id: "sumi-e", label: "Sumi-e", suffix: "sumi-e painting" },
    { id: "photo", label: "Photo", suffix: "photograph" },
  ];
  const BASE_URL = "https://huggingface.co/example";
  const D: S = {
    engine: "builtin", assetBaseUrl: BASE_URL, outputFolder: "", defaultSteps: 20,
    createMode: "image", presets: DEFAULT_PRESETS, history: [], historyView: "recent",
    sectionsCollapsed: {},
  };
  const isPreset = (p: unknown): boolean =>
    isPlainObject(p) && typeof p["id"] === "string" && typeof p["label"] === "string" && typeof p["suffix"] === "string";
  const SCHEMA: SettingsSchema<S> = {
    engine: oneOf(["builtin", "server"]),
    assetBaseUrl: nonEmptyString({ trim: true }),
    defaultSteps: check((v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50),
    createMode: oneOf(["image", "note"]),
    historyView: oneOf(["recent", "grouped"]),
    presets: arrayOf(isPreset),
    history: arrayThen((items) =>
      items
        .filter(
          (h): h is Record<string, unknown> =>
            isPlainObject(h) && typeof h["prompt"] === "string" && typeof h["seed"] === "number" &&
            typeof h["steps"] === "number" && typeof h["model"] === "string" && typeof h["created"] === "string",
        )
        .map((h) => ({
          ...h,
          width: typeof h["width"] === "number" ? h["width"] : 512,
          height: typeof h["height"] === "number" ? h["height"] : 512,
          negativePrompt: typeof h["negativePrompt"] === "string" ? h["negativePrompt"] : "",
          cfg: typeof h["cfg"] === "number" ? h["cfg"] : 7,
        })) as unknown as Entry[],
    ),
    sectionsCollapsed: check(isPlainObject),
  };
  const sanitize = (raw: unknown): S => validateSettings(D, raw, SCHEMA);

  it("lässt einen gesunden Settings-Stand unverändert durch", () => {
    const healthy: S = {
      engine: "server",
      assetBaseUrl: "http://127.0.0.1:7862",
      outputFolder: "Art",
      defaultSteps: 2,
      createMode: "note",
      presets: [{ id: "a", label: "A", suffix: "a-suffix" }],
      history: [{ prompt: "a prompt", seed: 1, steps: 4, model: "sd-turbo", width: 512, height: 512, created: "2026-07-17T10:00:00", negativePrompt: "blurry", cfg: 8 }],
      historyView: "grouped",
      sectionsCollapsed: { model: true },
    };
    expect(sanitize(healthy)).toEqual(healthy);
  });
  it("presets: null/non-array wird zu DEFAULT_PRESETS", () => {
    expect(sanitize({ presets: null }).presets).toEqual(DEFAULT_PRESETS);
    expect(sanitize({ presets: "nope" }).presets).toEqual(DEFAULT_PRESETS);
  });
  it("presets: non-array-Fallback teilt keine Referenzen mit DEFAULT_PRESETS", () => {
    const sanitized = sanitize({ presets: "nope" }).presets;
    expect(sanitized).not.toBe(DEFAULT_PRESETS);
    sanitized.forEach((p, i) => expect(p).not.toBe(DEFAULT_PRESETS[i]));
  });
  it("ein Preset ohne suffix und ein null-Eintrag fallen aus der Liste", () => {
    const ok = { id: "ok", label: "OK", suffix: "ok-suffix" };
    expect(sanitize({ presets: [ok, { id: "broken", label: "Broken" }] }).presets).toEqual([ok]);
    expect(sanitize({ presets: [null, ok] }).presets).toEqual([ok]);
  });
  it("sectionsCollapsed: null/Array wird zu {}", () => {
    expect(sanitize({ sectionsCollapsed: null }).sectionsCollapsed).toEqual({});
    expect(sanitize({ sectionsCollapsed: [] }).sectionsCollapsed).toEqual({});
  });
  it.each([
    [0, 20], [51, 20], ["3", 20], [2.5, 20], [1, 1], [50, 50], [20, 20],
  ])("defaultSteps %p wird zu %p", (input, expected) => {
    expect(sanitize({ defaultSteps: input }).defaultSteps).toBe(expected);
  });
  it("createMode/engine/historyView: Unsinn fällt auf den Default", () => {
    expect(sanitize({ createMode: "bogus" }).createMode).toBe("image");
    expect(sanitize({ createMode: "note" }).createMode).toBe("note");
    expect(sanitize({ engine: "toaster" }).engine).toBe("builtin");
    expect(sanitize({ engine: "server" }).engine).toBe("server");
    expect(sanitize({ historyView: "quatsch" }).historyView).toBe("recent");
    expect(sanitize({ historyView: "grouped" }).historyView).toBe("grouped");
  });
  it("outputFolder: non-string wird zu \"\", ein leerer String bleibt gültig", () => {
    expect(sanitize({ outputFolder: 5 }).outputFolder).toBe("");
    expect(sanitize({ outputFolder: "" }).outputFolder).toBe("");
    expect(sanitize({ outputFolder: "Art" }).outputFolder).toBe("Art");
  });
  it("assetBaseUrl: leer/Whitespace fällt auf den Default, Trailing-Slash bleibt roh", () => {
    expect(sanitize({}).assetBaseUrl).toBe(BASE_URL);
    expect(sanitize({ assetBaseUrl: "  " }).assetBaseUrl).toBe(BASE_URL);
    expect(sanitize({ assetBaseUrl: "http://127.0.0.1:7862/" }).assetBaseUrl).toBe("http://127.0.0.1:7862/");
  });
  it("verwirft eine alte promptHistory (string[]) und startet leer", () => {
    const s = sanitize({ promptHistory: ["a", "b", "c"] });
    expect(s.history).toEqual([]);
    expect((s as unknown as Record<string, unknown>)["promptHistory"]).toBeUndefined();
  });
  it("wirft kaputte history-Einträge weg und backfillt Alt-Einträge", () => {
    expect(sanitize({ history: [{ prompt: "a" }, 42, null] }).history).toEqual([]);
    const migrated = sanitize({ history: [{ prompt: "a", seed: 1, steps: 2, model: "sd-turbo", created: "x" }] });
    expect(migrated.history[0]).toMatchObject({ width: 512, height: 512, negativePrompt: "", cfg: 7 });
  });
});

describe("Quelle koda-agent (mergeKodaSettings)", () => {
  interface Endpoint { url: string }
  interface S {
    endpoints: Endpoint[];
    model: string;
    suppressThinking: boolean;
    maxRounds: number;
    skillBudgetChars: number;
    language: "auto" | "de" | "en";
    summarizeEnabled: boolean;
  }
  const D: S = {
    endpoints: [{ url: "http://127.0.0.1:1234" }],
    model: "", suppressThinking: true, maxRounds: 8, skillBudgetChars: 6000,
    language: "auto", summarizeEnabled: true,
  };
  const SCHEMA: SettingsSchema<S> = {
    endpoints: arrayThen((items) =>
      items
        .map((e) => (typeof e === "string" ? { url: e } : e))
        .filter((e): e is Endpoint => isPlainObject(e) && typeof e["url"] === "string"),
    ),
    maxRounds: clampIntField(1, 50),
    skillBudgetChars: clampIntField(1000, 100000),
    language: oneOf(["auto", "de", "en"]),
  };
  const merge = (raw: unknown): S => validateSettings(D, raw, SCHEMA);

  it("leerer Input liefert Defaults", () => {
    expect(merge(null)).toEqual(D);
  });
  it("klemmt maxRounds in die erlaubte Spanne, lässt 25 durch", () => {
    expect(merge({ maxRounds: 99999 }).maxRounds).toBe(50);
    expect(merge({ maxRounds: 0 }).maxRounds).toBe(1);
    expect(merge({ maxRounds: 25 }).maxRounds).toBe(25);
  });
  it("skillBudgetChars: klemmt, lässt 80000 durch, Müll fällt auf 6000", () => {
    expect(merge({ skillBudgetChars: 10 }).skillBudgetChars).toBe(1000);
    expect(merge({ skillBudgetChars: 999999 }).skillBudgetChars).toBe(100000);
    expect(merge({ skillBudgetChars: 80000 }).skillBudgetChars).toBe(80000);
    expect(merge({ skillBudgetChars: "viel" }).skillBudgetChars).toBe(6000);
  });
  it("migriert eine alte String-Endpoint-Liste zu EndpointConfig", () => {
    expect(merge({ endpoints: ["http://a:1234"] }).endpoints).toEqual([{ url: "http://a:1234" }]);
  });
  it("der Default-Endpunkt teilt sein inneres Objekt nicht mit der Vorlage", () => {
    // Bisher eine scharfe Waffe mit gesichertem Hahn: mergeSettings' slice() klont nur die
    // Liste, nicht das { url }-Objekt darin.
    const s = merge({});
    const first = s.endpoints[0];
    expect(first).not.toBe(D.endpoints[0]);
    if (first) first.url = "http://verunreinigt";
    expect(D.endpoints[0]?.url).toBe("http://127.0.0.1:1234");
  });
  it("die bisher ungeprüften Felder bekommen die typeof-Prüfung (Bugfix beim Umbau)", () => {
    expect(merge({ model: 7 }).model).toBe("");
    expect(merge({ suppressThinking: "ja" }).suppressThinking).toBe(true);
    expect(merge({ summarizeEnabled: "nein" }).summarizeEnabled).toBe(true);
    expect(merge({ summarizeEnabled: false }).summarizeEnabled).toBe(false);
    expect(merge({ language: "klingon" }).language).toBe("auto");
    expect(merge({ language: "de" }).language).toBe("de");
  });
  it("die unbeabsichtigte Forward-Compat entfällt (geschlossene Welt, kein Test pinnte sie)", () => {
    const s = merge({ altesFeld: "bleibt nicht" });
    expect((s as unknown as Record<string, unknown>)["altesFeld"]).toBeUndefined();
  });
});

describe("Quelle audio-interface (normalizeSettings)", () => {
  const LOADABLE = ["piper-de", "piper-en"];
  interface S {
    speakVoiceUri: string;
    speakRate: number;
    exportEnabled: boolean;
    exportEngineId: string;
    exportProfile: "phone-8k" | "native";
    exportFolder: string;
    exportFilePattern: string;
    exportInsertLink: boolean;
  }
  const D: S = {
    speakVoiceUri: "", speakRate: 1, exportEnabled: false, exportEngineId: "piper-de",
    exportProfile: "phone-8k", exportFolder: "", exportFilePattern: "{{note}}", exportInsertLink: false,
  };
  const SCHEMA: SettingsSchema<S> = {
    speakRate: clampFloatField(0.5, 2),
    exportProfile: oneOf(["phone-8k", "native"]),
    // Fremdes Prädikat, das `string` nimmt — bleibt eine Lambda, kein Eingriff im Manifest.
    exportEngineId: (v, fb) => (typeof v === "string" && LOADABLE.includes(v) ? v : fb),
    exportFilePattern: nonEmptyString({ trim: "check" }),
  };
  const normalize = (raw: unknown): S => validateSettings(D, raw, SCHEMA);

  it("liefert Defaults für null/undefined/Müll", () => {
    expect(normalize(null)).toEqual(D);
    expect(normalize(undefined)).toEqual(D);
    expect(normalize("x")).toEqual(D);
  });
  it("teilt keine Referenz mit den Defaults", () => {
    expect(normalize({})).not.toBe(D);
  });
  it("klemmt speakRate auf 0.5–2 und verwirft NaN/Strings", () => {
    expect(normalize({ speakRate: 9 }).speakRate).toBe(2);
    expect(normalize({ speakRate: 0.1 }).speakRate).toBe(0.5);
    expect(normalize({ speakRate: "1.5" }).speakRate).toBe(1);
    expect(normalize({ speakRate: Number.NaN }).speakRate).toBe(1);
  });
  it("verwirft falsch getypte Felder auf den Default", () => {
    expect(normalize({ exportEnabled: "yes" }).exportEnabled).toBe(false);
    expect(normalize({ exportFolder: 42 }).exportFolder).toBe("");
    expect(normalize({ exportInsertLink: true }).exportInsertLink).toBe(true);
  });
  it("verwirft unbekannte exportProfile-Werte auf den Default", () => {
    expect(normalize({ exportProfile: "mp3" }).exportProfile).toBe("phone-8k");
    expect(normalize({ exportProfile: "native" }).exportProfile).toBe("native");
  });
  it("nimmt nur ladbare Stimmen als exportEngineId, sonst die Werksstimme", () => {
    expect(normalize({ exportEngineId: "piper-en" }).exportEngineId).toBe("piper-en");
    expect(normalize({ exportEngineId: "piper-fr-verschwunden" }).exportEngineId).toBe("piper-de");
    expect(normalize({ exportEngineId: 7 }).exportEngineId).toBe("piper-de");
  });
  it("leeres Dateimuster fällt auf Default zurück, sonst bleibt der rohe Wert", () => {
    expect(normalize({ exportFilePattern: "   " }).exportFilePattern).toBe("{{note}}");
    expect(normalize({ exportFilePattern: "{{date}}-{{note}}" }).exportFilePattern).toBe("{{date}}-{{note}}");
  });
  it("behält unbekannte Felder nicht — aber wirft nicht", () => {
    const s = normalize({ foo: 1 }) as unknown as Record<string, unknown>;
    expect(s["foo"]).toBeUndefined();
  });
});

describe("Quelle apple-health (loadPluginData)", () => {
  const SLEEP_ASLEEP = "SleepAsleep";
  interface S {
    favorites: string[];
    exportFolder: string;
    exportFormat: "md" | "csv";
    collapsed: Record<string, boolean>;
  }
  const D: S = { favorites: [], exportFolder: "", exportFormat: "md", collapsed: {} };
  const migrateFavorites = (items: unknown[]): string[] => {
    const out: string[] = [];
    for (const id of items) {
      if (typeof id !== "string") continue;
      const mapped = id === "HKCategoryTypeIdentifierSleepAnalysis" ? SLEEP_ASLEEP : id;
      if (!out.includes(mapped)) out.push(mapped);
    }
    return out;
  };
  const SCHEMA: SettingsSchema<S> = {
    favorites: arrayThen(migrateFavorites),
    exportFormat: oneOf(["md", "csv"]),
    collapsed: check(isPlainObject),
  };
  const load = (raw: unknown): S => validateSettings(D, raw, SCHEMA);

  it("Defaults: leerer Ordner, Markdown, nichts eingeklappt gespeichert", () => {
    const s = load(null);
    expect(s.exportFolder).toBe("");
    expect(s.exportFormat).toBe("md");
    expect(s.collapsed["detail-values"]).toBeUndefined();
  });
  it("Altes data.json ohne die neuen Felder lädt ohne Absturz", () => {
    const s = load({ favorites: ["a"] });
    expect(s.favorites).toEqual(["a"]);
    expect(s.exportFolder).toBe("");
    expect(s.exportFormat).toBe("md");
  });
  it("beschädigtes data.json fällt feldweise auf die Defaults zurück", () => {
    const s = load({ favorites: null, exportFolder: 42, exportFormat: "pdf", collapsed: "nope" });
    expect(s.favorites).toEqual([]);
    expect(s.exportFolder).toBe("");
    expect(s.exportFormat).toBe("md");
    expect(s.collapsed).toEqual({});
  });
  it("schreibt den Schlaf-Favoriten auf die neue Metrik um", () => {
    expect(load({ favorites: ["HKCategoryTypeIdentifierSleepAnalysis", SLEEP_ASLEEP] }).favorites).toEqual([SLEEP_ASLEEP]);
  });
  it("zwei Instanzen teilen keine Default-Referenz (kein Cross-Instance-Leak)", () => {
    const first = load(null);
    first.collapsed["detail-values"] = true;
    first.favorites.push("HKQuantityTypeIdentifierStepCount");
    const second = load(null);
    expect(second.collapsed["detail-values"]).toBeUndefined();
    expect(second.favorites).toEqual([]);
  });
});
