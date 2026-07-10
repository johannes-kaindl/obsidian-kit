# model-context.ts → obsidian-kit 0.7.0 + Versions-Reparatur — Design

**Datum:** 2026-07-11
**Status:** genehmigt (autonome Umsetzung autorisiert)
**Kit-Kandidat:** REGISTRY §Streaming/SSE/LLM — Kontextlängen-Parser (vault-crews-Ursprung)

## Problem

Drei zusammenhängende Befunde aus der Kit-Promotion-Session (vault-crews-Cockpit, Memory
`next-endpoint-mgmt-from-kit`):

1. **Neue Fähigkeit, noch nicht im Kit:** `parseLmStudioContext`/`parseOllamaContext`
   (Kontextlängen-Parser für LM Studio `/api/v0/models` und Ollama `POST /api/show`) existieren
   nur in `vault-crews/src/core/model-info.ts`. Kein Duplikat-Problem — schlicht eine Lücke.
2. **Stille Dublette:** Dieselbe Datei enthält außerdem eine byte-identische Kopie von
   `suppressParams`/`isAlwaysOnThinker`, obwohl genau dieser Code bereits seit 0.6.0 im Kit
   (`src/pure/reasoning.ts`) liegt und in vault-rag/markdown-presentation vendored ist
   (2026-07-08-reasoning-extraction-design.md) — vault-crews wurde bei dieser Migration
   übersehen.
3. **Versions-Buchhaltung stimmt nicht:** Tags `0.3.0`–`0.6.0` tragen echte Feature-Commits,
   aber weder `package.json` (steht auf `0.4.0`) noch `CHANGELOG.md` (endet bei `0.2.0`) wurden
   dabei je nachgezogen. Vendor-Header in Consumer-Repos zitieren bereits `#0.5.0`/`#0.6.0` —
   die eigene Bookkeeping des Kits ist zwei bis vier Releases dahinter.

## Ansatz

Verbatim-Extraktion (wie beim 0.6.0-Reasoning-Präzedenzfall) für den neuen Parser-Code;
Standard-Vendor-Migration für vault-crews' Dedupe gegen die bestehende `reasoning.ts`;
Versions-Fix als reiner Bookkeeping-Schritt (kein Code) rückwirkend für 0.3.0–0.6.0 plus
sauberer Bump auf 0.7.0 für die neue Extraktion.

## Umsetzung

### 1. Kit-Modul `model-context.ts`

Neue Datei `obsidian-kit/src/pure/model-context.ts` — verbatim aus
`vault-crews/src/core/model-info.ts` Zeilen 1–31 (`ModelContext`-Interface, `findById`,
`parseLmStudioContext`, `parseOllamaContext`). Passt ins `pure/`-Layering (kein
`obsidian`-Import).

Re-Export in `src/pure/index.ts`:

```ts
export { type ModelContext, parseLmStudioContext, parseOllamaContext } from "./model-context";
```

`KIT_VERSION` → `"0.7.0"`.

### 2. Tests (TDD, neu)

`obsidian-kit/tests/model-context.test.ts`, geschrieben **vor** der Extraktion, aus
`vault-crews/tests/core/model-info.test.ts` übernommen:

- `parseLmStudioContext`: fehlendes Modell → `null`; `max_context_length`/`loaded_context_length`
  korrekt gelesen.
- `parseOllamaContext`: fehlendes/leeres `model_info` → `null`; Key-Suche nach
  `<arch>.context_length` über beliebige Architektur-Präfixe.

### 3. vault-crews-Konsum + Dedupe

- Vendor `obsidian-kit#0.7.0/src/pure/reasoning.ts` → `src/vendor/kit/reasoning.ts`
  (Header `// vendored from obsidian-kit#0.7.0, src/pure/reasoning.ts`).
- Vendor `obsidian-kit#0.7.0/src/pure/model-context.ts` → `src/vendor/kit/model-context.ts`.
- `src/core/model-info.ts` wird zur reinen Re-Export-Fassade (keine eigene Logik mehr):

  ```ts
  export { suppressParams, isAlwaysOnThinker } from '../vendor/kit/reasoning';
  export { type ModelContext, parseLmStudioContext, parseOllamaContext } from '../vendor/kit/model-context';
  ```

  Erhält `local-llm-client.ts`/`orchestrator.ts` unverändert (beide importieren weiterhin aus
  `./model-info`).
- `tests/core/model-info.test.ts` bleibt unverändert stehen — Regressionscheck über die
  Re-Export-Fassade, kein Test-Rewrite.

### 4. Versions-Reparatur (Kit)

`CHANGELOG.md` um die vier fehlenden Einträge rückwirkend ergänzen (aus Commit-Historie
rekonstruiert):

- **0.3.0** — `parseSSE` liefert `finishReason`; `parseEndpointList` (Multi-Endpoint-Textarea).
- **0.4.0** — `mergeSettings` (Shallow-Merge + Referenzschutz).
- **0.5.0** — `classifyEndpointStatus` + `ENDPOINT_PRESETS` + `validateEndpointInput`.
- **0.6.0** — `reasoning.ts` (`suppressParams`/`reasoningHappened`/`isAlwaysOnThinker`).
- **0.7.0** (neu, dieser Release) — `model-context.ts`
  (`parseLmStudioContext`/`parseOllamaContext`).

`package.json`-Version: `0.4.0` → `0.7.0`.

### 5. Verifikation pro Repo

- **Kit:** `npm test` (neuer `model-context`-Test grün) + `npm run typecheck` + `npm run lint`.
- **vault-crews:** `npm run gate` (lint + typecheck + test + `check:pure`) —
  `tests/core/model-info.test.ts` bleibt grün, `check:pure` bleibt grün (Fassade importiert
  weiterhin nur aus `vendor/kit/`, kein `obsidian`).

### 6. Registry-Abschluss

`REGISTRY.md` § Streaming/SSE/LLM:

- Neue Zeile: „Kontextlängen aus LM-Studio-/Ollama-Probe parsen (`/api/v0/models`,
  `POST /api/show`)" → `obsidian-kit/pure` → `parseLmStudioContext`/`parseOllamaContext`,
  im Kit 0.7.0 (vendored: vault-crews).
- `reasoning.ts`-Zeile: Vendored-Liste um vault-crews ergänzen.
- `endpoint_diagnostics`-Zeile: ⚠️-Versions-Drift-Vermerk entfernen (`package.json` jetzt
  synchron mit den Tags).

Cockpit-`fokus` (vault-crews) + Memory `next-endpoint-mgmt-from-kit` als erledigt markieren.

## Nicht-Ziele (YAGNI)

- CORS-Non-Streaming-Fallback-Split (reine Overflow-Erkennung vs. Obsidian-Transport) —
  eigenständiges Folgethema, hier nicht angefasst.
- Keine Konsolidierung von `model-context.ts` mit `endpoint_diagnostics.ts`.
- Kein npm-Publish; Git-Tag-Modell bleibt. Tag `0.7.0` lokal, kein Push in dieser Runde.
