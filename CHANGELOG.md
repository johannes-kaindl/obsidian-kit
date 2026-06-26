# Changelog

Alle nennenswerten Änderungen am Kit. Format: SemVer ohne v-Präfix. Dies ist die **einzige** Quelle, aus der ein auf einen Tag gepinntes Plugin erfährt, was ein Bump bringt — jeder Tag bekommt einen Eintrag.

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
