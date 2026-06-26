# obsidian-kit v0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das `obsidian-kit`-Repo bis zur ersten Release v0.1.0 aufbauen — die verifizierte „NOW"-Modulmenge (ThinkSplitter, parseSSE, normalizeEndpoint, clampInt, i18n-Engine als `pure`; obsidian-test-mock als `testing`), mit Tests, Doku und CI, lokal grün.

**Architecture:** Source-Library (kein Plugin). Drei Subpfade via `exports`-Map auf rohe `.ts` (`obsidian-kit/pure`, `obsidian-kit/testing`; `src/obsidian/` reserviert, in v0.1.0 leer). Konsumenten ziehen es per git-Pin und inlinen es mit ihrem eigenen esbuild. Kein Kit-Build-Schritt. Vollständige Begründung + Evidenz: [`../specs/2026-06-26-obsidian-kit-spec.md`](../specs/2026-06-26-obsidian-kit-spec.md).

**Tech Stack:** TypeScript 5.5 (ESM, `moduleResolution: Bundler`), vitest 2, eslint 9 + typescript-eslint 8. Node ≥20 für Tests. AGPL-3.0-or-later.

## Global Constraints

- **pure-Reinheit:** kein `obsidian`-Import in `src/pure/**` (PROF-OBS-03/04) — per eslint `no-restricted-imports` erzwungen, CI-gated.
- **Verteilung:** raw `.ts`, kein Build; `exports`-Map zeigt auf `.ts`. Kein `main.js`/`manifest.json` (Kit ist kein Plugin).
- **Versionierung:** SemVer **ohne v-Präfix** (`0.1.0`).
- **package.json:** `type: module`, `license: AGPL-3.0-or-later`.
- **i18n:** positional `{0}`-Platzhalter, EN kanonisch, `t`-Fallback `currentLang → en → key`.
- **Tests:** vitest, `describe/it/expect`, **kein** `.only`/`.skip` im Commit (PROF-TS-03).
- **Commits:** häufig, pro Task; Message-Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `package.json` | Identität, `exports`-Map, scripts (test/typecheck/lint), devDeps |
| `tsconfig.json` | TS-Compileroptionen (strict, Bundler, ES2022) |
| `eslint.config.mjs` | typescript-eslint recommendedTypeChecked + pure-Layer-`no-restricted-imports`-Guard |
| `vitest.config.ts` | node env, globals |
| `src/pure/think-splitter.ts` | `class ThinkSplitter` (byte-identisch übernommen) |
| `src/pure/sse.ts` | `parseSSE` (byte-identischer Core übernommen; **ohne** `streamSSE`) |
| `src/pure/endpoint.ts` | `normalizeEndpoint` (byte-identisch übernommen) |
| `src/pure/num.ts` | `clampInt` (aus kuro-Referenz konsolidiert) |
| `src/pure/i18n.ts` | i18n-Engine + `defineStrings` (aus img-to-md refactored) |
| `src/pure/index.ts` | Barrel-Export + `KIT_VERSION` |
| `src/testing/obsidian-mock.ts` | `createObsidianMock()` — Superset-Merge der 5 Plugin-Mocks |
| `tests/*.test.ts` | vitest-Suites je Modul |
| `README.md` · `MIGRATION.md` · `CHANGELOG.md` · `CONTRIBUTING.md` | Doku (§G des Spec) |
| `.github/workflows/ci.yml` | CI-Gate (typecheck+test+lint) |

---

## Task 1: Repo-Scaffold + Toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`

