# dom-to-ir + code-blocks + image → obsidian-kit 0.17.0 — Design

**Datum:** 2026-07-28
**Status:** genehmigt (autonome Umsetzung autorisiert)
**Kit-Kandidat:** REGISTRY DOM→IR-Frontend (letterhead↔paperize, Hard-Dupe aus drift-audit 2026-07-16/27)

## Problem

`obsidian-letterhead` und `obsidian-paperize` exportieren beide Markdown → PDF über dieselbe
Pipeline: Obsidian rendert Markdown in eine detached DOM, ein Konverter baut daraus die
kit-eigene IR (`Block[]`), Bilder werden zu JPEG rasterisiert. Drei Module sind seit dem
Code-Fence-Fix (2026-07-28, paperize `dom-to-ir.ts` 155→169 Zeilen an letterhead angeglichen)
faktisch identisch:

1. **`dom-to-ir.ts`** (`domToIrSync` + `resolveImages`) — jetzt byte-identisch zwischen beiden
   Repos.
2. **`code-blocks.ts`** (`extractCodeBlocks`/`codePlaceholder`/`parseCodePlaceholder`) —
   identisch bis auf den Platzhalter-Präfix (`LETTERHEADCODE` vs. `PAPERIZECODE`).
3. **`image.ts`** (`imageToJpeg`) — identisch bis auf einen Unterschied: letterhead injiziert
   die `<canvas>`-Erzeugung als Factory (`makeCanvas: () => HTMLCanvasElement`), paperize
   erzeugt sie noch selbst über `activeDocument.createElement('canvas')` — ein
   PROF-OBS-04-Verstoß (Obsidian-Global in `core/`), den letterhead bereits sauber gelöst hat.

Alle drei sind reine Konsumenten von Browser-DOM-APIs bzw. bereits-vendorten Kit-Typen
(`Block`/`Inline` aus `pdf/ir.ts`) — kein Obsidian-Import, passen ins `pure/`-Layering.

## Ansatz

Verbatim-Extraktion nach `pure/pdf/` (thematisch bei `ir.ts`/`layout.ts` — beide Module
existieren nur für die PDF-Export-Pipeline), mit zwei Parametrisierungen, die die
Präfix-Unterschiede zwischen den Consumern kapseln:

- `code-blocks.ts`-Funktionen nehmen einen `prefix: string`-Parameter statt eines fest
  codierten Strings.
- `domToIrSync`s `opts` bekommt `resolvePlaceholder?: (text: string) => number | null` statt
  eines internen Imports von `parseCodePlaceholder` — konsistent mit dem bereits bestehenden
  `decode`-Callback-Muster in `resolveImages`. Der Aufrufer bindet den Präfix:
  `(t) => parseCodePlaceholder(t, 'LETTERHEADCODE')`. `dom-to-ir.ts` bleibt dadurch vollständig
  unabhängig vom konkreten Platzhalter-Format von `code-blocks.ts`.

`image.ts` wird verbatim aus letterheads bereits PROF-OBS-04-konformer Version übernommen
(Canvas-Factory-Injection) — paperize übernimmt beim Vendoring diesen Fix mit
(`imageToJpeg(url, () => createEl('canvas'), 1600)` statt direktem `activeDocument`-Zugriff).

## Umsetzung

### 1. Kit-Module

Drei neue Dateien unter `obsidian-kit/src/pure/pdf/`:

- **`code-blocks.ts`** — verbatim aus letterhead, `codePlaceholder`/`parseCodePlaceholder`/
  `extractCodeBlocks` nehmen zusätzlich `prefix: string` als **letzten** Parameter entgegen
  (kein Default — ein optionaler Default würde die Präfix-Kollision zwischen Consumern
  stillschweigend ermöglichen).
- **`dom-to-ir.ts`** — verbatim aus letterhead (aktuell byte-identisch mit paperize), `opts`
  erweitert um `resolvePlaceholder?: (text: string) => number | null` statt des lokalen
  `parseCodePlaceholder`-Imports.
- **`image.ts`** — verbatim aus letterheads Version (Canvas-Factory-Injection), Log-Präfix im
  Fehlerfall generisch (`'obsidian-kit: image rasterization failed'` statt
  Letterhead-/Paperize-spezifisch — Consumer können bei Bedarf selbst loggen, das Kit-Modul
  bleibt neutral).

`pure/pdf/index.ts` ergänzt:

```ts
export * from './dom-to-ir';
export * from './code-blocks';
export { imageToJpeg } from './image';
```

`KIT_VERSION` → `"0.17.0"` (additive Public-API, kein Breaking Change an bestehenden Exports).

### 2. Tests (TDD, neu — Zusammenführung der bestehenden Consumer-Tests)

`obsidian-kit/tests/pure/pdf/{code-blocks,dom-to-ir,image}.test.ts`:

- `code-blocks.test.ts` — aus letterhead/paperize `tests/core/code-blocks.test.ts` übernommen,
  `prefix`-Argument in jedem Aufruf explizit gesetzt (kein stiller Default).
