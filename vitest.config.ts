import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", globals: true },
  resolve: {
    alias: { obsidian: fileURLToPath(new URL("./src/testing/obsidian-mock.ts", import.meta.url)) },
  },
});