**Interfaces:**
- Produces: lauffähige Toolchain (`npm test`, `npm run typecheck`, `npm run lint`), `exports`-Map mit `./pure` + `./testing`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "obsidian-kit",
  "version": "0.1.0",
  "description": "Shared, drift-free modules extracted from Johannes Kaindl's Obsidian plugins",
  "type": "module",
  "license": "AGPL-3.0-or-later",
  "author": "Johannes Kaindl",
  "exports": {
    "./pure": "./src/pure/index.ts",
    "./testing": "./src/testing/obsidian-mock.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@types/node": "^20",
    "eslint": "^9",
    "typescript": "^5.5",
    "typescript-eslint": "^8",
    "vitest": "^2"
  }
}
```

Hinweis: `obsidian` ist **keine** devDep des Kit (die pure-Schicht braucht es nicht; der test-mock ersetzt es). Das hält `npm install` schlank und erzwingt Reinheit strukturell.

- [ ] **Step 2: `tsconfig.json`** (analog Scaffold, ohne obsidian-Mock-Alias — PROF-OBS-08)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: `eslint.config.mjs`** mit pure-Layer-Guard

```js
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
      "no-restricted-imports": ["error", { paths: [{ name: "obsidian", message: "pure-Schicht muss obsidian-frei bleiben (PROF-OBS-03/04)." }] }],
    },
  },
);
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", globals: true },
});
```

- [ ] **Step 5: `npm install` + Toolchain-Smoke**

Run: `npm install && npx tsc --noEmit`
Expected: install ok; tsc gibt nichts aus (noch keine src-Dateien → ggf. „No inputs were found" — dann erst nach Task 2 grün, akzeptabel).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json eslint.config.mjs vitest.config.ts package-lock.json
git commit -m "build: obsidian-kit Toolchain-Scaffold (ts/vitest/eslint + pure-Guard)"
```

---

## Task 2: ThinkSplitter (pure)

**Files:**
- Create: `src/pure/think-splitter.ts`, `tests/think-splitter.test.ts`

**Interfaces:**
- Produces: `class ThinkSplitter { push(text: string): { content: string; reasoning: string }; flush(): { content: string; reasoning: string } }`

- [ ] **Step 1: Test übernehmen** (byte-identisch aus `image-to-markdown/tests/think_splitter.test.ts`, nur Import-Pfad `../src/pure/think-splitter`). 9 Cases (Plaintext, ganzer Block, Text dazwischen, mehrere Blöcke, Tag über push-Grenzen, offenes think, einzelnes `<`, flush content-Rest, flush reasoning-Rest).

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/think-splitter.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Modul übernehmen** — `image-to-markdown/src/think_splitter.ts` **byte-identisch** nach `src/pure/think-splitter.ts` kopieren (0 Imports, keine Änderung am Code; TSDoc-Header bereits vorhanden).

- [ ] **Step 4: Run → PASS** — `npx vitest run tests/think-splitter.test.ts` → 9 passed. Zusätzlich `cmp` gegen die Quelle zur Drift-Sicherung.

- [ ] **Step 5: Commit** — `git commit -m "feat(pure): ThinkSplitter (byte-identisch aus img-to-md/vault-rag)"`

---

## Task 3: parseSSE (pure)

**Files:**
- Create: `src/pure/sse.ts`, `tests/sse.test.ts`

**Interfaces:**
- Produces: `parseSSE(buffer: string): { content: string[]; reasoning: string[]; model?: string; rest: string; done: boolean }`
- Note: `streamSSE` bleibt **lokal** je Plugin (Transport divergiert fetch/XHR) — **nicht** ins Kit.

- [ ] **Step 1: Test** — die `describe("parseSSE", …)`-Suite aus `image-to-markdown/tests/sse.test.ts` (Z. 13–50, 8 Cases: content-Deltas, reasoning-Deltas, Trennung, `[DONE]`, `\r\n`, rest, model erstes Vorkommen, model undefined). Import: `import { parseSSE } from "../src/pure/sse";`. Die `streamSSE`-Suite **weglassen**.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Modul** — `src/pure/sse.ts` = die `parseSSE`-Funktion aus `image-to-markdown/src/sse.ts` (Z. 1–27), **ohne** den `import { ThinkSplitter }` und **ohne** `streamSSE`. Header-TSDoc übernehmen.