- `dom-to-ir.test.ts` — aus letterheads `tests/core/dom-to-ir.test.ts` übernommen; die
  Platzhalter-Tests binden `resolvePlaceholder: (t) => parseCodePlaceholder(t, 'TESTCODE')`
  statt eines Kit-internen Imports.
- `image.test.ts` — **neu** (bisher in keinem Consumer getestet). `Image`/`HTMLCanvasElement`
  minimal gemockt (`getContext` liefert ein Fake-2D-Context-Objekt mit `fillRect`/`drawImage`
  als No-Ops, `toDataURL` liefert einen festen Base64-String) — deckt: erfolgreicher Pfad
  (Bytes + wPx/hPx korrekt skaliert), leerer `src` → `null`, `onerror` → `null`,
  fehlender 2D-Context → `null`.

`happy-dom` als devDependency in `obsidian-kit/package.json` ergänzen (aktuell nur transitiv
über vitest vorhanden, nicht deklariert) — `dom-to-ir.test.ts`/`image.test.ts` brauchen
`// @vitest-environment happy-dom` pro Datei, wie in den Consumern bereits etabliert.

### 3. letterhead-Migration

- `vendor/kit/pdf/{code-blocks,dom-to-ir,image}.ts` aus Kit @0.17.0 kopieren, VENDOR.json
  aktualisieren (Version + SHA + Dateiliste).
- `src/core/{code-blocks,dom-to-ir,image}.ts` + zugehörige Tests unter `tests/core/` löschen.
- `src/obsidian/main.ts`: Imports auf `../vendor/kit/pdf/{code-blocks,dom-to-ir,image}`
  umbiegen; Call-Sites:
  - `extractCodeBlocks(model.bodyMarkdown || '', 'LETTERHEADCODE')`
  - `domToIrSync(holder, { codes, resolvePlaceholder: (t) => parseCodePlaceholder(t, 'LETTERHEADCODE') })`
  - `imageToJpeg(...)`-Aufrufe unverändert (Signatur identisch).
- `tests/vendor-smoke.test.ts` um einen schlanken Smoke-Block für die drei neuen Module
  ergänzen (Import trägt + ein Kernfall pro Modul, analog zum bestehenden
  `collapsible`-Smoke-Block).

### 4. paperize-Migration

Gleiches Schema wie letterhead, zusätzlich:

- Präfix `'PAPERIZECODE'` an den Call-Sites.
- `src/obsidian/main.ts`: `imageToJpeg(url, () => createEl('canvas'), 1600)` statt
  `imageToJpeg(url, 1600)` (Signatur ändert sich für paperize — dritter Parameter wird
  Pflicht — das ist der beabsichtigte PROF-OBS-04-Fix aus dieser Extraktion).
  `createEl` aus `'obsidian'` importieren (dort vermutlich schon für andere Zwecke importiert
  — prüfen, sonst Import ergänzen).

### 5. Verifikation pro Repo

- **Kit:** `npm test` (alle neuen `pdf/{code-blocks,dom-to-ir,image}`-Tests grün) +
  `npm run typecheck` + `npm run lint`.
- **letterhead:** `npm run typecheck && npm test && npm run build` grün.
- **paperize:** `npm run typecheck && npm test && npm run build` grün — insbesondere
  `check:pure`/Store-Lint falls vorhanden, da `core/` jetzt frei von
  `activeDocument.createElement` ist.

### 6. Registry-Abschluss

`REGISTRY.md` / `KIT-MATRIX.md`:

- DOM→IR-Kandidat als erledigt markieren (Hard-Dupe aufgelöst, jetzt Kit-Modul `pure/pdf`,
  vendored: letterhead, paperize).
- `image.ts`/`imageToJpeg`-Zeile ergänzen (bisher nicht als Kit-Kandidat erfasst, da vor
  diesem Audit als "generalisierte Portierung" nur lokal dupliziert stand).
- Cockpit-`fokus` (obsidian-plugins-Dach) als erledigt markieren, nächster Kandidat
  (FolderSuggest oder Frontmatter-Serializer) nachziehen.

## Nicht-Ziele (YAGNI)

- Keine Konsolidierung mit `pdf/layout.ts`/`pdf/options.ts` (separates Pin-Modell, siehe
  VENDOR.json-Kommentar — bleibt unangetastet).
- Keine Erweiterung von `Block`-Typen (`'code'` existiert bereits in `pdf/ir.ts`).
- Kein npm-Publish; Git-Tag-Modell bleibt. Tag `0.17.0` lokal + Dual-Push
  (Codeberg + GitHub), wie bei allen bisherigen Kit-Releases.
- Keine Rückwirkende Versions-Bookkeeping-Reparatur (anders als beim `model-context.ts`-Fall
  2026-07-11) — `CHANGELOG.md`/`package.json` sind hier bereits synchron.
