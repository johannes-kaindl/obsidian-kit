# Changelog

Alle nennenswerten Änderungen am Kit. Format: SemVer ohne v-Präfix. Dies ist die **einzige** Quelle, aus der ein auf einen Tag gepinntes Plugin erfährt, was ein Bump bringt — jeder Tag bekommt einen Eintrag.

## 0.26.0 — Endpunkt-Zeilen-Editor, Modell-Picker, Modell-Cache

Kompletter Umzug des Endpunkt-Zeilen-Editors aus `vault-rag` ins Kit, in vier Tasks (Spec/Plan unter `.superpowers/sdd/2026-08-08-kit-endpunkt-liste/`). Additiv, keine Breaking Changes.

### `obsidian-kit/pure`
- **`model-choice`** (neu) — `resolveModelChoice(input) → ModelChoice`: entscheidet, was ein Modell-Feld zeigen soll (Dropdown mit Liste / Freitext, wenn der Endpunkt keine Liste herausgibt / gesperrt, wenn er schweigt). Liefert i18n-**Schlüssel** (`hintKey`) und `suffix: "saved"` statt fertiger Sätze zurück — das Kit formuliert nicht.
- **`allowEmpty`** (neu, optional, Default `false`) in `resolveModelChoice` — additive API-Erweiterung für Felder, in denen der leere Wert bedeutungstragend ist (Modell-Override je Endpunkt-Zeile: „leer" = „nimm das globale Modell"). Ohne die Option fehlte die Leer-Option im Dropdown, sobald schon ein Wert gewählt war — ein einmal gesetztes Override ließ sich über die Oberfläche nicht mehr zurücknehmen (Einbahnstraße, gemeldet 2026-08-08 während der Extraktion). Bestehende Aufrufer bleiben ohne Änderung kompatibel.
- **`model-list-cache`** (neu) — `createModelListCache() → ModelListCache`: Modell-Listen je Endpunkt, ein Request pro Schlüssel (das Promise wird gecacht, nicht das Ergebnis), Probe nur bei leerer Liste, Generationszähler gegen verspätete Antworten. Instanz statt Singleton — gehört zur Lebensdauer eines Settings-Tabs.

### `obsidian-kit/obsidian`
- **`model-picker`** (neu) — `renderModelPicker(opts) → void`: zeichnet eine `ModelChoice` in eine bestehende `Setting`-Zeile, inklusive „Modelle abrufen"-Knopf in jedem Modus.
- **`endpoint-list`** (neu) — `buildEndpointList(opts) → void`: der komplette Endpunkt-Zeilen-Editor (URL · Schlüssel · Modell-Override je Zeile, Adder-Zeile, Status-Icon, Rollenzeile, Drittanbieter-Hinweis, „zuerst verwenden", Entfernen, Preset-Knöpfe, „Verbindung prüfen"). Alle Texte kommen über `opts.strings` — das Kit formuliert nicht. Dazu die exportierte Konstante `ENDPOINT_LIST_CSS` (Präfix `okit-`), die der Consumer in seine `styles.css` übernimmt.

### `obsidian-kit/testing`
- Mock ergänzt: freie `setTooltip`-Funktion, `Setting.controlEl`, `querySelectorAll` am Fake-Element — Voraussetzung, um `buildEndpointList` gegen den Mock zu testen.

## 0.25.1 — pure/capabilities: Gemma-Erkennung + null-sicheres findModel

- **Vision-Heuristik erkennt Gemma in beiden Schreibweisen und Gemma 4.** Der bisherige Ausdruck
  `/gemma3/` matchte nur die Ollama-Form; LM Studio liefert `google/gemma-3-4b-it`, und für
  `google/gemma-4-*` galt gar keine Regel. Beides meldete „keine Vision", obwohl die Modelle
  multimodal sind — belegt am 2026-08-07 durch den *aktiven* Vision-Test in `image-to-markdown`
  (Modell las das Token aus dem Testbild, die Anzeige sprang von „Keine Vision" auf „Vision").
  Neu: `GEMMA_VISION = /gemma[-_]?[34]/`, Text-Ausnahme entsprechend als
  `GEMMA_TEXT = /gemma[-_]?3[-_:]?(1b|270m)/` (Gemma 3 1b/270m bleiben text-only).
