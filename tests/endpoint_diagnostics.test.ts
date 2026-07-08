import { describe, it, expect } from "vitest";
import { classifyEndpointStatus } from "../src/pure/endpoint_diagnostics";

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
