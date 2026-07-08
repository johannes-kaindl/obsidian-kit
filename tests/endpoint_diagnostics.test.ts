import { describe, it, expect } from "vitest";
import { classifyEndpointStatus, validateEndpointInput, ENDPOINT_PRESETS } from "../src/pure/endpoint_diagnostics";

describe("classifyEndpointStatus", () => {
  it("ok: HTTP 200 mit {data:[…]}-Form ist erreichbar", () => {
    const s = classifyEndpointStatus({ kind: "response", status: 200, body: { data: [{ id: "m" }] } });
    expect(s.reachable).toBe(true);
    expect(s.kind).toBe("ok");
  });
  it("not-an-llm-api: HTTP 200 ohne data-Array (Fremd-Server)", () => {
    const s = classifyEndpointStatus({ kind: "response", status: 200, body: { foo: 1 } });
    expect(s.reachable).toBe(false);
    expect(s.kind).toBe("not-an-llm-api");
  });
  it("not-an-llm-api: HTTP 404 (falscher Pfad)", () => {
    expect(classifyEndpointStatus({ kind: "response", status: 404, body: undefined }).kind).toBe("not-an-llm-api");
  });
  it("refused: ECONNREFUSED (Node) und ERR_CONNECTION_REFUSED (Electron)", () => {
    expect(classifyEndpointStatus({ kind: "error", message: "connect ECONNREFUSED 127.0.0.1:1" }).kind).toBe("refused");
    expect(classifyEndpointStatus({ kind: "error", message: "net::ERR_CONNECTION_REFUSED" }).kind).toBe("refused");
  });
  it("unknown-host: ENOTFOUND", () => {
    expect(classifyEndpointStatus({ kind: "error", message: "getaddrinfo ENOTFOUND foo.invalid" }).kind).toBe("unknown-host");
  });
  it("timeout: eigenes Timeout-Signal", () => {
    expect(classifyEndpointStatus({ kind: "timeout" }).kind).toBe("timeout");
  });
  it("unknown: unbekannte Fehlermeldung wird roh durchgereicht", () => {
    const s = classifyEndpointStatus({ kind: "error", message: "irgendein seltsamer Fehler" });
    expect(s.kind).toBe("unknown");
    expect(s.raw).toBe("irgendein seltsamer Fehler");
    expect(s.klartext).toContain("irgendein seltsamer Fehler");
  });
});

describe("ENDPOINT_PRESETS", () => {
  it("enthält LM Studio (:1234) und Ollama (:11434) als Base-URLs ohne /v1", () => {
    const byLabel = Object.fromEntries(ENDPOINT_PRESETS.map(p => [p.label, p.url]));
    expect(byLabel["LM Studio"]).toBe("http://localhost:1234");
    expect(byLabel["Ollama"]).toBe("http://localhost:11434");
  });
});

describe("validateEndpointInput", () => {
  it("keine Warnung bei sauberem lokalem Endpoint mit Port", () => {
    expect(validateEndpointInput("http://localhost:1234")).toEqual([]);
  });
  it("keine Warnung bei leerer Eingabe", () => {
    expect(validateEndpointInput("  ")).toEqual([]);
  });
  it("warnt bei fehlendem Schema", () => {
    expect(validateEndpointInput("localhost:1234").map(w => w.rule)).toContain("scheme");
  });
  it("warnt bei lokalem Host ohne Port", () => {
    expect(validateEndpointInput("http://localhost").map(w => w.rule)).toContain("port");
    expect(validateEndpointInput("http://192.168.178.20").map(w => w.rule)).toContain("port");
  });
  it("warnt NICHT bei https-Domain ohne Port (läuft auf 443)", () => {
    expect(validateEndpointInput("https://api.example.com")).toEqual([]);
  });
  it("warnt bei RFC-5737-Platzhalter-IPs und 0.0.0.0", () => {
    expect(validateEndpointInput("http://192.0.2.5:1234").map(w => w.rule)).toContain("placeholder-ip");
    expect(validateEndpointInput("http://198.51.100.1:1234").map(w => w.rule)).toContain("placeholder-ip");
    expect(validateEndpointInput("http://203.0.113.7:1234").map(w => w.rule)).toContain("placeholder-ip");
    expect(validateEndpointInput("http://0.0.0.0:1234").map(w => w.rule)).toContain("placeholder-ip");
  });
});
