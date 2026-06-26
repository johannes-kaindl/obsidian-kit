import { describe, it, expect } from "vitest";
import { normalizeEndpoint, resolveActiveEndpoint } from "../src/pure/endpoint";

describe("normalizeEndpoint", () => {
  it("lässt einen blanken Host unverändert", () => {
    expect(normalizeEndpoint("http://host:1234")).toBe("http://host:1234");
  });
  it("strippt trailing slashes", () => {
    expect(normalizeEndpoint("http://host:1234///")).toBe("http://host:1234");
  });
  it("strippt ein trailing /v1", () => {
    expect(normalizeEndpoint("http://host:1234/v1")).toBe("http://host:1234");
  });
  it("strippt /v1/ mit trailing slash", () => {
    expect(normalizeEndpoint("http://host:1234/v1/")).toBe("http://host:1234");
  });
  it("trimmt Whitespace", () => {
    expect(normalizeEndpoint("  http://host:1234/v1  ")).toBe("http://host:1234");
  });
});

describe("resolveActiveEndpoint", () => {
  const reachable = (...up: string[]) => (ep: string) => Promise.resolve(up.includes(ep));

  it("liefert den ersten erreichbaren Endpoint", async () => {
    const r = await resolveActiveEndpoint(
      ["http://a:1", "http://b:2"],
      reachable("http://a:1", "http://b:2"),
    );
    expect(r).toBe("http://a:1");
  });
  it("überspringt nicht-erreichbare und nimmt den nächsten erreichbaren", async () => {
    const r = await resolveActiveEndpoint(["http://a:1", "http://b:2"], reachable("http://b:2"));
    expect(r).toBe("http://b:2");
  });
  it("gibt null zurück, wenn keiner erreichbar ist", async () => {
    const r = await resolveActiveEndpoint(["http://a:1", "http://b:2"], reachable());
    expect(r).toBeNull();
  });
  it("gibt null bei leerer Liste zurück", async () => {
    expect(await resolveActiveEndpoint([], reachable("http://a:1"))).toBeNull();
  });
  it("überspringt leere/whitespace-Einträge", async () => {
    const seen: string[] = [];
    const r = await resolveActiveEndpoint(
      ["", "   ", "http://b:2"],
      ep => { seen.push(ep); return Promise.resolve(ep === "http://b:2"); },
    );
    expect(r).toBe("http://b:2");
    expect(seen).toEqual(["http://b:2"]); // leere Einträge erzeugen keinen ping
  });
  it("normalisiert Einträge vor dem ping (ping sieht den normalisierten Endpoint)", async () => {
    const seen: string[] = [];
    const r = await resolveActiveEndpoint(
      ["  http://host:1234/v1/  "],
      ep => { seen.push(ep); return Promise.resolve(true); },
    );
    expect(seen).toEqual(["http://host:1234"]);
    expect(r).toBe("http://host:1234");
  });
  it("stoppt beim ersten Treffer (pingt spätere nicht)", async () => {
    const seen: string[] = [];
    await resolveActiveEndpoint(
      ["http://a:1", "http://b:2"],
      ep => { seen.push(ep); return Promise.resolve(true); },
    );
    expect(seen).toEqual(["http://a:1"]);
  });
});