```ts
/** Akkumuliert OpenAI-SSE-Deltas (content + reasoning_content) aus einem (Teil-)Buffer;
 *  unvollständige letzte Zeile → rest. `model` = erstes im Buffer gesehenes Chunk-`model`-Feld.
 *  Reine Funktion — kein Zustand. */
export function parseSSE(buffer: string): { content: string[]; reasoning: string[]; model?: string; rest: string; done: boolean } {
  // … (Z. 7–26 byte-gleich übernehmen)
}
```

- [ ] **Step 4: Run → PASS** (8 passed).

- [ ] **Step 5: Commit** — `git commit -m "feat(pure): parseSSE (pure Core; streamSSE bleibt plugin-lokal)"`

---

## Task 4: normalizeEndpoint (pure)

**Files:**
- Create: `src/pure/endpoint.ts`, `tests/endpoint.test.ts`

**Interfaces:**
- Produces: `normalizeEndpoint(endpoint: string): string`

- [ ] **Step 1: Test** (neu — sichert die dokumentierte Semantik: trailing-Slashes + ein `/v1` strippen)

```ts
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
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Modul** — `vault-rag/src/endpoint.ts` byte-identisch nach `src/pure/endpoint.ts` (TSDoc übernehmen).

- [ ] **Step 4: Run → PASS** (5 passed).

- [ ] **Step 5: Commit** — `git commit -m "feat(pure): normalizeEndpoint (byte-identisch aus vault-rag/endpoint.ts)"`

---

## Task 5: clampInt (pure)

**Files:**
- Create: `src/pure/num.ts`, `tests/num.test.ts`

**Interfaces:**
- Produces: `clampInt(value: string | number, min: number, max: number, fallback: number): number`
- Quelle der Wahrheit: kuro `SettingsTab.ts:392` (`parseInt`+finite+trunc+clamp), erweitert um `number`-Eingaben für die numerischen Call-Sites (img-to-md/presentation).

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { clampInt } from "../src/pure/num";

describe("clampInt", () => {
  it("parsed gültigen String und clamped in-range", () => {
    expect(clampInt("42", 0, 100, 7)).toBe(42);
  });
  it("akzeptiert number-Eingabe direkt", () => {
    expect(clampInt(42, 0, 100, 7)).toBe(42);
  });
  it("clamped über max", () => {
    expect(clampInt("999", 0, 100, 7)).toBe(100);
  });
  it("clamped unter min", () => {
    expect(clampInt("-5", 0, 100, 7)).toBe(0);
  });
  it("fällt bei nicht-numerischem String auf fallback", () => {
    expect(clampInt("abc", 0, 100, 7)).toBe(7);
  });
  it("fällt bei leerem String auf fallback", () => {
    expect(clampInt("", 0, 100, 7)).toBe(7);
  });
  it("truncated Float zu Int", () => {
    expect(clampInt(3.9, 0, 100, 7)).toBe(3);
  });
  it("fällt bei NaN-number auf fallback", () => {
    expect(clampInt(Number.NaN, 0, 100, 7)).toBe(7);
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Modul**

```ts
/** Parsed einen Integer aus String oder Zahl und clamped ihn nach [min, max].
 *  Nicht-finite/ungültige Eingaben → `fallback`. Floats werden via Math.trunc zu Int (kein Round).
 *  Konsolidiert 5 divergente Inlinings (parseInt/Number/parseFloat) auf EINE Semantik;
 *  kanonische Quelle: kuro-gamification SettingsTab.clampInt (12 Call-Sites).
 *
 *  @example clampInt("42", 0, 100, 7) // → 42
 *  @example clampInt("abc", 0, 100, 7) // → 7 */
