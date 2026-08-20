// Kit-eslint: type-checked + pure-Layer-Reinheits-Guard.
// src/pure/** darf NICHT von "obsidian" importieren (PROF-OBS-03/04) — sonst bricht Node-Testbarkeit.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "src/vendor/"] },
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
    // Ein absichtlich ungenutzter Parameter heisst `_evt` — das ist die Konvention, nicht
    // eine Ausnahme des Test-Layers. Galt bis 2026-08-05 nur fuer src/testing/, weshalb
    // src/obsidian/folder-suggest.ts als einzige Produktivdatei rot war.
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Test-Fixture: ein Obsidian-Double ist inhärent lose typisiert (es bildet eine
    // any-lastige Runtime-API nach). Diese type-checked-Regeln sind hier untauglich;
    // file-scoped gelockert (PROF-OBS-08 erlaubt das mit Begründung, statt Inline-disables).
    //
    // Seit 2026-08-05 gilt die Lockerung auch fuer `tests/**`: wer das Double konsumiert,
    // erbt zwangslaeufig dessen `any`. Vorher standen dort 64 unsafe-*-Fehler, die sich nur
    // durch Casts auf erfundene Typen haetten stillstellen lassen — die haetten Sicherheit
    // vorgetaeuscht, wo die Runtime-API keine hat. `no-explicit-any` bleibt in `tests/`
    // bewusst AN: das Double konsumieren ist erlaubt, selbst `any` hinschreiben nicht.
    files: ["src/testing/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },
  {
    files: ["src/testing/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
