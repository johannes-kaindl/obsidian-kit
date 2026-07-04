import { describe, expect, it } from "vitest";
import { mergeSettings } from "../src/pure/settings";

interface Demo {
  name: string;
  count: number;
  flag: boolean;
  list: string[];
  nested: { a: number };
}

const DEFAULTS: Demo = {
  name: "default",
  count: 3,
  flag: true,
  list: ["x", "y"],
  nested: { a: 1 },
};

describe("mergeSettings", () => {
  it("liefert bei raw=null eine reine Default-Kopie", () => {
    expect(mergeSettings(DEFAULTS, null)).toEqual(DEFAULTS);
  });

  it("liefert bei raw=undefined eine reine Default-Kopie", () => {
    expect(mergeSettings(DEFAULTS, undefined)).toEqual(DEFAULTS);
  });

  it("liefert bei non-object raw (String/Zahl) eine Default-Kopie", () => {
    expect(mergeSettings(DEFAULTS, "kaputt")).toEqual(DEFAULTS);
    expect(mergeSettings(DEFAULTS, 42)).toEqual(DEFAULTS);
  });

  it("raw-Felder überschreiben Defaults shallow (Partial reicht)", () => {
    const merged = mergeSettings(DEFAULTS, { count: 9, list: ["z"] });
    expect(merged.count).toBe(9);
    expect(merged.list).toEqual(["z"]);
    expect(merged.name).toBe("default");
  });

  it("unbekannte raw-Felder bleiben erhalten (Verhaltensvertrag: lastRuns, Forward-Compat)", () => {
    const merged = mergeSettings(DEFAULTS, { extra: { foo: 1 } }) as Demo & {
      extra?: unknown;
    };
    expect(merged.extra).toEqual({ foo: 1 });
  });

  it("Referenz-Schutz: Array-Mutation am Ergebnis lässt Defaults intakt", () => {
    const merged = mergeSettings(DEFAULTS, null);
    merged.list.push("mutiert");
    expect(DEFAULTS.list).toEqual(["x", "y"]);
  });

  it("Referenz-Schutz: Plain-Object-Werte werden eine Ebene tief geklont", () => {
    const merged = mergeSettings(DEFAULTS, {});
    merged.nested.a = 99;
    expect(DEFAULTS.nested.a).toBe(1);
  });

  it("raw-Werte werden NICHT geklont (frisch aus JSON.parse — Referenz-Übernahme ok)", () => {
    const rawList = ["r"];
    const merged = mergeSettings(DEFAULTS, { list: rawList });
    expect(merged.list).toBe(rawList);
  });
});
