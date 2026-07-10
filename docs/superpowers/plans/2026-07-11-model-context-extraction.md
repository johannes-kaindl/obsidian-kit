# model-context.ts Extraktion + Versions-Reparatur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `parseLmStudioContext`/`parseOllamaContext` als neues Kit-Modul `model-context.ts` extrahieren (obsidian-kit 0.7.0), vault-crews auf diesen und den bereits existierenden `reasoning.ts`-Vendor umstellen (Dedupe), und Kits eigene Versions-Buchhaltung (`package.json`/`CHANGELOG.md`) rückwirkend geraderücken.

**Architecture:** Drei unabhängige git-Repos sind betroffen — `obsidian-kit` (neues pures Modul + Versions-Fix), `vault-crews` (Vendor-Migration + Facade-Refactor), `obsidian-plugins` (Dach-Repo, nur `REGISTRY.md`). Jeder Task committet in seinem eigenen Repo.

**Tech Stack:** TypeScript (strict), vitest, eslint. Kit: raw `.ts`-Verteilung ohne Build. vault-crews: esbuild-Plugin-Build, `check:pure`-Guard (kein `obsidian`-Import in `src/core`/`src/vendor`).

## Global Constraints

- **Kein Verhaltens-Change** bei Vendoring/Extraktion — Code wird 1:1 übernommen, nur Speicherort/Import-Pfad ändert sich (Spec „Ansatz: verbatim extrahieren").
- **Commit-Style:** Conventional Commits + Trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (beide Repos, s. AGENTS.md).
- **vault-crews `check:pure`:** `src/core/**` und `src/vendor/**` dürfen nie `from 'obsidian'` importieren — nach jedem vault-crews-Task `npm run check:pure` grün halten.
- **Kein npm-Publish, kein Tag-Push:** Git-Tags bleiben lokal (Dual-Forge-Push ist ein separater, expliziter Release-Schritt — hier nicht Teil des Plans).
- **Vendor-Header-Format:** `// vendored from obsidian-kit#<version>, src/pure/<datei>.ts` als erste Zeile jeder vendorten Datei (bestehende Konvention, s. `src/vendor/kit/endpoint_diagnostics.ts`).

---

## File Structure

**obsidian-kit** (`/Users/Shared/code/obsidian-plugins/obsidian-kit`):
- Create: `src/pure/model-context.ts` — `ModelContext`-Interface + `parseLmStudioContext`/`parseOllamaContext`.
- Create: `tests/model-context.test.ts` — Tests für beide Parser.
- Modify: `src/pure/index.ts` — Re-Export + `KIT_VERSION` Bump.
- Modify: `CHANGELOG.md` — Backfill 0.3.0–0.6.0 + neuer 0.7.0-Eintrag.
- Modify: `package.json` — `version: "0.4.0"` → `"0.7.0"`.

**vault-crews** (`/Users/Shared/code/obsidian-plugins/vault-crews`):
- Create: `src/vendor/kit/reasoning.ts` — vendorte Kopie aus Kit `0.7.0`.
- Create: `src/vendor/kit/model-context.ts` — vendorte Kopie aus Kit `0.7.0`.
- Modify: `src/core/model-info.ts` — wird zur reinen Re-Export-Fassade (keine eigene Logik mehr).
- Unverändert (Regressionscheck): `tests/core/model-info.test.ts`.

**obsidian-plugins** (`/Users/Shared/code/obsidian-plugins`, Dach-Repo):
- Modify: `REGISTRY.md` — neue Zeile (Kontextlängen-Parser), `reasoning.ts`-Zeile (vault-crews ergänzen), `endpoint_diagnostics`-Zeile (Drift-Flag entfernen).

---

### Task 1: Kit — `model-context.ts` extrahieren (TDD)

**Files:**
- Create: `/Users/Shared/code/obsidian-plugins/obsidian-kit/tests/model-context.test.ts`
- Create: `/Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure/model-context.ts`
- Modify: `/Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure/index.ts`

**Interfaces:**
- Produces: `interface ModelContext { maxContextLength?: number; loadedContextLength?: number }`, `parseLmStudioContext(json: unknown, model: string): ModelContext | null`, `parseOllamaContext(json: unknown): ModelContext | null` — beide re-exportiert aus `obsidian-kit/pure`.

- [ ] **Step 1: Write the failing test**

Datei `/Users/Shared/code/obsidian-plugins/obsidian-kit/tests/model-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseLmStudioContext, parseOllamaContext } from "../src/pure/model-context";

describe("parseLmStudioContext", () => {
  const json = { data: [
    { id: "qwen3-8b", max_context_length: 32768, loaded_context_length: 8192 },
    { id: "other", max_context_length: 4096 },
  ] };
  it("liest loaded + max für das getroffene Modell", () => {
    expect(parseLmStudioContext(json, "qwen3-8b")).toEqual({ maxContextLength: 32768, loadedContextLength: 8192 });
  });
  it("gibt null bei fehlendem Modell", () => {
    expect(parseLmStudioContext(json, "missing")).toBeNull();
  });
  it("gibt null bei nicht-Array data", () => {
    expect(parseLmStudioContext({ data: "x" }, "a")).toBeNull();
  });
});

describe("parseOllamaContext", () => {
  it("liest <arch>.context_length aus model_info", () => {
    expect(parseOllamaContext({ model_info: { "qwen3.context_length": 40960, "general.name": "q" } }))
      .toEqual({ maxContextLength: 40960 });
  });
  it("gibt null wenn kein *.context_length vorhanden", () => {
    expect(parseOllamaContext({ model_info: { "general.name": "q" } })).toBeNull();
  });
  it("gibt null bei fehlendem model_info", () => {
    expect(parseOllamaContext({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Shared/code/obsidian-plugins/obsidian-kit && npx vitest run tests/model-context.test.ts`
Expected: FAIL — `Cannot find module '../src/pure/model-context'` (Datei existiert noch nicht).

- [ ] **Step 3: Write minimal implementation**

Datei `/Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure/model-context.ts`:

```ts
export interface ModelContext {
  maxContextLength?: number;
  loadedContextLength?: number;
}

function findById(json: unknown, model: string): Record<string, unknown> | null {
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const hit = (data as unknown[]).find((x) => (x as { id?: unknown }).id === model);
  return (hit as Record<string, unknown> | undefined) ?? null;
}

/** LM Studio GET /api/v0/models → per-Modell-Kontextlängen. null wenn Modell fehlt. */
export function parseLmStudioContext(json: unknown, model: string): ModelContext | null {
  const m = findById(json, model);
  if (!m) return null;
  const out: ModelContext = {};
  if (typeof m.max_context_length === "number") out.maxContextLength = m.max_context_length;
  if (typeof m.loaded_context_length === "number") out.loadedContextLength = m.loaded_context_length;
  return out;
}

/** Ollama POST /api/show → model_info hält "<arch>.context_length". null wenn nicht vorhanden. */
export function parseOllamaContext(json: unknown): ModelContext | null {
  const info = (json as { model_info?: unknown }).model_info;
  if (!info || typeof info !== "object") return null;
  for (const [k, v] of Object.entries(info as Record<string, unknown>)) {
    if (k.endsWith(".context_length") && typeof v === "number") return { maxContextLength: v };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Shared/code/obsidian-plugins/obsidian-kit && npx vitest run tests/model-context.test.ts`
Expected: PASS (6 Tests grün).

- [ ] **Step 5: Re-Export + KIT_VERSION bump**

In `/Users/Shared/code/obsidian-plugins/obsidian-kit/src/pure/index.ts` nach der `reasoning`-Export-Zeile ergänzen:

```ts
export { type ModelContext, parseLmStudioContext, parseOllamaContext } from "./model-context";
```

Und die letzte Zeile ändern von:

```ts
export const KIT_VERSION = "0.6.0";
```

zu:

```ts
export const KIT_VERSION = "0.7.0";
```

- [ ] **Step 6: Volle Kit-Verifikation**

Run: `cd /Users/Shared/code/obsidian-plugins/obsidian-kit && npm test && npm run typecheck && npm run lint`
Expected: alle drei grün (kein Fehler, kein Lint-Warning in den neuen Dateien).

- [ ] **Step 7: Commit**

```bash
cd /Users/Shared/code/obsidian-plugins/obsidian-kit
git add tests/model-context.test.ts src/pure/model-context.ts src/pure/index.ts
git commit -m "$(cat <<'EOF'
feat(model-context): parseLmStudioContext/parseOllamaContext ins Kit extrahieren (0.7.0), TDD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Kit — Versions-Reparatur (CHANGELOG-Backfill + package.json-Bump)

**Files:**
- Modify: `/Users/Shared/code/obsidian-plugins/obsidian-kit/CHANGELOG.md`
- Modify: `/Users/Shared/code/obsidian-plugins/obsidian-kit/package.json:3`

**Interfaces:**
- Consumes: Task 1 (der 0.7.0-Eintrag beschreibt exakt das dort gebaute Modul).
- Produces: `package.json` `version` synchron mit dem `KIT_VERSION`-Wert aus Task 1 und mit dem lokalen Git-Tag, der in Step 4 gesetzt wird.

- [ ] **Step 1: CHANGELOG.md — fünf Einträge einfügen**

In `/Users/Shared/code/obsidian-plugins/obsidian-kit/CHANGELOG.md` direkt **vor** der Zeile `## 0.2.0 — resolveActiveEndpoint` folgenden Block einfügen (Reihenfolge: neueste zuerst):

```markdown
## 0.7.0 — model-context.ts

### `obsidian-kit/pure`
- **`parseLmStudioContext(json, model)`** / **`parseOllamaContext(json)`** — Kontextlängen-Parser für lokale LLM-Server: LM Studio `GET /api/v0/models` (`max_context_length`/`loaded_context_length` pro Modell) und Ollama `POST /api/show` (`model_info["<arch>.context_length"]`, architektur-agnostische Key-Suche). Extrahiert aus vault-crews (bewährt, released 0.4.0).

Konsumenten: vault-crews (Migration).

## 0.6.0 — reasoning.ts

### `obsidian-kit/pure`
- **`ThinkingSupport`** (Typ) + **`suppressParams(suppress)`** — Union-Params zum Abschalten von Reasoning über viele lokale Server (`reasoning_effort:"none"` + `chat_template_kwargs.enable_thinking:false` + `reasoning_budget:0`).
- **`reasoningHappened(content, reasoning)`** — hat das Modell real gedacht? (separates reasoning-Feld oder inline `<think>` mit Inhalt).
- **`isAlwaysOnThinker(model)`** — Modelle mit fest verdrahtetem Reasoning (`gpt-oss`, `harmony`).

Verbatim extrahiert aus vault-rag/markdown-presentation (byte-identische Dublette, Spec 2026-07-08). Konsumenten: vault-rag, markdown-presentation (Migration).

## 0.5.0 — classifyEndpointStatus + ENDPOINT_PRESETS

### `obsidian-kit/pure`
- **`classifyEndpointStatus(input)`** — Klartext-Fehlerklassen (`refused`/`unknown-host`/`timeout`/`not-an-llm-api`/`unknown`) aus einem Probe-Rohsignal.
- **`ENDPOINT_PRESETS`** + **`validateEndpointInput`** — Provider-Presets (LM Studio/Ollama) + Eingabe-Warnungen für Endpoint-Konfiguration.

Konsumenten: vault-rag, vault-crews.

## 0.4.0 — mergeSettings

### `obsidian-kit/pure`
- **`mergeSettings<T>(defaults, raw)`** — Shallow-Merge gespeicherter Plugin-Settings über Defaults (`loadData`→`saveData`-Muster) mit Referenz-Schutz; unbekannte `raw`-Felder bleiben erhalten.

Konsumenten: alle 5 Plugin-Repos.

## 0.3.0 — finishReason + parseEndpointList

### `obsidian-kit/pure`
- **`parseSSE`** liefert jetzt zusätzlich **`finishReason`** (erstes non-empty `finish_reason` im SSE-Stream).
- **`parseEndpointList`** — Multi-Endpoint-Textarea-Parser (Fallback-Listen aus Freitext).

Konsumenten: image-to-markdown, markdown-presentation, vault-rag, vault-crews.

```

Die bestehenden Abschnitte `## 0.2.0 — resolveActiveEndpoint` und `## 0.1.0 — Erste Release` bleiben unverändert darunter stehen.

- [ ] **Step 2: package.json-Version bumpen**

In `/Users/Shared/code/obsidian-plugins/obsidian-kit/package.json` Zeile 3 ändern von:

```json
  "version": "0.4.0",
```

zu:

```json
  "version": "0.7.0",
```

- [ ] **Step 3: Verifikation**

Run: `cd /Users/Shared/code/obsidian-plugins/obsidian-kit && npm test && npm run typecheck && npm run lint`
Expected: alle drei weiterhin grün (reine Doku-/Metadaten-Änderung, kein Code betroffen).

- [ ] **Step 4: Commit + lokaler Tag**

```bash
cd /Users/Shared/code/obsidian-plugins/obsidian-kit
git add CHANGELOG.md package.json
git commit -m "$(cat <<'EOF'
chore: release 0.7.0 (model-context.ts) + CHANGELOG-Backfill 0.3.0–0.6.0

package.json und CHANGELOG.md hinkten den Tags 0.3.0–0.6.0 hinterher (Feature-
Commits wurden getaggt, aber package.json blieb auf 0.4.0 stehen und CHANGELOG.md
endete bei 0.2.0). Rückwirkend nachdokumentiert, jetzt wieder synchron.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git tag 0.7.0
```

Kein `git push`/`push --tags` — Tag bleibt lokal (Global Constraints).

---

### Task 3: vault-crews — Vendoring + Facade-Refactor (Dedupe)

**Files:**
- Create: `/Users/Shared/code/obsidian-plugins/vault-crews/src/vendor/kit/reasoning.ts`
- Create: `/Users/Shared/code/obsidian-plugins/vault-crews/src/vendor/kit/model-context.ts`
- Modify: `/Users/Shared/code/obsidian-plugins/vault-crews/src/core/model-info.ts`
- Test (unverändert, Regressionscheck): `/Users/Shared/code/obsidian-plugins/vault-crews/tests/core/model-info.test.ts`

**Interfaces:**
- Consumes: `src/core/local-llm-client.ts:9` (`import { parseLmStudioContext, parseOllamaContext, suppressParams } from './model-info'`) und `src/core/orchestrator.ts:15` (`import { isAlwaysOnThinker } from './model-info'`) — beide Importe müssen nach dem Refactor unverändert funktionieren.
- Produces: `src/core/model-info.ts` exportiert weiterhin exakt `ModelContext`, `parseLmStudioContext`, `parseOllamaContext`, `suppressParams`, `isAlwaysOnThinker` (gleiche Namen/Signaturen wie vorher).

- [ ] **Step 1: `reasoning.ts` vendoren**

Datei `/Users/Shared/code/obsidian-plugins/vault-crews/src/vendor/kit/reasoning.ts`:

```ts
// vendored from obsidian-kit#0.7.0, src/pure/reasoning.ts
export type ThinkingSupport = "none" | "hybrid" | "always";

/** Union-Params zum Abschalten von Reasoning über viele lokale Server hinweg.
 *  Leeres Objekt, wenn nicht unterdrückt werden soll.
 *  - reasoning_effort:"none"         → Ollama, vLLM, OpenAI-Standard
 *  - chat_template_kwargs.enable_*   → llama.cpp, MLX, LM Studio (passthrough), Qwen3
 *  - reasoning_budget:0              → llama.cpp belt-and-suspenders
 *  WICHTIG: reasoning_effort nie als Boolean / nie "minimal" (Ollama lehnt beides ab). */
export function suppressParams(suppress: boolean): Record<string, unknown> {
  if (!suppress) return {};
  return {
    reasoning_effort: "none",
    chat_template_kwargs: { enable_thinking: false },
    reasoning_budget: 0,
  };
}

const THINK_TAG = /<think>([\s\S]*?)<\/think>/;

/** Hat das Modell real gedacht? (separates reasoning-Feld ODER inline <think> mit Inhalt).
 *  Dient dazu, „Suppress hat nicht gegriffen" ehrlich zu erkennen. */
export function reasoningHappened(content: string, reasoning: string | undefined): boolean {
  if (reasoning && reasoning.trim() !== "") return true;
  const m = THINK_TAG.exec(content);
  return !!m && m[1].trim() !== "";
}

const ALWAYS_ON = /\b(gpt-oss|harmony)\b/i;

/** Modelle, die sich prinzipiell nicht vollständig abschalten lassen (nur low/medium/high). */
export function isAlwaysOnThinker(model: string): boolean {
  return ALWAYS_ON.test(model);
}
```

- [ ] **Step 2: `model-context.ts` vendoren**

Datei `/Users/Shared/code/obsidian-plugins/vault-crews/src/vendor/kit/model-context.ts`:

```ts
// vendored from obsidian-kit#0.7.0, src/pure/model-context.ts
export interface ModelContext {
  maxContextLength?: number;
  loadedContextLength?: number;
}

function findById(json: unknown, model: string): Record<string, unknown> | null {
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const hit = (data as unknown[]).find((x) => (x as { id?: unknown }).id === model);
  return (hit as Record<string, unknown> | undefined) ?? null;
}

/** LM Studio GET /api/v0/models → per-Modell-Kontextlängen. null wenn Modell fehlt. */
export function parseLmStudioContext(json: unknown, model: string): ModelContext | null {
  const m = findById(json, model);
  if (!m) return null;
  const out: ModelContext = {};
  if (typeof m.max_context_length === "number") out.maxContextLength = m.max_context_length;
  if (typeof m.loaded_context_length === "number") out.loadedContextLength = m.loaded_context_length;
  return out;
}

/** Ollama POST /api/show → model_info hält "<arch>.context_length". null wenn nicht vorhanden. */
export function parseOllamaContext(json: unknown): ModelContext | null {
  const info = (json as { model_info?: unknown }).model_info;
  if (!info || typeof info !== "object") return null;
  for (const [k, v] of Object.entries(info as Record<string, unknown>)) {
    if (k.endsWith(".context_length") && typeof v === "number") return { maxContextLength: v };
  }
  return null;
}
```

- [ ] **Step 3: `model-info.ts` zur Re-Export-Fassade umbauen**

Ersetze den **gesamten Inhalt** von `/Users/Shared/code/obsidian-plugins/vault-crews/src/core/model-info.ts` mit:

```ts
/** Re-Export-Fassade für die aus obsidian-kit vendorten Modell-Metadaten-Module.
 *  Historie: früher eigene Implementierung hier, jetzt in obsidian-kit extrahiert
 *  (model-context.ts 0.7.0, reasoning.ts 0.6.0) und vendored statt dupliziert. */
export type { ModelContext } from '../vendor/kit/model-context';
export { parseLmStudioContext, parseOllamaContext } from '../vendor/kit/model-context';
export { suppressParams, isAlwaysOnThinker } from '../vendor/kit/reasoning';
```

- [ ] **Step 4: Regressionscheck laufen lassen**

Run: `cd /Users/Shared/code/obsidian-plugins/vault-crews && npx vitest run tests/core/model-info.test.ts`
Expected: PASS — alle 10 bestehenden Tests grün, unverändert (Datei `tests/core/model-info.test.ts` wird **nicht** angefasst).

- [ ] **Step 5: Volle vault-crews-Verifikation**

Run: `cd /Users/Shared/code/obsidian-plugins/vault-crews && npm run gate`
Expected: `lint`, `typecheck`, `typecheck:test`, `test`, `check:pure`, `check:bundle` alle grün. `check:pure` bleibt grün, weil weder `src/core/model-info.ts` noch die neuen `src/vendor/kit/*.ts`-Dateien `obsidian` importieren.

- [ ] **Step 6: Commit**

```bash
cd /Users/Shared/code/obsidian-plugins/vault-crews
git add src/vendor/kit/reasoning.ts src/vendor/kit/model-context.ts src/core/model-info.ts
git commit -m "$(cat <<'EOF'
refactor(model-info): reasoning.ts + model-context.ts aus Kit vendoren

model-info.ts enthielt eine byte-identische Dublette von suppressParams/
isAlwaysOnThinker, obwohl dieser Code seit obsidian-kit 0.6.0 im Kit liegt
(vault-rag/markdown-presentation vendoren ihn bereits) — vault-crews wurde bei
jener Migration übersehen. Jetzt beide Module vendored, model-info.ts ist eine
reine Re-Export-Fassade ohne eigene Logik mehr.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: obsidian-plugins (Dach) — REGISTRY.md nachziehen

**Files:**
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md:18` (reasoning.ts-Zeile)
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md:20` (endpoint_diagnostics-Zeile)
- Modify: `/Users/Shared/code/obsidian-plugins/REGISTRY.md` (neue Zeile für Kontextlängen-Parser, direkt nach Zeile 18)

**Interfaces:**
- Consumes: Ergebnisse aus Task 1 (Kit-Version 0.7.0) und Task 3 (vault-crews vendort jetzt beide Module).

- [ ] **Step 1: Neue Registry-Zeile für Kontextlängen-Parser**

In `/Users/Shared/code/obsidian-plugins/REGISTRY.md` direkt **nach** Zeile 18 (der `reasoning.ts`-Zeile) folgende neue Tabellenzeile einfügen:

```markdown
| Kontextlängen aus LM-Studio-/Ollama-Probe parsen (`/api/v0/models` `max_context_length`/`loaded_context_length`, Ollama `POST /api/show` `model_info["<arch>.context_length"]`) | `obsidian-kit/pure` → `model-context.ts` (`parseLmStudioContext`/`parseOllamaContext`, Typ `ModelContext`) | im Kit, 0.7.0 (vendored: vault-crews) |
```

- [ ] **Step 2: `reasoning.ts`-Zeile — vault-crews als Konsument ergänzen**

Alte Zeile (18):

```markdown
| Reasoning-Suppression + Detektion („hat das Modell real gedacht?" via `THINK_TAG`-Regex), Modell-Fähigkeit (`ThinkingSupport`, `ALWAYS_ON`-Detektion), `suppressParams` | `obsidian-kit/pure` → `reasoning.ts` (`suppressParams`/`reasoningHappened`/`isAlwaysOnThinker`, Typ `ThinkingSupport`) | im Kit, 0.6.0 (verbatim extrahiert + TDD; vendored: vault-rag, markdown-presentation @0.6.0 `src/vendor/kit/reasoning.ts`) |
```

Neue Zeile:

```markdown
| Reasoning-Suppression + Detektion („hat das Modell real gedacht?" via `THINK_TAG`-Regex), Modell-Fähigkeit (`ThinkingSupport`, `ALWAYS_ON`-Detektion), `suppressParams` | `obsidian-kit/pure` → `reasoning.ts` (`suppressParams`/`reasoningHappened`/`isAlwaysOnThinker`, Typ `ThinkingSupport`) | im Kit, 0.6.0 (verbatim extrahiert + TDD; vendored: vault-rag, markdown-presentation @0.6.0, vault-crews @0.7.0 `src/vendor/kit/reasoning.ts`) |
```

- [ ] **Step 3: `endpoint_diagnostics`-Zeile — Drift-Flag entfernen**

Alte Zeile (20):

```markdown
| Endpunkt-Diagnose (Klartext-Fehlerklassen refused/unknown-host/timeout/not-an-llm-api + Fallback) + Eingabe-Prüfung + Provider-Presets | `obsidian-kit/pure` → `classifyEndpointStatus`/`validateEndpointInput`/`ENDPOINT_PRESETS` (0.5.0) | im Kit @0.5.0 (vendored: vault-rag @0.10.0, vault-crews @0.4.0-Stamp) · ⚠️ Versions-Drift: kit `package.json` sagt 0.4.0, Header/REGISTRY 0.5.0 — bei nächster Kit-Promotion geraderücken |
```

Neue Zeile:

```markdown
| Endpunkt-Diagnose (Klartext-Fehlerklassen refused/unknown-host/timeout/not-an-llm-api + Fallback) + Eingabe-Prüfung + Provider-Presets | `obsidian-kit/pure` → `classifyEndpointStatus`/`validateEndpointInput`/`ENDPOINT_PRESETS` (0.5.0) | im Kit @0.5.0 (vendored: vault-rag @0.10.0, vault-crews @0.4.0-Stamp) — Versions-Drift behoben (Kit `package.json` jetzt 0.7.0, synchron mit den Tags) |
```

- [ ] **Step 4: Commit (Dach-Repo)**

```bash
cd /Users/Shared/code/obsidian-plugins
git add REGISTRY.md
git commit -m "$(cat <<'EOF'
docs(registry): Kontextlängen-Parser im Kit (0.7.0), reasoning.ts-Vendor-Liste + Drift-Flag räumen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Nicht-Ziele (aus Spec übernommen)

- Kein CORS-Non-Streaming-Fallback-Split — eigenständiges Folgethema.
- Keine Konsolidierung von `model-context.ts` mit `endpoint_diagnostics.ts`.
- Kein `git push`/Tag-Push in diesem Plan.
