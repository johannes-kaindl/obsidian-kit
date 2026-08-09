# Migration — lokale Kopie → Kit-Import

Pro Modul ein Rezept, wie ein Plugin von seiner Inline-/Copy-Paste-Version auf das Kit umsteigt. Reihenfolge der Plugin-Migration (Spec §9): **image-to-markdown zuerst**, dann **vault-rag** (beide hielten die Duplikate → sie validieren die Entdopplung), danach opportunistisch presentation/kuro/json_viewer.

Voraussetzung: git-Dependency gepinnt (`"obsidian-kit": "git+https://git.jkaindl.de/jkaindl/obsidian-kit.git#<tag>"`).

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

## `resolveActiveEndpoint` (ab Kit 0.2.0)

Geordnete Endpoint-Fallback-Liste — erster erreichbarer gewinnt; `ping` injiziert.

- **image-to-markdown (Migration, n=1 → entdoppeln):** die lokale `resolveActiveEndpoint`-Definition in `src/vision_client.ts` **löschen**, stattdessen `import { resolveActiveEndpoint, normalizeEndpoint } from "obsidian-kit/pure"`. Re-exportieren, falls `main.ts`/`settings.ts` sie aus `./vision_client` beziehen. **Keine** Verhaltensänderung: weiterhin single-call mit injiziertem `ping`; die Failover-Orchestrierung (`activeEndpoint`-Cache, Re-Resolve bei Refresh/Tab-Open, EIN Retry nach Fehlschlag) bleibt **lokal in `main.ts`**.
- **vault-rag (Adoption — der eigentliche Gewinn):** vault-rag hat das Feature **noch nicht**. Das Settings-Feld von `string` (ein Endpoint) auf `string[]` (Liste) erweitern (mit `migrate`-Helfer wie in img-to-md), und am „Verbindungs"-Moment `resolveActiveEndpoint(endpoints, ep => pingEndpoint(ep))` aufrufen, statt den festen Endpoint zu nehmen. So bekommt vault-rag die netzwechsel-robuste Endpoint-Wahl gratis aus dem Kit.

> Die Settings-UI-Mechanik (Endpoint-Liste editieren, migrieren) bleibt **plugin-lokal** — nur die generische Resolver-Funktion kommt aus dem Kit.

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

## 0.26.0 — Endpunkt-Zeilen-Editor, Modell-Picker, Modell-Cache

Additiv, **keine Breaking Changes**.

- **`buildEndpointList` (`obsidian-kit/obsidian`):** Consumer, die den Endpunkt-Fallback-Block bisher selbst hielten (**vault-rag**, **koda-agent**), ersetzen ihre lokale Implementierung durch `buildEndpointList`. Das `strings`-Objekt (`EndpointListStrings`) ist **Pflicht** — das Kit formuliert keinen einzigen Anzeigetext selbst, jede Übersetzung bleibt beim Consumer, auch der Tooltip-Text der Presets und die Rollen-/Warnungstexte. `ENDPOINT_LIST_CSS` (Präfix `okit-`) **muss** in die `styles.css` des Consumers übernommen werden — ohne das Snippet fehlen Status-Icon, Rollenzeile und Preset-Layout.
- **`resolveModelChoice` (`obsidian-kit/pure`) + `renderModelPicker` (`obsidian-kit/obsidian`):** ersetzen die lokale Modell-Feld-Logik eines Endpunkt-/Modell-Settings. Auch hier kommt der Hinweistext nur als `hintKey` zurück, nie als Satz — der Consumer übersetzt ihn über sein eigenes `t()`.
- **`createModelListCache` (`obsidian-kit/pure`):** ersetzt die lokale Cache-Map für Modell-Listen je Endpunkt. Instanz statt Singleton — eine pro Settings-Tab-Lebensdauer anlegen, nicht modulweit teilen.
- **`allowEmpty` in `resolveModelChoice`:** optional, Default `false`, rein additiv — bestehende Aufrufer sind ohne Änderung weiter kompatibel. Wird gebraucht, wenn ein Modell-Feld den leeren Wert bedeutungstragend nutzt (Modell-Override je Endpunkt-Zeile: „leer" = „nimm das globale Modell"). Ohne `allowEmpty: true` fehlt die Leer-Option im Dropdown, sobald schon ein Wert gewählt ist — ein einmal gesetztes Override lässt sich dann über die Oberfläche nicht mehr zurücknehmen.

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