export function clampInt(value: string | number, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
```

- [ ] **Step 4: Run → PASS** (8 passed).

- [ ] **Step 5: Commit** — `git commit -m "feat(pure): clampInt (konsolidiert aus kuro-Referenz + 4 Inlinings)"`

---

## Task 6: i18n-Engine + defineStrings (pure)

**Files:**
- Create: `src/pure/i18n.ts`, `tests/i18n.test.ts`

**Interfaces:**
- Produces: `type Lang = "en" | "de"`; `pickLang(raw?: string | null): Lang`; `setLang(lang: Lang): void`; `getLang(): Lang`; `defineStrings(dicts: Record<Lang, Record<string, string>>): void`; `t(key: string, ...args: (string | number)[]): string`
- Refactor ggü. img-to-md: STRINGS werden **injiziert** (`defineStrings`) statt modul-fest. Plugins behalten ihre Dicts (Spec §5).

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { pickLang, setLang, getLang, defineStrings, t } from "../src/pure/i18n";

beforeEach(() => {
  setLang("en");
  defineStrings({
    en: { "hi": "Hello", "card": "Image {0}/{1}" },
    de: { "hi": "Hallo", "card": "Bild {0}/{1}" },
  });
});

describe("i18n", () => {
  it("pickLang erkennt de-Prefix, sonst en", () => {
    expect(pickLang("de-DE")).toBe("de");
    expect(pickLang("en-US")).toBe("en");
    expect(pickLang(null)).toBe("en");
  });
  it("setLang/getLang round-trip", () => {
    setLang("de"); expect(getLang()).toBe("de");
  });
  it("t nutzt aktuelle Sprache", () => {
    setLang("de"); expect(t("hi")).toBe("Hallo");
  });
  it("t fällt currentLang → en → key zurück", () => {
    setLang("de"); defineStrings({ en: { "only": "EN" }, de: {} });
    expect(t("only")).toBe("EN");
    expect(t("missing")).toBe("missing");
  });
  it("t interpoliert positional {0}/{1}", () => {
    expect(t("card", 3, 7)).toBe("Image 3/7");
  });
  it("unbesetzter Platzhalter bleibt stehen", () => {
    expect(t("card", 3)).toBe("Image 3/{1}");
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Modul** (img-to-md `i18n.ts` refactored: STRINGS → injizierte `strings`-Variable + `defineStrings`; `t` liest `strings` statt `STRINGS`; `defaultVisionPrompt` bleibt im Plugin)

```ts
// i18n-Engine (EN/DE) — pure (kein obsidian-/DOM-Import, PROF-OBS-03/04).
// Implementiert PROF-OBS-07 (_docs/docs/obsidian-i18n.md). Die Strings sind plugin-eigen
// und werden via defineStrings() injiziert; die Sprach-Detektion lebt in der obsidian-Schicht.
export type Lang = "en" | "de";
type Dict = Record<string, string>;

let currentLang: Lang = "en";
let strings: Record<Lang, Dict> = { en: {}, de: {} };

/** Wählt die Sprache aus einem rohen Locale-String (z.B. von obsidian.getLanguage()). */
export function pickLang(raw?: string | null): Lang {
  return raw && raw.toLowerCase().startsWith("de") ? "de" : "en";
}
export function setLang(lang: Lang): void { currentLang = lang; }
export function getLang(): Lang { return currentLang; }

/** Registriert die Plugin-eigenen UI-Strings. Einmalig vor dem ersten t() (typisch im onload). */
export function defineStrings(dicts: Record<Lang, Dict>): void { strings = dicts; }

/** Übersetzt key in der aktuellen Sprache; Fallback currentLang → en → key. {0},{1}… aus args. */
export function t(key: string, ...args: (string | number)[]): string {
  const raw = strings[currentLang][key] ?? strings.en[key] ?? key;
  return raw.replace(/\{(\d+)\}/g, (_m, i) => {
    const v = args[Number(i)];
    return v === undefined ? `{${i}}` : String(v);
  });
}
```

- [ ] **Step 4: Run → PASS** (6 passed).

- [ ] **Step 5: Commit** — `git commit -m "feat(pure): i18n-Engine + defineStrings (Engine/Strings-Split, PROF-OBS-07)"`

---

## Task 7: pure-Barrel + KIT_VERSION

**Files:**
- Create: `src/pure/index.ts`

**Interfaces:**
- Produces: Re-Export aller pure-Module + `export const KIT_VERSION: string`.

- [ ] **Step 1: Barrel**

```ts
export { ThinkSplitter } from "./think-splitter";
export { parseSSE } from "./sse";
export { normalizeEndpoint } from "./endpoint";
export { clampInt } from "./num";
export { type Lang, pickLang, setLang, getLang, defineStrings, t } from "./i18n";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.1.0";
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → grün.

- [ ] **Step 3: Commit** — `git commit -m "feat(pure): barrel-Export + KIT_VERSION"`

---

## Task 8: obsidian-test-mock (testing)

**Files:**
- Create: `src/testing/obsidian-mock.ts`, `tests/obsidian-mock.test.ts`

**Interfaces:**
- Produces: `createObsidianMock(overrides?: Partial<MockStubs>): MockStubs` — Superset-Merge der 5 Plugin-Mocks; Default-Stubs (`Notice`, `Plugin`, `PluginSettingTab`, `Setting`, `TFile`, `setIcon`, `makeFakeEl`, `makeFakeApp`) + `overrides` mergen/überschreiben.
- Quelle der Wahrheit: Merge von `image-to-markdown/tests/__mocks__/obsidian.ts` (Basis) + `vault-rag/…` (Superset: `toggleClass`, `AbstractInputSuggest`, `FuzzySuggestModal`, `TFolder`, `WorkspaceLeaf`) — die 5 bestehenden Mocks gegeneinander diffen, Vereinigung bilden.

- [ ] **Step 1: Quellen sammeln** — alle 5 `tests/__mocks__/obsidian.ts` lesen (img-to-md 60, vault-rag 98, json_viewer 298, kuro 116, presentation 81 LOC); gemeinsame Basis (`Notice/Plugin/PluginSettingTab/Setting/TFile` = 5/5, `setIcon` = 4/5) + plugin-spezifische Erweiterungen identifizieren.

- [ ] **Step 2: Smoke-Test schreiben**

```ts
import { describe, it, expect } from "vitest";
import { createObsidianMock } from "../src/testing/obsidian-mock";

describe("createObsidianMock", () => {
  it("liefert die Basis-Stubs", () => {
    const m = createObsidianMock();
    expect(typeof m.Notice).toBe("function");
    expect(typeof m.Plugin).toBe("function");
    expect(typeof m.Setting).toBe("function");
    expect(typeof m.setIcon).toBe("function");
  });
  it("erlaubt Override eigener Stubs (json_viewer happy-dom-Fall)", () => {
    const fakeEl = () => ({ custom: true });
    const m = createObsidianMock({ makeFakeEl: fakeEl as never });
    expect(m.makeFakeEl).toBe(fakeEl);
  });
  it("ein Setting-Builder ist chainbar (setName/addText)", () => {
    const m = createObsidianMock();
    const s = new m.Setting({});
    expect(s.setName("x")).toBe(s); // chainable
  });
});
```

- [ ] **Step 3: Run → FAIL**.

- [ ] **Step 4: Implementierung** — `createObsidianMock` als Factory: Default-`MockStubs`-Objekt (Vereinigung der 5 Mocks: chainbare `Setting`-Builder, `Notice`-Stub, `Plugin`/`PluginSettingTab`-Klassen, `TFile`/`TFolder`, `setIcon`-noop, `AbstractInputSuggest`/`FuzzySuggestModal`/`WorkspaceLeaf`, `makeFakeEl`/`makeFakeApp`-Helper) → `{ ...defaults, ...overrides }`.

- [ ] **Step 5: Run → PASS**.

- [ ] **Step 6: Commit** — `git commit -m "feat(testing): createObsidianMock (Superset-Merge der 5 Plugin-Mocks)"`

---

## Task 9: Dokumentation (§G des Spec)

**Files:**
- Create: `README.md`, `MIGRATION.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
- Delete: `README-START.md` (fehlplatzierte Plugin-Scaffold-Anleitung)
- Verify: jedes Modul hat TSDoc (Vertrag · Reinheit · ggf. kodifizierte Konvention · Beispiel)

- [ ] **Step 1: `README.md`** — Zweck (Drift killen) · Layering (pure/obsidian/testing) · Install-Snippet (git-Pin auf Codeberg-Tag) · Subpfad-Map · Versions-/Release-Politik · dual-forge · **„Neues Plugin ans Kit onboarden"** (Schritte). Absolute URLs (PROF-OBS-14, Renderer löst relative nicht auf).
- [ ] **Step 2: `MIGRATION.md`** — pro Modul „lokale Kopie → Kit-Import"; den teuren kuro-i18n-Fall (named→positional) ausführen.
- [ ] **Step 3: `CHANGELOG.md`** — `## 0.1.0` mit der NOW-Modulmenge.
- [ ] **Step 4: `CONTRIBUTING.md`** — „neues Modul hinzufügen": Regel-der-Drei-Gate · pure-vs-obsidian · exports-Map · Test+Doc-Beispiel · Changelog.
- [ ] **Step 5: TSDoc-Audit** — sicherstellen, dass jedes pure-Modul ein TSDoc trägt (ThinkSplitter/sse/endpoint haben es bereits; clampInt/i18n in den Tasks oben ergänzt). `README-START.md` löschen.
- [ ] **Step 6: Commit** — `git commit -m "docs: README/MIGRATION/CHANGELOG/CONTRIBUTING (§G Kohäsions-Doku)"`

---

## Task 10: CI-Gate

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI, die bei push/PR `typecheck + test + lint` fährt (kein Build). Codeberg-Spiegelung als Kommentar/Notiz dokumentiert.

- [ ] **Step 1: Workflow**

```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 2: lokale Gesamt-Verifikation** — `npm run typecheck && npm run lint && npm test` → alles grün.
- [ ] **Step 3: Commit** — `git commit -m "ci: typecheck+lint+test-Gate (kein Build — Source-Library)"`

---

## Phase 2 — Release v0.1.0 (CHECKPOINT: erfordert User-Go — outward-facing)

- Remotes anlegen (Codeberg `obsidian-kit` primär, GitHub-Mirror), `git remote add codeberg/github …`.
- Tag `0.1.0` setzen, **dual-forge lockstep pushen:** `git tag 0.1.0 && git push codeberg 0.1.0 && git push github 0.1.0`.
- CHANGELOG als Release-Notes.

## Phase 3 — Plugin-Migrationen (CHECKPOINT: erfordert User-Go — ändert fremde, teils released Repos)

- Reihenfolge: **img-to-md zuerst**, dann vault-rag (validieren die Entdopplung), dann presentation/kuro/json_viewer opportunistisch.
- Pro Plugin: git-Dep pinnen → lokale Kopie durch Kit-Import ersetzen → i18n auf Delegation umbauen → `npm run lint && typecheck && test` grün → committen.
- kuro-i18n separat (teuer, §5).

---

## Self-Review

- **Spec-Coverage:** Alle NOW-Module aus Spec §2 (ThinkSplitter T2, parseSSE T3, normalizeEndpoint T4, clampInt T5, i18n T6, obsidian-mock T8) + Doku §G (T9) + Verteilung/CI §6/§8 (T1/T10) abgedeckt. dom-safe/http bewusst **nicht** (rules-only). ✅
- **Platzhalter:** byte-identische Übernahmen referenzieren die exakte Quelle (kein „TBD"); Konsolidierungen (clampInt/i18n/mock) zeigen vollen Zielcode. ✅
- **Typ-Konsistenz:** `clampInt(value: string|number, …)` konsistent in T5+Barrel; i18n-Signaturen identisch in T6+Barrel; `createObsidianMock` konsistent in T8+Spec §4. ✅
