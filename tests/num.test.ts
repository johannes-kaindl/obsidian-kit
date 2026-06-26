import { describe, it, expect } from "vitest";
import { clampInt } from "../src/pure/num";

describe("clampInt", () => {
  it("parsed gültigen String und clamped in-range", () => {
    expect(clampInt("42", 0, 100, 7)).toBe(42);
  });
  it("akzeptiert number-Eingabe direkt", () => {
    expect(clampInt(42, 0, 100, 7)).toBe(42);
  });
  it("clamped über max", () => {
    expect(clampInt("999", 0, 100, 7)).toBe(100);
  });
  it("clamped unter min", () => {
    expect(clampInt("-5", 0, 100, 7)).toBe(0);
  });
  it("fällt bei nicht-numerischem String auf fallback", () => {
    expect(clampInt("abc", 0, 100, 7)).toBe(7);
  });
  it("fällt bei leerem String auf fallback", () => {
    expect(clampInt("", 0, 100, 7)).toBe(7);
  });
  it("truncated Float zu Int", () => {
    expect(clampInt(3.9, 0, 100, 7)).toBe(3);
  });
  it("fällt bei NaN-number auf fallback", () => {
    expect(clampInt(Number.NaN, 0, 100, 7)).toBe(7);
  });
});
