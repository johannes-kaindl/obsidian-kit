import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KIT_VERSION } from "../src/pure/index";

describe("KIT_VERSION", () => {
  it("stimmt mit der Version in package.json überein", () => {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    expect(KIT_VERSION).toBe(pkg.version);
  });
});
