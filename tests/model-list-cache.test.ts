import { describe, it, expect, vi } from "vitest";
import { createModelListCache } from "../src/pure/model-list-cache";

function client(models: string[], reachable = false) {
  return {
    listModels: vi.fn(() => Promise.resolve(models)),
    probe: vi.fn(() => Promise.resolve({ reachable })),
  };
}

describe("createModelListCache", () => {
  it("fragt denselben Schluessel nur einmal ab", async () => {
    const cache = createModelListCache();
    const c = client(["a"]);
    const [r1, r2] = await Promise.all([cache.load("k", c), cache.load("k", c)]);
    expect(r1).toEqual({ models: ["a"], reachable: true });
    expect(r2).toEqual({ models: ["a"], reachable: true });
    expect(c.listModels).toHaveBeenCalledTimes(1);
  });

  it("probt nur, wenn die Liste leer bleibt", async () => {
    const withList = client(["a"]);
    await createModelListCache().load("k", withList);
    expect(withList.probe).not.toHaveBeenCalled();

    const empty = client([], true);
    const r = await createModelListCache().load("k", empty);
    expect(empty.probe).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ models: [], reachable: true });
  });

  it("liefert offline, wenn kein Client da ist", async () => {
    expect(await createModelListCache().load("k", undefined))
      .toEqual({ models: [], reachable: false });
  });

  it("verwirft nach invalidate und fragt erneut", async () => {
    const cache = createModelListCache();
    const c = client(["a"]);
    await cache.load("k", c);
    cache.invalidate("k");
    await cache.load("k", c);
    expect(c.listModels).toHaveBeenCalledTimes(2);
  });

  it("reisst bei einem Fehlschlag nur den eigenen Eintrag mit", async () => {
    const cache = createModelListCache();
    const failing = {
      listModels: () => Promise.reject(new Error("boom")),
      probe: () => Promise.resolve({ reachable: false }),
    };
    const first = cache.load("k", failing);
    cache.invalidate("k");
    const good = client(["a"]);
    const second = cache.load("k", good);
    expect(await first).toEqual({ models: [], reachable: false });
    expect(await second).toEqual({ models: ["a"], reachable: true });
    // Der Fehlschlag darf den neueren Eintrag nicht aus dem Cache raeumen.
    await cache.load("k", good);
    expect(good.listModels).toHaveBeenCalledTimes(1);
  });

  // Vertrag: der Consumer ruft clear() beim Schliessen des Settings-Tabs (vault-rags hide()
  // tut das). Ohne den Aufruf bleibt „nicht erreichbar" fuer die Sitzung stehen — der Cache
  // haelt Promises und ueberlebt jeden Tab-Neuaufbau.
  it("verwirft mit clear() ALLE Listen und fragt danach erneut", async () => {
    const cache = createModelListCache();
    const a = client(["a"]);
    const b = client(["b"]);
    await Promise.all([cache.load("a", a), cache.load("b", b)]);
    cache.clear();
    await Promise.all([cache.load("a", a), cache.load("b", b)]);
    expect(a.listModels).toHaveBeenCalledTimes(2);
    expect(b.listModels).toHaveBeenCalledTimes(2);
  });

  it("zaehlt Generationen hoch", () => {
    const cache = createModelListCache();
    expect(cache.generation()).toBe(0);
    expect(cache.bump()).toBe(1);
    expect(cache.generation()).toBe(1);
  });
});
