import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { realClock } from "../src/obsidian/clock";

// node-env (vitest.config.ts: environment "node") hat kein `window`. realClock ruft
// window.setTimeout/clearTimeout — daher window auf globalThis stubben (node hat die Timer
// global) + fake timers. Konsistent mit der DOM-freien Mock-Konvention (kein jsdom).
describe("realClock", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("now() liefert die aktuelle Wall-Clock (=== Date.now() unter fake timers)", () => {
    expect(realClock.now()).toBe(Date.now());
  });

  it("setTimeout feuert die Callback nach Ablauf der Zeit, nicht davor", () => {
    const fn = vi.fn();
    realClock.setTimeout(fn, 50);
    vi.advanceTimersByTime(49);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clearTimeout verhindert das Feuern", () => {
    const fn = vi.fn();
    const id = realClock.setTimeout(fn, 50);
    realClock.clearTimeout(id);
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
