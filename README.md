# obsidian-kit

Geteilte, **drift-freie** Module, aus den Obsidian-Plugins von Johannes Kaindl extrahiert.

Dieses Repo ist **kein Plugin**, sondern eine **Quell-Bibliothek**: Module, die in mehreren Plugins belegt-doppelt vorlagen (Regel-der-Drei, gegen den echten Code verifiziert), leben hier **einmal** — versioniert, getestet, dokumentiert. Jedes Plugin trägt die Module als **vendorte, byte-identische Kopie** mit Herkunfts-Header in seinem eigenen `src/vendor/kit/`. So gibt es weiter nur *eine* Quelle pro Modul statt N driftender Copy-Paste-Kopien — aber keine Abhängigkeit, die ein Build ohne Netz auflösen müsste.

> **Warum vendored — und nicht git-Dependency / npm-Publish / Monorepo / Submodule?** Jedes Plugin behält sein eigenes Repo und seinen eigenen Release-Takt (PROF-OBS-09). Eine git-Dependency braucht beim `npm install` Netz und liegt nicht als Artefakt im Repo — beides ein Risiko in der Community-Store-Review-Sandbox; npm-Publish wäre für einen rein internen Konsumentenkreis eine zweite Registry-Identität ohne Gegenwert.
>
> Verbindlich ist [`AGENTS.md`](AGENTS.md) § *Kit-Distribution & Release*. Historie: [`docs/superpowers/specs/2026-06-26-obsidian-kit-spec.md`](docs/superpowers/specs/2026-06-26-obsidian-kit-spec.md) (Extraktion, ursprünglich als git-Dep gedacht) und die Ablösung dieses Modells in `obsidian-plugins/docs/superpowers/specs/2026-07-04-i2m-vendoring-0.3.0-design.md`.

## Layering

Drei Quellbereiche in **rohem `.ts`** (kein Build-Schritt — das Kit hat kein Artefakt). Consumer vendoren aus ihnen in getrennte Zielordner (s. *Einbinden*):

| Subpfad | Inhalt | Reinheit |
|---|---|---|
| `obsidian-kit/pure` | `ThinkSplitter`, `parseSSE`, `normalizeEndpoint`, `resolveActiveEndpoint`, `clampInt`, i18n-Engine, `frontmatter` (seit v0.19.0), `capabilities` (seit v0.21.0), `pdf/*`, `KIT_VERSION` | **kein** obsidian-Import (Node-testbar, PROF-OBS-03/04) — per eslint erzwungen |
| `obsidian-kit/testing` | `createObsidianMock()` + alle Stubs (Obsidian-Test-Double) | nur im Test-Pfad, **nie** ins `main.js` gebündelt |
| `obsidian-kit/obsidian` | `collapsibleSection` (seit v0.12.0) · `ClockPort`/`realClock` (seit v0.14.0) · `confirmAction`/`ConfirmOptions` (seit v0.16.0, ab v0.16.1 UI-STANDARD-§2-konform) · `FolderSuggest` (seit v0.18.0) · `renderSettingDefinitions`/`settingBodyHost`/`refreshSettingsTab` (seit v0.25.0) — obsidian/runtime-gekoppelte Helfer | darf obsidian importieren |

`dom-safe` und `http` sind **bewusst nicht** im Kit: sie sind keine echte Code-Duplikation, sondern geteilte **Regeln** (PROF-OBS-12/13). Siehe Spec §2.

## Einbinden (in einem konsumierenden Plugin)

**Kein Eintrag in `package.json`.** Die Module werden kopiert — byte-identisch, per Skript, nie von Hand. Jede Datei bekommt einen Herkunfts-Header in Zeile 1, jeder Vendor-Ordner eine `VENDOR.json` (Quelle, Version, Kit-SHA, Dateiliste, Re-Vendor-Kommando).

```sh
# im Plugin-Repo, Kit als Schwester-Verzeichnis ausgecheckt
tools/sync-kit.sh
```

Zielordner nach Quellbereich — die Trennung ist nötig, nicht kosmetisch:

| Zielordner | aus | warum getrennt |
|---|---|---|
| `src/vendor/kit/` | `src/pure/` | node-testbar, kein obsidian-Import |
| `src/vendor/kit-obsidian/` | `src/obsidian/` | obsidian-gekoppelt — fällt unter andere Lint-Regeln |
| `tests/vendor/kit/` | `src/testing/` | der Mock ist bewusst lose typisiert und bräche unter `src/` Lint **und** Typecheck |

Dann im Code — Import auf die Datei, nicht auf ein Paket:

```ts
import { parseFrontmatter } from "../vendor/kit/frontmatter";
import { defineStrings, pickLang, setLang, t } from "./vendor/kit/i18n";
import { renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
```

Für Tests zeigt der vitest-`resolve.alias` weiterhin auf ein dünnes plugin-lokales `tests/__mocks__/obsidian.ts` (Alias gehört in vitest, **nie** in die `tsconfig.json` — PROF-OBS-08), das den vendorten Mock re-exportiert:

```ts
// tests/__mocks__/obsidian.ts (im Plugin)
export * from "../vendor/kit/obsidian-mock";
```

