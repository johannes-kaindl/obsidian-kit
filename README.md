# obsidian-kit

Geteilte, **drift-freie** Module, aus den Obsidian-Plugins von Johannes Kaindl extrahiert.

Dieses Repo ist **kein Plugin**, sondern eine **Quell-Bibliothek**: Module, die in mehreren Plugins belegt-doppelt vorlagen (Regel-der-Drei, gegen den echten Code verifiziert), leben hier **einmal** — versioniert, getestet, dokumentiert. Jedes Plugin bindet das Kit per **git-Dependency auf einen Release-Tag** ein und **inlined** es mit seinem eigenen esbuild. So gibt es nur noch *eine* Quelle pro Modul statt N driftender Copy-Paste-Kopien.

> **Warum kein Monorepo / npm-Publish / Submodule?** Jedes Plugin behält sein eigenes Repo und seinen eigenen Release-Takt (PROF-OBS-09). Das Kit wird beim Build inlined → kein Runtime-Overhead, keine zweite Registry-Identität. Begründung + Evidenz: [`docs/superpowers/specs/2026-06-26-obsidian-kit-spec.md`](docs/superpowers/specs/2026-06-26-obsidian-kit-spec.md).

## Layering

Drei Subpfade, über die `exports`-Map auf **rohe `.ts`** (kein Build-Schritt):

| Subpfad | Inhalt | Reinheit |
|---|---|---|
| `obsidian-kit/pure` | `ThinkSplitter`, `parseSSE`, `normalizeEndpoint`, `resolveActiveEndpoint`, `clampInt`, i18n-Engine, `KIT_VERSION` | **kein** obsidian-Import (Node-testbar, PROF-OBS-03/04) — per eslint erzwungen |
| `obsidian-kit/testing` | `createObsidianMock()` + alle Stubs (Obsidian-Test-Double) | nur im Test-Pfad, **nie** ins `main.js` gebündelt |
| `obsidian-kit/obsidian` | `collapsibleSection` (seit v0.12.0) · `ClockPort`/`realClock` (seit v0.14.0) — obsidian/runtime-gekoppelte Helfer | darf obsidian importieren |

`dom-safe` und `http` sind **bewusst nicht** im Kit: sie sind keine echte Code-Duplikation, sondern geteilte **Regeln** (PROF-OBS-12/13). Siehe Spec §2.

## Installation (in einem konsumierenden Plugin)

```jsonc
// package.json des Plugins
"dependencies": {
  "obsidian-kit": "git+https://codeberg.org/jkaindl/obsidian-kit.git#0.1.0"
}
```

Dann im Code:

```ts
import { ThinkSplitter, parseSSE, normalizeEndpoint, clampInt } from "obsidian-kit/pure";
import { pickLang, setLang, t, defineStrings } from "obsidian-kit/pure";
```

Für Tests (vitest-`resolve.alias` zeigt auf ein dünnes plugin-lokales `tests/__mocks__/obsidian.ts`, das das Kit-Mock re-exportiert):

```ts
// tests/__mocks__/obsidian.ts (im Plugin)
export * from "obsidian-kit/testing";
```

`tsc --noEmit` (mit `moduleResolution: "Bundler"`) und esbuild lösen die `exports`-Map direkt auf die `.ts` auf — **kein** Kit-Build nötig.

## Module

| Modul | Signatur | Kodifiziert |
|---|---|---|
| `ThinkSplitter` | `push(text) → {content, reasoning}` · `flush() → {content, reasoning}` | — |
| `parseSSE` | `parseSSE(buffer) → {content[], reasoning[], model?, finishReason?, rest, done}` | PROF-OBS-12 |
| `normalizeEndpoint` | `normalizeEndpoint(s) → string` | — |
| `resolveActiveEndpoint` | `resolveActiveEndpoint(endpoints, ping) → Promise<string\|null>` | — |
| `parseEndpointList` | `parseEndpointList(text) → string[]` (Textarea → geordnete, getrimmte, deduplizierte Liste) | — |
| `clampInt` | `clampInt(value: string\|number, min, max, fallback) → number` | — |
| i18n | `pickLang` · `setLang` · `getLang` · `defineStrings({en,de})` · `t(key, ...args)` | **PROF-OBS-07** |
| `createObsidianMock` | `createObsidianMock(overrides?) → MockStubs` | PROF-OBS-08 |
| `collapsibleSection` | `collapsibleSection(containerEl, {title, defaultCollapsed?, key?, storage?}) → HTMLElement` (Body-Container; startet eingeklappt) | — |
| `ClockPort` / `realClock` | Interface `{now(), setTimeout(fn, ms), clearTimeout(id)}` + `realClock` (echte `window`-Timer). Injizierter Timer-/Clock-Port: hält timer-nutzenden Code node-testbar (kein bares `window`), erfüllt Community-Store-Linter | — |

Jedes Modul trägt sein TSDoc am Source — bei der raw-`.ts`-Verteilung erscheint es direkt im IntelliSense/Hover des Konsumenten. Migrations-Rezepte: [`MIGRATION.md`](MIGRATION.md).

## Ein neues Plugin ans Kit onboarden

1. git-Dependency auf den aktuellen Tag pinnen (siehe Installation).
2. Lokale Kopie des Moduls löschen, Import auf `obsidian-kit/pure` umbiegen (Rezept je Modul in [`MIGRATION.md`](MIGRATION.md)).
3. i18n: die lokale `i18n.ts` auf Delegation umbauen (Strings bleiben lokal, Engine kommt aus dem Kit — siehe `MIGRATION.md`).
4. Test-Mock: `tests/__mocks__/obsidian.ts` → `export * from "obsidian-kit/testing";` (plugin-eigene Stubs via Override ergänzen).
5. `npm run lint && npm run typecheck && npm test` → grün, dann committen.

## Versionierung & Release

- **SemVer ohne v-Präfix** (`0.1.0`). Konsumenten pinnen einen Tag; ein Kit-Bump wird pro Plugin bewusst nachgezogen (es gibt **keinen** geteilten Runtime — Versions-Skew ist kein Laufzeitproblem).
- **Dual-Forge:** Tags werden im Lockstep nach **Codeberg (primär)** und **GitHub (Mirror)** gepusht (identische SHA). Fällt Codeberg aus, ist der GitHub-Mirror-Tag bit-identisch.
- Release-Notes aus [`CHANGELOG.md`](CHANGELOG.md).

## Entwicklung

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (inkl. pure-Layer-Reinheits-Guard)
npm test            # vitest run
```

Ein neues Modul hinzufügen: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Lizenz

AGPL-3.0-or-later.
