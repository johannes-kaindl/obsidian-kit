# reasoning.ts → obsidian-kit 0.6.0 — Design

**Datum:** 2026-07-08
**Status:** genehmigt (autonome Umsetzung autorisiert)
**Kit-Kandidat:** REGISTRY §Inbox — byte-identische Dublette in zwei Consumern

## Problem

`reasoning.ts` (33 Zeilen) existiert **byte-identisch** in zwei Plugins, ohne Vendor-Header
und ohne Tests:

- `vault-rag/src/reasoning.ts` (Erst-Commit `f9f30e9`, 2026-06-21)
- `markdown-presentation/src/core/llm/reasoning.ts` (`85d60b9`, 2026-07-02)

Das Modul kapselt die Reasoning-Suppression- und -Detektion für lokale LLM-Server:

- Typ `ThinkingSupport = "none" | "hybrid" | "always"`
- `suppressParams(suppress: boolean)` — Union-Params zum Abschalten von Reasoning über viele
  lokale Server (`reasoning_effort:"none"`, `chat_template_kwargs.enable_thinking:false`,
  `reasoning_budget:0`)
- `reasoningHappened(content, reasoning)` — hat das Modell real gedacht? (separates
  reasoning-Feld **oder** inline `<think>` mit Inhalt)
- `isAlwaysOnThinker(model)` — Modelle, die sich nicht vollständig abschalten lassen
  (`gpt-oss`, `harmony`)

Ein Fix an einer Kopie driftet still von der anderen weg. Ziel: **eine** gepflegte Quelle im Kit.

## Ansatz: verbatim extrahieren (kein Refactor)

Code 1:1 ins Kit, nur Tests ergänzen. Das dupliziert weiterhin die `<think>`-Tag-Kenntnis mit
`think-splitter.ts` (eigene `THINK_TAG`-Regex) — diese Konsolidierung ist **bewusst ausgeklammert**
(Nicht-Ziel, separates optionales Aufräumen). Verbatim garantiert unverändertes Verhalten und
minimalen Blast-Radius; Consumer bekommen exakt ihren bisherigen Code zurück.

## Umsetzung

### 1. Kit-Modul

Neue Datei `obsidian-kit/src/pure/reasoning.ts` — verbatim die 33 Zeilen. Passt ins `pure/`-Layering
(keine `obsidian`-Imports, rein Node-testbar).

Re-Export in `src/pure/index.ts`:

```ts
export { type ThinkingSupport, suppressParams, reasoningHappened, isAlwaysOnThinker } from "./reasoning";
```

`KIT_VERSION` → `"0.6.0"`.

### 2. Tests (TDD, neu)

`obsidian-kit/tests/reasoning.test.ts`, geschrieben **vor** der Extraktion, abgeleitet aus dem
dokumentierten Verhalten:

- `suppressParams(false)` → `{}`; `suppressParams(true)` → die drei Keys mit exakten Werten.
- `reasoningHappened`: leer/leer → false; nicht-leeres reasoning-Feld → true; inline
  `<think>x</think>` → true; leeres `<think></think>` → false; whitespace-only → false.
- `isAlwaysOnThinker`: `gpt-oss`/`harmony` (case-insensitiv, Wortgrenze) → true; z. B. `qwen3` → false.

### 3. Consumer-Migration (Dublette killen)

Für **beide** Consumer: Kopie nach `src/vendor/kit/reasoning.ts` mit Header
`// vendored from obsidian-kit#0.6.0, src/pure/reasoning.ts`, lokale Datei löschen, Imports umbiegen.

- **vault-rag** (5 Stellen): `capabilities.ts`, `chat_view.ts`, `chat_client.ts`, `smart_apply_view.ts`,
  `settings.ts` — `./reasoning` → `./vendor/kit/reasoning`. Alt-Datei `src/reasoning.ts` löschen.
- **markdown-presentation** (1 Stelle): `llm-client.ts` — `./core/llm/reasoning` →
  `./vendor/kit/reasoning`. Alt-Datei `src/core/llm/reasoning.ts` löschen.

Der vendored Code ist byte-identisch zum bisherigen → **kein Verhaltens-Change**, nur Import-Pfad + Header.

### 4. Verifikation pro Repo

- **Kit:** `npm test` (neuer reasoning-Test grün) + `npm run typecheck` + `npm run lint`.
- **Consumer je:** `npm run typecheck` + `npm test` + `npm run build`. Kein `./reasoning`-Import mehr (grep).

### 5. Versionierung / Tags

Tags enden bei `0.4.0`; `0.5.0` ist committed (KIT_VERSION), aber ungetaggt. HEAD retroaktiv als
`0.5.0` taggen (Lücke schließen), reasoning-Commit als `0.6.0`. **Tags bleiben lokal — kein Push**
(Dual-Forge-Push ist ein expliziter Release-Schritt).

### 6. Registry-Abschluss

`reasoning.ts`-Eintrag in `REGISTRY.md`: „Kit-Kandidat (2 Exemplare)" → „im Kit, 0.6.0 (vendored:
vault-rag, markdown-presentation)". `§Inbox`-Flag räumen. Cockpit-`fokus` nachziehen.

## Nicht-Ziele (YAGNI)

- Keine `THINK_TAG`-Konsolidierung mit `think-splitter` (Ansatz B verworfen).
- Kein npm-Publish (git-dependency-Modell bleibt).
- Kein Verhaltens-Change.
