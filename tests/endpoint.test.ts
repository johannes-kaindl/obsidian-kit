import { describe, it, expect } from "vitest";
import { normalizeEndpoint } from "../src/pure/endpoint";

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
