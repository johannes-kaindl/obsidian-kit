# Changelog

Alle nennenswerten Änderungen am Kit. Format: SemVer ohne v-Präfix. Dies ist die **einzige** Quelle, aus der ein auf einen Tag gepinntes Plugin erfährt, was ein Bump bringt — jeder Tag bekommt einen Eintrag.

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

## 0.2.0 — resolveActiveEndpoint

### `obsidian-kit/pure`
- **`resolveActiveEndpoint(endpoints, ping)`** — liefert den ersten erreichbaren Endpoint aus einer geordneten Fallback-Liste (leere übersprungen, jeder via `normalizeEndpoint` normalisiert, `ping` injiziert → app-frei testbar); sonst `null`. Deckt netzwechselnde lokale LLM-Endpoints (localhost vs. LAN-IP) mit *einer* gesyncten Config ab. Extrahiert aus image-to-markdown 0.5.x (bewährt, released); Failover-Orchestrierung (Cache/Re-Resolve/Retry) bleibt beim Aufrufer. 7 Tests.

Konsumenten: image-to-markdown (Migration), vault-rag (Adoption — bringt das Feature gratis).

## 0.1.0 — Erste Release

Verifizierte „NOW"-Modulmenge (gegen den echten Code geerdet, Spec §2):

### `obsidian-kit/pure`
- **`ThinkSplitter`** — zieht `<think>…</think>` aus einem Token-Strom (byte-identisch aus image-to-markdown/vault-rag).
- **`parseSSE`** — reiner OpenAI-SSE-Delta-Parser (byte-identischer Core; `streamSSE`-Transport bleibt plugin-lokal).
- **`normalizeEndpoint`** — strippt trailing-Slashes + ein `/v1` (byte-identisch aus vault-rag).
- **`clampInt`** — Integer-Parse + Clamp, konsolidiert aus der kuro-Referenz (+ `number`-Eingaben).
- **i18n-Engine** — `pickLang/setLang/getLang/t` + `defineStrings` (Engine/Strings-Split; implementiert PROF-OBS-07).
- **`KIT_VERSION`** — Diagnose-Konstante.

### `obsidian-kit/testing`
- **`createObsidianMock(overrides?)`** — self-contained Obsidian-Test-Double, Superset-Merge der 5 Plugin-Mocks; alle Stubs auch als named exports (vitest-Alias-Drop-in).

### Infrastruktur
- Toolchain: TypeScript (strict, Bundler), vitest, eslint (typescript-eslint recommendedTypeChecked) mit **pure-Layer-Reinheits-Guard**.
- Verteilung: raw `.ts` via `exports`-Map, kein Build-Schritt.
- 42 Tests grün; typecheck + lint grün.

### Bewusst nicht enthalten
- `dom-safe`, `http` → bleiben **Regeln** (PROF-OBS-12/13), keine Code-Duplikation.
- `llm-capabilities`, `data-store`/`logger`, html-export-Slide-API → **später** (Spec §10).