Die vendorten Stände sind **bewusst per Modul gestaffelt** — ein neuerer Kit-Tag ist *keine* Drift, re-vendored wird bei Bedarf. SSOT des Adoptions-Stands über alle Plugins: die generierte `../KIT-MATRIX.md` (Regeneration via `drift-audit`-Skill).

## Module

| Modul | Signatur | Kodifiziert |
|---|---|---|
| `ThinkSplitter` | `push(text) → {content, reasoning}` · `flush() → {content, reasoning}` | — |
| `parseSSE` | `parseSSE(buffer) → {content[], reasoning[], model?, finishReason?, rest, done}` | PROF-OBS-12 |
| `normalizeEndpoint` | `normalizeEndpoint(s) → string` | — |
| `resolveActiveEndpoint` | `resolveActiveEndpoint(endpoints, ping) → Promise<string\|null>` | — |
| `parseEndpointList` | `parseEndpointList(text) → string[]` (Textarea → geordnete, getrimmte, deduplizierte Liste) | — |
| `endpoint_config` (seit v0.23.0) | `EndpointConfig { url, apiKey?, model? }` · `authHeaders(apiKey?) → Record<string,string>` · `effectiveModel(cfg, globalModel) → string` · `carriesApiKey(cfg) → boolean` · `migrateEndpointList(single?, list?) → EndpointConfig[]` · `applyEndpointEdit(eps, index, field, value, isAdder) → EndpointConfig[]` · `moveEndpointToFront(eps, index) → EndpointConfig[]` (die Liste IST die Priorität) · `resolveActiveEndpointConfig(eps, ping) → Promise<EndpointConfig\|null>` · `endpointRole(input) → EndpointRole` (sprachfrei — Text baut der Consumer) | — |
| `endpoint_diagnostics` | `classifyEndpointStatus(input) → EndpointStatus` (ok / not-an-llm-api / refused / timeout …) · `validateEndpointInput(url) → EndpointWarning[]` · `ENDPOINT_PRESETS` · **`extractModelIds(body) → string[]`** (seit v0.24.0) — zieht die ids aus `GET /v1/models` (`{data:[{id}]}`), tolerant gegen HTML-Fehlerseiten, `null` und Einträge ohne `id`; wirft nie. Gegenstück zu `classifyEndpointStatus`: beide werden typisch am selben Probe-Ergebnis gerufen | — |
| `withTimeout` (seit v0.24.0) | `withTimeout(work: Promise<T>, ms, timers) → Promise<{timedOut:false, value:T} \| {timedOut:true}>` — Wartezeit auf ein Promise begrenzen. Für Obsidians `requestUrl`, das **weder Timeout noch Abort** kennt. Räumt den Timer in `finally` (auch auf dem Fehlerpfad), reicht Fehler der Arbeit durch statt sie als Timeout auszugeben, und nimmt den Timer-Port injiziert (`realClock` passt strukturell) — damit bleibt `window.setTimeout` in der obsidian-Schicht des Consumers, wo `obsidianmd/prefer-window-timers` es verlangt. **Bricht die Arbeit nicht ab** — `requestUrl` kann das nicht | — |
| `clampInt` | `clampInt(value: string\|number, min, max, fallback) → number` | — |
| `frontmatter` | `parseFrontmatter(text, {comments?}) → {data, order, body, comments?}` · `serializeFrontmatter(data, order) → string` · `valueEquals(a, b) → boolean` · `assertParseable(fm)` (Typ-Asymmetrie: `number` wird bar emittiert, `parseFrontmatter` liefert immer Strings — `valueEquals` normalisiert; Quotes/Backslashes *mitten* im Wert lösen KEIN Quoting aus) | — |
| i18n | `pickLang` · `setLang` · `getLang` · `defineStrings({en,de})` · `t(key, ...args)` | **PROF-OBS-07** |
| `createObsidianMock` | `createObsidianMock(overrides?) → MockStubs` | PROF-OBS-08 |
| `collapsibleSection` | `collapsibleSection(containerEl, {title, defaultCollapsed?, key?, storage?}) → HTMLElement` (Body-Container; startet eingeklappt) | — |
| `ClockPort` / `realClock` | Interface `{now(), setTimeout(fn, ms), clearTimeout(id)}` + `realClock` (echte `window`-Timer). Injizierter Timer-/Clock-Port: hält timer-nutzenden Code node-testbar (kein bares `window`), erfüllt Community-Store-Linter | — |
| `FolderSuggest` | `new FolderSuggest(app, inputEl)` — Ordner-Autocomplete am Text-Input (`AbstractInputSuggest<string>`; Substring-Filter, 20er-Cap; `selectSuggestion` dispatcht `input`, damit Setting-`onChange` feuert) | — |
| `confirmAction` | `confirmAction(app, {message, title?, confirmLabel?, cancelLabel?, warning?}) → Promise<boolean>` (Esc/Klick daneben ⇒ `false`; löst genau einmal auf). `applyDestructive(btn)` setzt `setDestructive()` mit Laufzeit-Check und fällt unter Obsidian < 1.13 auf `mod-warning` zurück | **UI-STANDARD §2** (Cancel links, `modal-button-container`) |
| `renderSettingDefinitions` | `renderSettingDefinitions(containerEl, items, host, app) → () => void` — rendert eine `SettingDefinitionItem[]`-Struktur mit der klassischen `Setting`-API (Fallback-Pfad für Obsidian < 1.13, das `getSettingDefinitions()` nicht selbst abfragt). Rekursiv für Gruppen; Hatches (`render`) können optional eine Cleanup-Funktion zurückgeben, die im gebündelten Rückgabewert landet — vor jedem Rebuild selbst aufrufen. `settingBodyHost(setting)` macht eine Zeile zum leeren Block-Container für Hatches mit Zusatz-DOM. `refreshSettingsTab(tab, fullRebuild)` ruft die native 1.13-`update()`-API, wenn vorhanden, sonst den übergebenen Rebuild. | — |
| `capabilities` | `guessFromName(model) → Capabilities` (Namens-Heuristik) · `parseOllamaShow`/`parseLmStudioV1`/`parseLmStudioV0` (Metadaten-Parser) · `mergeCapability` · `resolveCapabilities(…)`. Vision **und** Thinking je als `Confidence` (`no`/`likely`/`confirmed`) — die Heuristik behauptet nie mehr, als die Quelle hergibt | — |
| `resolveModelChoice` (seit v0.26.0) | `resolveModelChoice(input: ModelChoiceInput) → ModelChoice` — entscheidet, was ein Modell-Feld zeigen soll (Dropdown mit Liste / Freitext, wenn der Endpunkt keine Liste herausgibt / gesperrt, wenn er schweigt). Liefert i18n-**Schlüssel** (`hintKey`) und `suffix: "saved"` statt fertiger Sätze zurück — das Kit formuliert nicht. Optionales `allowEmpty` (Default `false`) für Felder, in denen der leere Wert bedeutungstragend ist („nimm das globale Modell") | — |
| `createModelListCache` (seit v0.26.0) | `createModelListCache() → ModelListCache` — Modell-Listen je Endpunkt, ein Request pro Schlüssel (das Promise wird gecacht, nicht das Ergebnis), Probe nur bei leerer Liste, Generationszähler gegen verspätete Antworten. Instanz statt Singleton: gehört zur Lebensdauer eines Settings-Tabs | — |
| `renderModelPicker` (seit v0.26.0) | `renderModelPicker(opts: ModelPickerOptions) → void` — zeichnet eine `ModelChoice` in eine bestehende `Setting`-Zeile, inklusive „Modelle abrufen"-Knopf in jedem Modus. Alle Texte kommen über `opts` herein | — |
| `buildEndpointList` (seit v0.26.0) | `buildEndpointList(opts: EndpointListOptions) → void` — der komplette Endpunkt-Zeilen-Editor (URL · Schlüssel · Modell-Override je Zeile, Adder-Zeile, Status-Icon, Rollenzeile, Drittanbieter-Hinweis, „zuerst verwenden", Entfernen, Preset-Knöpfe, „Verbindung prüfen"). Alle Texte kommen über `opts.strings` herein. Dazu die exportierte Konstante `ENDPOINT_LIST_CSS` (Präfix `okit-`), die der Consumer in seine `styles.css` übernimmt | — |

Jedes Modul trägt sein TSDoc am Source — bei der raw-`.ts`-Verteilung erscheint es direkt im IntelliSense/Hover des Konsumenten. Migrations-Rezepte: [`MIGRATION.md`](MIGRATION.md).

## Ein neues Plugin ans Kit onboarden

1. `tools/sync-kit.sh` aus einem Schwester-Repo übernehmen und auf die tatsächlich gebrauchten Module kürzen (siehe *Einbinden*).
2. Lokale Kopie des Moduls löschen, Import auf den Vendor-Pfad umbiegen (Rezept je Modul in [`MIGRATION.md`](MIGRATION.md)).
3. i18n: die lokale `i18n.ts` auf Delegation umbauen (Strings bleiben lokal, Engine kommt aus dem Kit — siehe `MIGRATION.md`).
4. Test-Mock: `tests/__mocks__/obsidian.ts` → `export * from "../vendor/kit/obsidian-mock";` (plugin-eigene Stubs via Override ergänzen).
5. `npm run lint && npm run typecheck && npm test` → grün, dann committen.
6. `drift-audit`-Skill laufen lassen, damit `../KIT-MATRIX.md` das neue Repo kennt.

## Versionierung & Release

- **SemVer ohne v-Präfix** (`0.1.0`), Release **tag-only** — kein Build-Artefakt, kein npm-Publish. Konsumenten vendoren einen Stand und ziehen einen Kit-Bump pro Plugin bewusst nach (es gibt **keinen** geteilten Runtime — Versions-Skew ist kein Laufzeitproblem, sondern der Normalzustand).
- **Dual-Forge:** Tags werden im Lockstep nach **Forgejo (primär)** und **GitHub (Mirror)** gepusht (identische SHA). Fällt Forgejo aus, ist der GitHub-Mirror-Tag bit-identisch.
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
