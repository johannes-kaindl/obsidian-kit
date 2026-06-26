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
  {
    // Test-Fixture: ein Obsidian-Double ist inhärent lose typisiert (es bildet eine
    // any-lastige Runtime-API nach). Diese type-checked-Regeln sind hier untauglich;
    // file-scoped gelockert (PROF-OBS-08 erlaubt das mit Begründung, statt Inline-disables).
    files: ["src/testing/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
