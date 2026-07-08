import { describe, it, expect } from "vitest";
import { suppressParams, reasoningHappened, isAlwaysOnThinker } from "../src/pure/reasoning";

describe("suppressParams", () => {
  it("gibt bei suppress=false ein leeres Objekt zurück", () => {
    expect(suppressParams(false)).toEqual({});
  });
  it("setzt bei suppress=true die drei Suppress-Keys mit exakten Werten", () => {
    expect(suppressParams(true)).toEqual({
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
      reasoning_budget: 0,
    });
  });
});

describe("reasoningHappened", () => {
  it("false, wenn weder reasoning-Feld noch <think>-Inhalt", () => {
    expect(reasoningHappened("nur content", undefined)).toBe(false);
  });
  it("true bei nicht-leerem reasoning-Feld", () => {
    expect(reasoningHappened("", "ich denke")).toBe(true);
  });
  it("false bei whitespace-only reasoning-Feld", () => {
    expect(reasoningHappened("", "   ")).toBe(false);
  });
  it("true bei inline <think> mit Inhalt", () => {
    expect(reasoningHappened("<think>hmm</think> antwort", undefined)).toBe(true);
  });
  it("false bei leerem <think></think>", () => {
    expect(reasoningHappened("<think></think> antwort", undefined)).toBe(false);
  });
  it("false bei whitespace-only <think>", () => {
    expect(reasoningHappened("<think>   </think>", undefined)).toBe(false);
  });
});

describe("isAlwaysOnThinker", () => {
  it("true für gpt-oss (Wortgrenze)", () => {
    expect(isAlwaysOnThinker("gpt-oss-20b")).toBe(true);
  });
  it("true für harmony, case-insensitiv", () => {
    expect(isAlwaysOnThinker("Harmony-Chat")).toBe(true);
  });
  it("false für ein normales Modell", () => {
    expect(isAlwaysOnThinker("qwen3:8b")).toBe(false);
  });
});