- **`findModel` dereferenziert `json` nicht mehr ungeprüft.** `parseLmStudioV1`/`parseLmStudioV0`
  warfen `TypeError: Cannot read properties of null` statt `null` zurückzugeben, wenn ein
  Endpunkt `null` lieferte — `parseOllamaShow` hatte das Optional Chaining direkt darüber bereits.
  Befund aus der 0.21.0-Extraktion: der alte `image-to-markdown`-Fork hatte es, das Kit verlor es.

## 0.25.0

- Neues Modul `obsidian-kit/obsidian`: `renderSettingDefinitions`/`settingBodyHost`/`refreshSettingsTab` — der gemeinsame Fallback-Walker für zweigleisige deklarative Settings-Tabs, gehoben aus 9 unabhängigen Repo-Kopien (REGISTRY „Zweigleisige deklarative Settings — eine-Wahrheit-Walker").

## 0.24.0 — pure: Modell-Liste lesen, Wartezeit begrenzen

Beide Module kommen aus dem `drift-audit` vom 2026-08-06 und sind **gemessen uniform**, nicht
geschätzt: die Consumer-Implementierungen wurden nebeneinander gelesen, nicht gezählt.

### `obsidian-kit/pure`
- **`extractModelIds(body) → string[]`** (neu, in `endpoint_diagnostics`) — zieht die Modell-ids
  aus der Antwort von `GET /v1/models` (OpenAI-kompatible Form `{ data: [{ id }] }`). Tolerant
  gegen alles, was ein Endpunkt statt JSON liefern kann: HTML-Fehlerseiten, `null`, fehlendes
  `data`, Einträge ohne `id`. Wirft nie. Extrahiert aus **drei** Repos mit identischer Semantik
  (koda-agent `core/llm/probe.ts`, vim-dojo `llm/modelList.ts`, obsidian-transmute
  `core/llm/client.ts`) — die Unterschiede waren Quote-Stil und Zeilenumbrüche.
- **`withTimeout(work, ms, timers)`** (neu, Modul `timeout`) — begrenzt die Wartezeit auf ein
  Promise. Motivation: Obsidians `requestUrl` kennt **weder Timeout noch Abort**; fünf Repos
  bauen denselben `Promise.race`-Wrapper (koda-agent, vault-rag, yijing-oracle, vim-dojo,
  obsidian-transmute), zwei davon mit fast wörtlich gleichem Begründungskommentar.
  Drei Dinge macht die Kit-Fassung bewusst anders als die Vorlagen:
  1. **Der Timer wird in `finally` geräumt** — auch auf dem Fehlerpfad. Mindestens eine
     Consumer-Kopie (vim-dojo `llm/endpointProbe.ts`) räumt ihn nicht; bei einem Timeout von
     drei Minuten läuft dort nach jeder erfolgreichen Probe ein Timer minutenlang nach.
  2. **Diskriminierte Union statt Sentinel-Wert.** Die Vorlagen verwenden `'timeout'` bzw.
     `'__timeout__'` als Marker im Ergebnis — ein Nutzwert, der zufällig so heißt, wäre nicht
     unterscheidbar. `{ timedOut: true }` kann nicht kollidieren.
  3. **Fehler der Arbeit werden durchgereicht**, nicht als Timeout ausgegeben: der Aufrufer soll
     „Server antwortete 500" von „Server antwortete gar nicht" unterscheiden können.

  Der Timer-Port ist **injiziert** (`TimeoutTimers`, strukturell erfüllt von `ClockPort`/`realClock`).
  Grund: vendorierter Kit-Code wird vom Lint des *Consumers* erfasst, und
  `obsidianmd/prefer-window-timers` verlangt dort `window.setTimeout`. Die `window`-Bindung
  bleibt damit in der obsidian-Schicht — der pure Kern bleibt node-testbar.

  ⚠️ **Was `withTimeout` NICHT tut:** die Arbeit abbrechen. `requestUrl` bietet kein Abort;
  die laufende Anfrage läuft im Hintergrund zu Ende, ihr Ergebnis verfällt nur.

### Doku
- README: `endpoint_diagnostics` fehlte bislang **ganz** in der Modul-Tabelle, obwohl es seit
  0.5.0 existiert und in 8 Repos vendored ist. Für die Kit-first-Regel („vor dem Lösen erst
  `obsidian-kit/README.md` prüfen") heißt eine fehlende Zeile: das Modul ist nicht auffindbar.
  Nachgetragen.

## 0.23.0 — pure: Endpunkt-Konfiguration mit API-Schlüssel je Zeile

### `obsidian-kit/pure`
- **`endpoint_config`** (neu, exportiert) — Endpunkt-Einträge mit eigenem API-Schlüssel je
  Zeile (`EndpointConfig { url, apiKey?, model? }`), `authHeaders`, `effectiveModel`,
  `carriesApiKey`, `migrateEndpointList` (alte String-Listen), `applyEndpointEdit`,
  `moveEndpointToFront` (die Liste IST die Priorität) sowie `endpointRole` als sprachfreie
  Ableitung für die Zeilen-Anzeige. Damit lässt sich EINE Fallback-Liste aus lokalen und
  gehosteten Anbietern mischen. Herkunft: `vault-rag` 0.19.0/0.20.0.
- **`resolveActiveEndpointConfig(eps, ping)`** — liefert den ganzen Eintrag statt nur der URL
  und reicht ihn dem `ping` durch, damit der Schlüssel die Erreichbarkeitsprobe erreicht.
- `pure/endpoint.ts` bleibt unverändert. Wer nur URL-Listen braucht, ändert nichts.
- Den Anzeigetext einer `EndpointRole` baut der Consumer — die Rolle ist bewusst sprachfrei,
  damit zweisprachige Plugins sie durch ihr eigenes `t()` führen.

## 0.22.0 — pdf: stiller Verlust bei grafischen Elementen behoben, Waisenschutz vor Bildern

Gefunden bei der Geräte-Abnahme von Paperize (2026-08-04) — alle drei Punkte waren in
`0.17.0`–`0.21.0` unverändert vorhanden.

### `obsidian-kit/pure/pdf`
- **`dom-to-ir`: grafisch gerenderte Elemente verschwanden spurlos.** MathJax, Mermaid und
  nacktes SVG tragen **keinen Textknoten**; der Fallback-Zweig prüfte aber nur `textContent`.
  Folge: kein Block, kein Platzhalter — **und** der `unsupportedCount` blieb bei 0, womit auch
  die Sammel-Notice des Hosts stumm blieb. Dem PDF sah man nicht an, dass etwas fehlte.
  Neu: `graphicPlaceholder()` erkennt solche Elemente an ihrem grafischen Inhalt
  (`svg`/`canvas`/`mjx-container`/`math` bzw. `class="math"`) und erzeugt `[Formel]` respektive
  `[Grafik]` — als Block **und** als Inline-Run mitten im Absatz. Leere Layout-Wrapper bleiben
  bewusst ungezählt (Regressionstest hält das fest).
- **Dekoratives Beiwerk zählt nicht mit.** Der erste Wurf meldete Obsidians Callout-Icon als
  `[Grafik]` — Rauschen an einer Stelle, an der nichts fehlte (aufgefallen im echten Export,
  nicht im Test). `isDecorative()` erkennt es an `aria-hidden="true"` bzw. `icon` im
  Klassennamen; beides trägt über Renderer hinweg. Ein echtes Diagramm neben einem Icon wird
  weiterhin gemeldet. **Dekoratives wird ganz übersprungen, nicht nur selbst ignoriert:** In
  Obsidians Export-Pfad (detached Container) füllt `setIcon` das Callout-Icon nicht — dort
  steht ein nacktes `<svg width="16" height="16">` **ohne Klasse und ohne aria-hidden**.
  Erkennbar ist nur der Container; prüfte man allein das Element, rutschte das SVG eine Ebene
  tiefer wieder durch. Nur textlose Container werden übersprungen, damit ein
  `class="icon-legend"` seinen eigenen Inhalt behält.
- **`dom-to-ir`: Aufgabenlisten verloren ihren Zustand.** `- [ ]` und `- [x]` rendern als
  optisch identische Bullets; „erledigt" war im PDF nicht mehr erkennbar. Neu stellt
  `taskMarker()` `[ ] ` bzw. `[x] ` voran (erkannt über `input[type=checkbox]`, `is-checked`
  oder `data-task`); die Checkbox selbst wird nicht mehr als Run mitgeschleift.
- **`layout`: Überschriften blieben vor einem Bild allein am Seitenende zurück.** Der
  Waisenschutz maß per `measureFirstLines` *n Textzeilen* des Folgeblocks — bei einem Bild
  eine sinnlose Größe, denn ein Bild ist **atomar**. Die Überschrift passte neben zwei
  gedachten Textzeilen, dann wanderte das ganze Bild auf die nächste Seite und ließ sie über
  einem Drittel leerer Seite zurück. Jetzt zählt die volle Bildhöhe. Tabellen und Codeblöcke
  behalten die Zeilen-Näherung bewusst: sie **können** brechen, dort ist ein Teil-Fit ein
  echter Fit.
- **`layout`: `imageSizePt()` als gemeinsame Quelle** für Renderer und Waisen-Vorausschau —
  vorher stand die Bildmathematik nur im Render-Zweig und hätte von der Vorausschau
  wegdriften können. Die Funktion liefert Breite **und** Höhe; würde man die Breite
  nachträglich als `hPt/ratio` ableiten, ergäbe ein entartetes Bild (`hPx: 0`) NaN-Geometrie
  (eigener Regressionstest).

## 0.21.0 — pure: Capability-Erkennung (Vision + Thinking)

### `obsidian-kit/pure`
- **`capabilities`** (neu, exportiert) — `guessFromName` · `parseOllamaShow` ·
  `parseLmStudioV1` · `parseLmStudioV0` · `mergeCapability` · `resolveCapabilities` ·
  `fetchCapabilities`, dazu `Confidence`/`ThinkingState`/`Capabilities`/`CapabilityFetch`.
  Verbatim gehoben aus `vault-rag/src/capabilities.ts`; `image-to-markdown` hielt davon
  einen vision-only-Fork mit **byte-gleichen Heuristik-Listen** — genau die Duplikation,
  die bei jeder neuen Modellfamilie unbemerkt driftet.
- **Einzige API-Änderung: der Fetcher wird injiziert.** `fetchCapabilities(fetchJson, baseUrl, model)`
  statt eines importierten `httpJson`. `CapabilityFetch` liefert `{ json } | null` —
  der Wrapper ist load-bearing, weil `unknown | null` in TypeScript zu `unknown`
  kollabiert und den Vertrag „null = fehlgeschlagen" nicht ausdrücken könnte. Die beiden
  Konsumenten reichen unterschiedliche HTTP-Formen durch (`{ok,status,text}` vs.
  `{status,json}`); das Kit lernt keine davon.
- **`try`/`catch` bleibt pro Versuch** — ein werfender Adapter darf die Sequenz
  Ollama → LM Studio v1 → v0 nicht abbrechen. Per Test fixiert.
- **Auth ist bewusst nicht im Kit.** vault-rag setzt auf seine Proben `authHeaders(apiKey)`;
  das Kit-Modul kennt weder Schlüssel noch Header-Namen. Mit dem injizierten Fetcher gehört
  dieses Wissen in den Adapter des Konsumenten, der die Header in `req.headers` hineinmerged
  — sonst müsste das Kit jedes Auth-Schema seiner Konsumenten lernen.
- **`findById` bewusst nicht geteilt** mit `pure/model-context.ts` (5 Zeilen, dort
  gleichnamig): Vendoring ist datei-granular; ein gemeinsames Helfer-Modul zwänge jeden
  `model-context`-Konsumenten, ab sofort zwei Dateien zu vendoren.

### Gates
- **`tests/kit-version.test.ts`** (neu) — verriegelt `KIT_VERSION` gegen
  `package.json#version`. Der Lag war **zweimal in Folge** aufgetreten (0.18.0 und
  0.20.0 zogen die Konstante nicht nach); ein Wert, der zweimal still divergiert,
  braucht eine Verriegelung statt einer dritten Handkorrektur.
- `capabilities.ts` steht **nicht** in `check:index-strict`: die Datei selbst ist unter
  `--noUncheckedIndexedAccess` sauber, ihr `reasoning.ts`-Import zöge aber einen dort
  bestehenden Fehler mit.

### Sonstiges
- `KIT_VERSION` von `0.19.0` auf `0.21.0` nachgezogen (Lag aus dem 0.20.0-Release).

Consumer-Rollout (im Anschluss): image-to-markdown; vault-rag als Folgeschritt.

## 0.19.0 — pure: YAML-Frontmatter-Serializer (yaml_lite)

### `obsidian-kit/pure`
- **`frontmatter`** (neu, exportiert) — `parseFrontmatter` · `serializeFrontmatter` ·
  `valueEquals` · `assertParseable`, dazu `FmValue`/`ParsedFrontmatter`. Gehoben aus
  `vault-rag/src/frontmatter.ts`; die smart-apply-Domäne (`mergeFrontmatter`/
  `diffFrontmatter`) bleibt dort. Quoting-Regeln für Wikilinks, `: `, `#`, führende
  YAML-Sigils, Emoji-Codepoints, `true/false/null/yes/no/on/off/~` und zahl-aussehende
  Strings; Kommas werden gequotet, weil sie sonst den Inline-List-Tokenizer spalten.
- **Typ-Asymmetrie (load-bearing):** `FmValue` kennt `number` und emittiert ihn bar
  (`seed: 199801046`) — der Parser liefert dagegen immer Strings, yaml_lite macht keine
  Typinferenz. `valueEquals` normalisiert Skalare deshalb über `String(v)`.
- **Nicht-Verhalten (Regressionsschutz):** Anführungszeichen und Backslashes *mitten* im
  Wert lösen **kein** Quoting aus — gültiger Plain-Scalar, per Negativ-Test fixiert.
- Die Datei ist gegen `noUncheckedIndexedAccess` gehärtet (local-image-generator
  compiliert damit) und wird per `check:index-strict` in `npm test` daran gemessen.

### Gates
- **`check-no-nul-bytes.mjs`** (neu, in `npm test`) — NUL-Bytes machen eine Datei für
  grep/git-grep binär; die Kit-first-Suche läuft dann an ihr vorbei. Genau das war beim
  Original der Fall (vier NULs in `assertParseable`), beim Heben beseitigt.

### Sonstiges
- `KIT_VERSION` von `0.17.1` auf `0.19.0` nachgezogen (Lag aus dem 0.18.0-Release).

Consumer-Rollout (im Anschluss): vault-rag, local-image-generator.

## 0.18.0 — obsidian: FolderSuggest (Ordner-Autocomplete)

### `obsidian-kit/obsidian`
- **`FolderSuggest`** (neu, exportiert) — Ordner-Autocomplete für Settings-Textfelder
  (`AbstractInputSuggest<string>`: `getAllFolders()` → case-insensitiver Substring-Filter →
  `slice(0, 20)`). Verbatim gehoben aus vault-rag/local-image-generator/kuro-gamification
  (REGISTRY „Ordner-Autocomplete", n=4 — das vierte Exemplar lag unkatalogisiert in
  apple-health). Zwei load-bearing Details: `dispatchEvent(new Event("input"))` in
  `selectSuggestion` (sonst feuert Setting-onChange nach Klick-Auswahl nicht) und der
  20er-Cap für große Vaults.
- Test-Mock: `AbstractInputSuggest.setValue`/`getValue` spiegeln jetzt nach `inputEl.value`
  (vorher no-ops) — rückwärtskompatibel.

Consumer-Rollout (im Anschluss): vault-rag, local-image-generator, kuro-gamification,
apple-health — die zwei bisherigen Peer-Vendorings (kuro, apple-health) damit erstmals
sauber gepinnt. Staffelung ist der Normalzustand.

## 0.17.1 — confirm: destruktiver Button ohne deprecated API

### `obsidian-kit/obsidian`
- **`applyDestructive(button)`** (neu, exportiert) — markiert einen `ButtonComponent`
  destruktiv per Laufzeit-Check: `setDestructive()` wenn vorhanden (Obsidian ≥ 1.13), sonst
  die native CSS-Klasse `mod-warning`. Beides hart aufzurufen ist falsch — `setWarning()` ist
  ab 1.13 deprecated und wird im **Community-Store-Review angemahnt**, `setDestructive()` wirft
  bei Konsumenten mit `minAppVersion < 1.13` zur Laufzeit.
- **`confirm.ts` nutzt es** statt `setWarning()`. Für Konsumenten verhaltensgleich; der Fix
  entfernt einen Store-Review-Befund, den das Vendoring sonst in jedes Plugin trägt
  (gefunden in `vault-rag`, nachdem dessen Lint-Gate auf `--max-warnings 0` gehärtet wurde).
- Test-Mock: `ButtonComponent.setDestructive()` + `destructiveSet`; der `< 1.13`-Fallback wird
  über `delete ButtonComponent.prototype.setDestructive` geprüft.

Consumer: **`vault-rag`** (re-vendored). Andere confirm-Konsumenten ziehen bei Bedarf nach —
Staffelung ist der Normalzustand.

## 0.17.0 — pdf: dom-to-ir + code-blocks + image aus letterhead/paperize gehoben

### `obsidian-kit/pure/pdf`
- **`code-blocks.ts`** (neu) — `extractCodeBlocks`/`codePlaceholder`/`parseCodePlaceholder`,
  parametrisiert per `prefix`-Argument (kein Default — jeder Consumer bindet seinen eigenen
  Präfix, verhindert stille Kollisionen).
- **`dom-to-ir.ts`** (neu) — `domToIrSync`/`resolveImages`. Platzhalter-Auflösung über
  `opts.resolvePlaceholder: (text) => number | null` statt fester Kopplung an
  `code-blocks.ts` — Consumer binden `(t) => parseCodePlaceholder(t, PREFIX)` selbst.
- **`image.ts`** (neu) — `imageToJpeg(src, makeCanvas, maxWpx)`. Canvas wird als Factory
  injiziert (kein Obsidian-Global im Kit-Modul).
- Hard-Dupe zwischen `obsidian-letterhead` und `obsidian-paperize` aufgelöst (waren nach dem
  Code-Fence-Fix vom 2026-07-28 byte-identisch bzw. nur im Platzhalter-Präfix unterschiedlich).

Consumer: **`obsidian-letterhead`**, **`obsidian-paperize`**.

## 0.15.0 — pdf: layoutDocument komponierbar (Start-/Folgeseiten-Cursor)

### `obsidian-kit/pure/pdf`
- **`LayoutOptions.page.startY`** (optional) — initiale Baseline-Y (PDF-pt) auf Seite 0; ohne Angabe unverändert `topYFirst - ASCENT*baseSize` (alte Semantik).
- **`LayoutOptions.page.followTopMm`** (optional) — Top-Kante (mm von oben) für Seite ≥1; ohne Angabe unverändert `marginMm.top`.
- **`LayoutResult.endPage`/`endY`** — Cursor-Position nach dem letzten Block (nächste freie Baseline), damit ein Aufrufer weitere Inhalte nahtlos anschließen kann.
- Rein additiv: ohne die neuen Felder ist die Ausgabe byte-identisch zu 0.10.1; `renderPdf` ignoriert die neuen Felder unverändert.

Consumer: **`obsidian-letterhead`** (Brief-Body eingebettet in eine Seite mit vorhandenem Kopf).

> Entwickelt als 0.11.0 auf `feat/shared-pdf-engine`; bis zum Merge lief `main` auf 0.14.0
> weiter (0.12.0–0.14.0 betreffen ausschließlich `src/obsidian/`, keine Überschneidung).
> Beim Merge auf die nächste freie Minor gehoben — die 0.11.0 wurde nie getaggt.

## 0.14.0 — obsidian/: ClockPort + realClock (injizierter Timer-/Clock-Port)

### `obsidian-kit/obsidian`
- **Neues Modul `clock`** — `ClockPort` (`{ now(), setTimeout(fn, ms), clearTimeout(id) }`) + `realClock` (echte `window`-Timer, `now` via `Date.now`). Injizierter Timer-Port: getesteter Code nimmt den Port statt barer `window`-Globals → node-testbar (kein `window` in `testEnvironment: node`) **und** konform zum Community-Store-Linter (`window`/`activeWindow` statt bare Globals/`globalThis`). Extrahiert aus vault-crews (Superset mit `now()`), vim-dojo und neurovim-standalone (Regel-der-Drei). Liegt in `src/obsidian/` (nicht `pure/`), weil `realClock` `window` berührt; der **Typ** `ClockPort` ist via `import type` runtime-frei für getesteten Code nutzbar.

## 0.13.0 — obsidian/: collapsibleSection tastaturbedienbar (a11y)

### `obsidian-kit/obsidian`
- **`collapsibleSection` ist jetzt tastatur- und screenreader-bedienbar** — der Header trägt `role="button"` + `tabindex="0"` (per Tab fokussierbar) und ein `aria-expanded`, das synchron zum Auf/Zu-Zustand gesetzt wird. **Enter** und **Leertaste** toggeln (Leertaste mit `preventDefault` gegen Seiten-Scroll). Deckt WCAG 2.1.1 (Keyboard) + 4.1.2 (Name/Role/Value) ab. Rein additiv — Signatur, Rückgabewert und Klick-Verhalten unverändert.
- **`COLLAPSIBLE_CSS`** um eine `:focus-visible`-Regel ergänzt (sichtbarer Fokus-Ring über `--interactive-accent`). Consumer, die das CSS übernommen haben, ziehen die Regel nach.

## 0.12.0 — obsidian/: collapsibleSection (erste obsidian-gekoppelte UI-Schicht)

### `obsidian-kit/obsidian` (neu — der Layer war seit v0.1.0 reserviert und leer)
- **`collapsibleSection(containerEl, opts)`** — rendert eine einklappbare Settings-Sektion (klickbarer Header mit Chevron + Titel, Body-Container) und gibt den Body zurück, in den der Consumer seine Inhalte baut. Startet eingeklappt (`defaultCollapsed`-Default `true`).
- **`resolveCollapsed(key, defaultCollapsed, storage?)`** — pure Auflösung des initialen Zustands: persistierter Wert falls gesetzt (`getCollapsed` liefert nicht `undefined`), sonst `defaultCollapsed` (so wirkt ein per-Sektion-Default beim ersten Mal und wird danach vom gespeicherten Zustand abgelöst).
- **`CollapsibleStorage`** — optionaler `getCollapsed`/`setCollapsed`-Callback (`getCollapsed → boolean | undefined`, `undefined` = kein gespeicherter Wert); das Kit bleibt storage-agnostisch (der Consumer verdrahtet z. B. `data.json`).
- **`COLLAPSIBLE_CSS`** — CSS-Snippet (nur Theme-Variablen), das der Consumer in seine `styles.css` übernimmt; das Kit injiziert bewusst kein CSS selbst.
- Infra: `tsconfig.json` `lib` um `DOM` erweitert, `obsidian` als devDependency ergänzt (bringt die `HTMLElement`-Augmentierungen wie `createDiv`/`createSpan`/`toggleClass`), `vitest.config.ts` bekommt einen `obsidian → src/testing/obsidian-mock.ts`-Alias.

Aktiviert den bislang reservierten `src/obsidian/`-Layer.

## 0.9.0 — pdf: metadata block + pagination + heading scale

### `obsidian-kit/pure/pdf`
- **`metadata`-Block** (neuer IR-Typ) — `{ type: 'metadata'; entries: { key: string; value: string }[] }` rendert einen Schlüssel/Wert-Metadaten-Block (z.B. Frontmatter-Auszug) im Layout.
- **`pagebreak`-Block** (neuer IR-Typ) + **Pagination-Optionen** — expliziter Seitenumbruch als IR-Block; Layout-Optionen zur Paginierungs-Steuerung.
- **Keep-together für Bilder & Code** — Bild- und Code-Blöcke werden nicht mehr über Seitengrenzen zerrissen, wenn sie zusammen auf die nächste Seite passen.
- **Zurückhaltendere `headingScale`-Faktoren** — Überschriften-Größen näher am Fließtext (weniger überzeichnete H1/H2).
- **Emoji-Ghost-Space behoben** — nicht-abbildbare Glyphen erzeugen keine Leerbreite mehr im AFM-Wrapping (`wrap.ts`).

## 0.8.1 — pdf: robuste WinAnsi-Kodierung

### `obsidian-kit/pure/pdf`
- **`encoding.ts`** — nicht-abbildbare Zeichen werden gedroppt bzw. gängige Symbole auf ASCII gemappt statt als `'?'` ausgegeben. Behebt kaputte Ausgabe bei emoji-/symbolreichen Notizen.

## 0.8.0 — pdf: Markdown/IR → Vektor-PDF (Core-14)

### `obsidian-kit/pure/pdf` (neu, re-exportiert über `pure/index.ts`)
- **`renderPdf(doc, options)`** — End-to-end IR + Optionen → PDF-Bytes (`Uint8Array`), synchron; Bilder müssen vor-dekodiert sein.
- **IR-Vertrag (`ir.ts`)** — plattformfreie, Markdown-artige IR (`Document = Block[]`): `heading`/`paragraph`/`list`/`blockquote`/`code`/`table`/`image`/`hr`/`unsupported`. Der stabile Vertrag zwischen „Markdown parsen" und „PDF schreiben".
- **`layoutDocument`** — Paginierung, verschachtelte Listen, Blockquote-Balken, Grid-Tabellen mit Zeilenumbruch über Seiten, Code-Boxen mit Zeichenumbruch, Bilder auf Content-Breite skaliert mit Page-Break, Dokumenttitel + laufende Kopf-/Fußzeile mit Seitenzahlen.
- **`PdfWriter`** (`writer.ts`) — Byte-Writer (text/line/rect/image-Ops, parametrisierte Seitengröße), plus `metrics.ts` (Core-14 AFM-Breiten), `wrap.ts` (AFM-genaues Wrapping), `encoding.ts` (WinAnsi), `geometry.ts`.

Contract-first aus `obsidian-letterhead` portiert. 1. Consumer: **`obsidian-paperize`** (generischer MD→PDF-Export, Dach-Spec `2026-07-11-paperize-md-to-pdf-design`). Kein `window.print()`-Weg — echtes Vektor-PDF auch auf Mobile.

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
