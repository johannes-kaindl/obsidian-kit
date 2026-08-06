import { describe, it, expect } from "vitest";
import { withTimeout } from "../src/pure/timeout";

/** Fake-Timer-Port: erlaubt es, den Ablauf ohne echte Zeit zu steuern und
 *  nachzuweisen, dass der Timer wieder geräumt wird. */
function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    port: {
      setTimeout(fn: () => void, _ms: number): number { const id = next++; pending.set(id, fn); return id; },
      clearTimeout(id: number): void { pending.delete(id); },
    },
    fire: () => { for (const fn of [...pending.values()]) fn(); },
    outstanding: () => pending.size,
  };
}

describe("withTimeout", () => {
  it("liefert den Wert, wenn die Arbeit vor dem Timeout fertig ist", async () => {
    const t = fakeTimers();
    const r = await withTimeout(Promise.resolve("fertig"), 1000, t.port);
    expect(r).toEqual({ timedOut: false, value: "fertig" });
  });

  it("meldet timedOut, wenn der Timer zuerst feuert", async () => {
    const t = fakeTimers();
    const nie = new Promise<string>(() => { /* wird nie erfuellt */ });
    const p = withTimeout(nie, 10, t.port);
    t.fire();
    expect(await p).toEqual({ timedOut: true });
  });

  it("raeumt den Timer, wenn die Arbeit zuerst fertig ist (sonst laeuft er nach)", async () => {
    const t = fakeTimers();
    await withTimeout(Promise.resolve(1), 1000, t.port);
    expect(t.outstanding()).toBe(0);
  });

  it("raeumt den Timer auch, wenn die Arbeit wirft", async () => {
    const t = fakeTimers();
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, t.port)).rejects.toThrow("boom");
    expect(t.outstanding()).toBe(0);
  });

  it("verschluckt einen Fehler der Arbeit nicht als Timeout", async () => {
    const t = fakeTimers();
    await expect(withTimeout(Promise.reject(new Error("HTTP 500")), 1000, t.port)).rejects.toThrow("HTTP 500");
  });
});
