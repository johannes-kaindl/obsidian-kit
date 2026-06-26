# Migration — lokale Kopie → Kit-Import

Pro Modul ein Rezept, wie ein Plugin von seiner Inline-/Copy-Paste-Version auf das Kit umsteigt. Reihenfolge der Plugin-Migration (Spec §9): **image-to-markdown zuerst**, dann **vault-rag** (beide hielten die Duplikate → sie validieren die Entdopplung), danach opportunistisch presentation/kuro/json_viewer.

Voraussetzung: git-Dependency gepinnt (`"obsidian-kit": "git+https://codeberg.org/jkaindl/obsidian-kit.git#<tag>"`).

---

## `ThinkSplitter` (byte-identisch)

1. `src/think_splitter.ts` **löschen**.
2. Importe `import { ThinkSplitter } from "./think_splitter"` → `from "obsidian-kit/pure"`.
3. Falls `src/sse.ts` lokal `ThinkSplitter` importierte: ebenfalls auf `obsidian-kit/pure` umbiegen.
4. `tests/think_splitter.test.ts` löschen (im Kit abgedeckt).

## `parseSSE` (pure Core; `streamSSE` bleibt lokal)

1. In `src/sse.ts` die Funktion `parseSSE` **entfernen**, stattdessen `import { parseSSE } from "obsidian-kit/pure"`.
2. **`streamSSE` bleibt lokal** — der Transport divergiert je Runtime (fetch ReadableStream in img-to-md, XHR in vault-rag) und ist nicht teilbar. Nur den reinen Parser ziehen.
3. Die `describe("parseSSE", …)`-Tests entfernen (im Kit abgedeckt); die `streamSSE`-Tests bleiben.

## `normalizeEndpoint` (byte-identisch)

1. vault-rag: `src/endpoint.ts` löschen, Importe auf `obsidian-kit/pure` umbiegen.
2. image-to-markdown: die inline-Variante in `src/vision_client.ts` durch `import { normalizeEndpoint } from "obsidian-kit/pure"` ersetzen.

## `clampInt`

1. Lokale `clampInt`-Definition bzw. Inline-`Math.min(max, Math.max(min, …))`-Stellen durch `import { clampInt } from "obsidian-kit/pure"` ersetzen.
2. **Achtung Float-Domäne:** das Kit-`clampInt` truncated zu Int (`Math.trunc`). Call-Sites mit Float-Werten (z.B. vault-rag `0..1`-Slider) **nicht** umstellen — dort lokal lassen.

## i18n (Engine/Strings-Split — der nicht-triviale Fall)

Das Kit liefert die **Engine** (`pickLang/setLang/getLang/t`), die **Strings bleiben pro Plugin**. Die lokale `i18n.ts` schrumpft auf ihre Dicts + eine Delegations-Zeile:

```ts
// src/i18n.ts (nach Migration)
import { defineStrings } from "obsidian-kit/pure";
export { pickLang, setLang, getLang, t } from "obsidian-kit/pure";

const EN = { /* … plugin-eigene Strings … */ };
const DE = { /* … */ };
defineStrings({ en: EN, de: DE });
```

Jeder bestehende `import { t } from "./i18n"` bleibt **unverändert** funktionsfähig.

### Aufwand pro Plugin

- **image-to-markdown, markdown-presentation:** folgen der Spezifikation (`_docs/docs/obsidian-i18n.md`) bereits → nur die lokale `i18n.ts` auf Delegation umbauen, ~0 Call-Site-Änderungen. (`defaultVisionPrompt()` o. ä. plugin-eigene Helfer bleiben lokal.)
- **kuro-gamification (teuer):**
  1. `t(key, lang, vars)` → `t(key, ...args)` umstellen.
  2. In `de.ts`/`en.ts` jeden **named** Platzhalter (`{xp}`, `{title}`, `{done}`, `{total}`, `{pct}`, …) auf **positional** `{0}`/`{1}` umschreiben und auf die Arg-Reihenfolge mappen.
  3. `pickLang/setLang/getLang` + `currentLang`-State entfallen lokal (kommen aus dem Kit); `setLang(pickLang(detect()))` im `onload` ergänzen.
  4. An **allen** Call-Sites den expliziten `lang`-Parameter entfernen.
- **obsidian-letterhead:** hat **kein `src/`** (nur gebündelte `main.js`) → keine Code-Migration; nur als Referenz, dass `t(key)` additiv-kompatibel zu `t(key, ...args)` wäre.

## Test-Mock (`tests/__mocks__/obsidian.ts`)

Das plugin-lokale Mock zur dünnen Re-Export-Datei machen:

```ts
// tests/__mocks__/obsidian.ts (im Plugin)
export * from "obsidian-kit/testing";
// plugin-eigene Stubs hier ergänzen/überschreiben, falls nötig.
```

Der vitest-`resolve.alias` (`obsidian → tests/__mocks__/obsidian.ts`) bleibt unverändert. Plugins mit Sonderbedarf (z.B. json_viewer mit happy-dom-realem DOM) übergeben ihre eigene `makeFakeEl`/Komponenten via `createObsidianMock({ … })`-Override.

---

Nach jeder Migration: `npm run lint && npm run typecheck && npm test` grün, dann committen und — bei einem späteren Kit-Release — den git-tag-Pin neu setzen.
