// Kit-eslint: type-checked + pure-Layer-Reinheits-Guard.
// src/pure/** darf NICHT von "obsidian" importieren (PROF-OBS-03/04) — sonst bricht Node-Testbarkeit.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: { project: ["./tsconfig.json"], tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["src/pure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "obsidian", message: "pure-Schicht muss obsidian-frei bleiben (PROF-OBS-03/04)." }] },
      ],
    },
  },
);
