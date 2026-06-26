# obsidian-kit — Extraction Spec (final)

- **Status:** Finaler Spec — autoritativ. Verdichtet aus dem [Design-Brief](2026-06-26-obsidian-kit-extraction-design.md) (Survey-Herkunft) via `superpowers:brainstorming`, **geerdet gegen den echten Code** durch einen 10-Agenten-Verifikationslauf (2026-06-26). Nächster Schritt: `writing-plans`.
- **Datum:** 2026-06-26
- **Herkunft:** Survey aus der `markdown-presentation`-Session (2026-06-25, Workflow `obsidian-shared-module-survey`) → Brief → **Verifikation gegen Quellcode** (dieser Spec korrigiert den Brief an mehreren Stellen, siehe §2).
- **Entschiedene Fragen (§7 des Briefs):** (1) Standort = **eigenes Repo, Codeberg primär + GitHub-Mirror**; (2) v0.1.0 = **Pure-Kern + test-mock**; (3) Verteilung = **raw `.ts`, vom Plugin-esbuild inlined**; (4) Migration **img-to-md zuerst**.

---

## 1. Zweck & Prinzip

Ein versioniertes Source-Library-Repo **`obsidian-kit`**, in das **belegt-doppelte** Module aus den bestehenden Obsidian-Plugins extrahiert werden, um **Code-Drift zu killen**. Kein „Module auf Vorrat" — nur Entdopplung von **verifizierter** Redundanz (Regel-der-Drei).

Leitprinzipien:
- **Nur verifizierte Duplikation extrahieren.** Jeder „NOW"-Kandidat ist gegen den echten Code geprüft (§2). Plausible-aber-falsche Kandidaten (dom-safe, http) wurden **bewusst auf Regeln zurückgestuft**.
- **Das Kit ist kein Plugin**, sondern eine Quell-Bibliothek. Es kodifiziert mehrere `_docs/CONVENTIONS.md`-MUST-Regeln (PROF-OBS-03/04/07/12/13) als geteilten, getesteten Code.
- **Reinheits-Schichtung** (PROF-OBS-03/04): die `pure`-Schicht bleibt frei von obsidian-Importen → in Node testbar.
- **Doku ist das Kohäsions-Mittel** (§G): Beim gewählten Verteilungsmechanismus ist sie die *einzige* Schnittstelle zwischen Kit und Konsument.

---

## 2. Verifizierte Evidenz-Matrix

Jeder Brief-Claim wurde gegen den aktuellen Quellcode unter `/Users/Shared/code/<plugin>` geprüft (`diff`/`cmp`/`grep`, vollständige Datei-Reads). **Fett = Korrektur gegenüber dem Brief.**

| Modul | Brief sagte | Verifizierter Befund | Verdikt |
|---|---|---|---|
| **think-splitter** | extract now | `think_splitter.ts` **byte-identisch** (src 52 LOC + Tests 46 LOC), **0 Imports**, rein | ✅ **NOW** (pure) |
| **sse-delta-parser** | nur pure Core | `parseSSE` (Z. 6–27) **byte-identisch**; `streamSSE`-Transport divergiert korrekt (fetch vs XHR) | ✅ **NOW** (pure Core; Transport lokal) |
| **normalizeEndpoint** | (in „capabilities/später") | **byte-identisch**, faktisch eigenes 1-Funktions-Modul (`vault-rag/src/endpoint.ts` ↔ inline in `img-to-md/src/vision_client.ts`) | ✅ **NOW** (pure) — *aus „später" hochgestuft* |
| **clampInt** | (nicht im Brief) | numerischer Validator **5× inline** (img-to-md, vault-rag, json_viewer, kuro 12×, presentation 2×); Varianten parseInt/Number/parseFloat | ✅ **NOW** (pure util) — *neu* |
| **i18n** | „3+ divergente Signaturen" | **3 distinkte Signaturen, nur 2 von 4 Plugins divergent** (img-to-md + presentation **folgen der Spezifikation bereits**; kuro + letterhead divergieren). Die Spezifikation lebt **doc-only** in `_docs/docs/obsidian-i18n.md` (keine Template-Datei); `image-to-markdown/src/i18n.ts` ist die **De-facto-Referenz-Impl** | ✅ **NOW** (Engine; Strings bleiben pro Plugin — §5) |
| **obsidian test-mock** | (nicht im Brief) | `tests/__mocks__/obsidian.ts` in **allen 5 baubaren Plugins** (~653 LOC), klare Forks eines gemeinsamen Ahnen — **am stärksten duplizierte Sache der Flotte** | ✅ **NOW** (testing-Schicht) — *neu, Top-Befund* |
| **dom-safe** | extract now (5 Plugins) | **nur 2 von 5** haben den Helfer (json_viewer 10 LOC, presentation 2 LOC), bereits divergent, per Lint (`prefer-active-doc`) enforced; kuro's `dom.ts` ist ein **anderes** Konstrukt (createEl-Wrapper); img-to-md nutzt Globals inline; vault-rag: 0 Nutzung | ❌ **RULES-ONLY** — *zurückgestuft* |
| **http-transport** | extract now | **keine Code-Duplikation** — disjunkte APIs (img-to-md: typisiertes `{ok,status,text}`-Adapter-Paar via DI; vault-rag: `httpJson` → `{status,json}`); nur die `import`-Zeile geteilt. „Nur als Regel geteilt" stimmt — *deshalb* folgt extract-now **nicht** | ❌ **RULES-ONLY** (PROF-OBS-12 bleibt die Regel) — *zurückgestuft* |
| **llm-capabilities** | später | Vision-Tabellen + `guessVision`-Kaskade byte-identisch, **aber** die Parser divergieren per Return-Typ (`Confidence` vs `Capabilities`); `thinking`-Logik ist vault-rag-only | ⚠️ **LATER** (Return-Typ-Parameterisierung nötig) |
| **data-store + logger** | später (presentation = 2. Konsument?) | **n=1 bestätigt** — presentation ist **kein** echter 2. Konsument (nur `Object.assign`-Boilerplate, kein deep-merge/Migration/Logger) | ⚠️ **LATER** |
| **html-export** | später | Slide-API unreif (`void doc; // kept for API symmetry`-Marker), `export.ts` obsidian-gekoppelt; **aber** `inlineKatexFonts` (esbuild-Plugin) ist generisch + pure Node + stabil | ⚠️ **LATER** (Slide-API) / Katex-Inliner **abspaltbar** |
| **settings-ui** | rules-only | bestätigt (5 distinkte Dateien, vanilla `new Setting`, kein geteilter Code); `clampInt`-Carve-out (→ NOW, pure); folder-suggest (1/5) + debounced-text (0/5) erfüllen Regel-der-Drei **nicht** | ⚠️ **RULES-ONLY** + clampInt-Carve-out |
| esbuild / vitest config | (nicht im Brief) | esbuild.config.mjs 5×, vitest.config.ts 4× — gemeinsames ~8-Zeilen-Skelett, legitim divergent (katex, codemirror-externals, build-copy); kuro nutzt jest | ❌ **RULES-ONLY** (Preset/Vorlage, kein Modul) |

**Harte Korrekturen am Brief:**
1. **`obsidian-letterhead` hat kein `src/`, keinen Build, keine Tests** — nur eine handgepflegte `main.js`. Alle „6/7 Plugins teilen X"-Aussagen sind für diese Module real **5**. letterhead trägt zu keiner Code-Duplikation bei (nur i18n als Regel-Hinweis).
2. **`debounce`** ist Obsidians Built-in (`import { debounce } from "obsidian"`), kein dupliziertes Util — Survey-False-Positive.
3. **Versions-Skew ist kein Laufzeitproblem** (§6): da esbuild jede Kit-Kopie pro Plugin inlined, teilt nichts zur Laufzeit.

**Drop (Sweep-Nicht-Befunde, erfüllen Regel-der-Drei nicht):** `seededRandom` (1×), `debounce` (Built-in), retry/backoff (0×), JSON-schema-Validation (1×), path-Helfer (Obsidian-Built-in), clipboard (1×), frontmatter-parse (1×).

---

## 3. Architektur & Layering

`obsidian-kit` als **eigenständiges Source-Library-Repo** auf **Codeberg (primär) + GitHub (Mirror)**. Drei konsumierbare Subpfade über eine `exports`-Map, die auf **rohe `.ts`** zeigt (kein Build-Schritt):

```
obsidian-kit/
  package.json          # type:module, AGPL-3.0-or-later, "exports" → src/*.ts
  tsconfig.json         # target ES2022, moduleResolution Bundler, strict
  eslint.config.mjs     # typescript-eslint recommendedTypeChecked + pure-Layer-Guard
  vitest.config.ts      # node env, globals
  README.md             # §G — Einstieg/Onboarding
  MIGRATION.md          # §G — pro-Modul-Rezepte
  CHANGELOG.md          # §G — SemVer-diszipliniert
  CONTRIBUTING.md       # §G — „neues Modul hinzufügen"
  src/
    pure/               # ZERO obsidian-Import (PROF-OBS-03/04 → Node-testbar)
      think-splitter.ts #   class ThinkSplitter
      sse.ts            #   parseSSE
      endpoint.ts       #   normalizeEndpoint
      num.ts            #   clampInt
      i18n.ts           #   pickLang/setLang/getLang/t + defineStrings
      index.ts          #   barrel re-export
    testing/
      obsidian-mock.ts  #   Notice/Plugin/PluginSettingTab/Setting/TFile/setIcon + makeFakeEl/makeFakeApp + Extension-Hook
    obsidian/           # RESERVIERT, in v0.1.0 leer (dom-safe/http bleiben Regeln)
  tests/                # vitest: byte-identische think-splitter- + parseSSE-Tests, hierher gezogen
```

**Subpfad-Konsum:**
```ts
import { ThinkSplitter, parseSSE, normalizeEndpoint, clampInt } from "obsidian-kit/pure";
import { Notice } from "obsidian-kit/testing";   // nur via vitest-Alias, NIE in main.js gebündelt
```

**`exports`-Map (package.json):**
```json
{
  "name": "obsidian-kit",
  "type": "module",
  "license": "AGPL-3.0-or-later",
  "exports": {
    "./pure": "./src/pure/index.ts",
    "./testing": "./src/testing/obsidian-mock.ts"
  }
}
```

**Lint-Guard (Reinheit):** `eslint.config.mjs` setzt `no-restricted-imports` mit Pattern `obsidian` für `src/pure/**` — verhindert versehentliche obsidian-Importe, die die Node-Testbarkeit (PROF-OBS-03/04) brechen würden. Weil dom-safe + http auf Regeln zurückfallen, ist `src/obsidian/` in v0.1.0 leer — der Guard ist also fast triviale Wahrheit, was die Schichtung sauber hält.

---

## 4. Modul-Verträge (v0.1.0, alle in `pure` außer test-mock)

Jedes Modul trägt am Source ein TSDoc nach §G (Vertrag · Reinheit · kodifizierte Konvention · Beispiel · Migrations-Note).

| Modul | Öffentliche API | Reinheit | Kodifiziert | Migrationskosten |
|---|---|---|---|---|
| `ThinkSplitter` | `push(text: string): { content: string; reasoning: string }` · `flush(): { content: string; reasoning: string }` | 0 Imports | — | **0** (reiner Move + Test-Move; `partialSuffixLen`/`OPEN`/`CLOSE` bleiben modul-privat) |
| `parseSSE` | `parseSSE(buffer: string): { content: string[]; reasoning: string[]; model?: string; rest: string; done: boolean }` | 0 Imports | PROF-OBS-12 (Streaming-Parsing) | **0**; `streamSSE` bleibt **lokal** je Plugin |
| `normalizeEndpoint` | `normalizeEndpoint(endpoint: string): string` | 0 Imports | — | gering; img-to-md zieht es aus `vision_client.ts` heraus |
| `clampInt` | `clampInt(value: unknown, min: number, max: number, fallback: number): number` | 0 Imports | — | gering; **eine** Signatur ersetzt 5 Inlinings (Varianz parseInt/Number/parseFloat bewusst vereinheitlicht) |
| `i18n` | `pickLang(raw?: string\|null): Lang` · `setLang(l: Lang): void` · `getLang(): Lang` · `t(key: string, ...args: (string\|number)[]): string` · `defineStrings(d: Record<Lang, Dict>): void` | 0 Imports | **PROF-OBS-07** | §5 — img-to-md/presentation ~0; kuro teuer; letterhead nur Regel |
| `obsidian-mock` (testing) | Stub-Set (`Notice`, `Plugin`, `PluginSettingTab`, `Setting`, `TFile`, `setIcon`, …) + `makeFakeEl()` + `makeFakeApp()` + Plugin-Extension-Hook | ist Test-Fixture (steht *für* obsidian) | PROF-OBS-08 (Mock via vitest-Alias) | mittel; json_viewer nutzt happy-dom (kein `makeFakeEl`) → Extension-Hook nötig |

**Zwei Verträge mit Festlegungs-Bedarf (Quelle der Wahrheit beim Merge):**
- **`clampInt`-Soll-Semantik:** `Number(value)` parsen → bei `!Number.isFinite` auf `fallback`, sonst `Math.min(max, Math.max(min, Math.trunc(n)))`. Diese Semantik ist verbindlich; die 5 divergenten Inlinings (parseInt/parseFloat/`>0`-Guard) werden **darauf** vereinheitlicht, nicht umgekehrt. Floats werden via `Math.trunc` zu Int (kein Round) — bestehende Call-Sites mit Float-Eingaben (vault-rag `0..1`) prüfen, ob Int-Semantik passt; falls nicht, dort lokal lassen (nicht erzwingen).
- **`obsidian-mock`-Extension-Hook (Form):** der Mock wird als **Factory** geliefert — `createObsidianMock(overrides?: Partial<MockStubs>): MockStubs` — die das Superset der Default-Stubs zurückgibt und plugin-eigene Stubs **mergt/überschreibt**. Der vitest-Alias zeigt auf ein dünnes Plugin-lokales `tests/__mocks__/obsidian.ts`, das `createObsidianMock({...})` aufruft und re-exportiert. json_viewer (happy-dom statt `makeFakeEl`) übergibt seine eigene `el`-Factory als Override; die Default-`makeFakeEl` bleibt für die anderen 4. **Quelle der Wahrheit für das Default-Superset:** der Merge der 5 bestehenden `tests/__mocks__/obsidian.ts` (Basis `Notice/Plugin/PluginSettingTab/Setting/TFile` = 5/5, `setIcon` = 4/5; vault-rag trägt `toggleClass/AbstractInputSuggest/FuzzySuggestModal/TFolder/WorkspaceLeaf` bei).

**Fehlersemantik (alle Module total/rein, kein Throw außer dokumentiert):**
- `parseSSE` gibt unvollständige Zeilen via `rest` zurück (kein Throw).
- `clampInt` fällt bei nicht-finiten/ungültigen Werten auf `fallback` zurück.
- `t` fällt dreistufig zurück: `currentLang → en → key`; unbesetzte `{n}`-Platzhalter bleiben stehen.
- Verhalten ist **identisch** zum heutigen — die übernommenen byte-identischen Tests sichern es ab.

---

## 5. i18n — Engine-vs-Strings-Split

Heute kombiniert jede lokale `i18n.ts` **Engine** (`pickLang/setLang/getLang/t` + modul-lokaler `currentLang`) und **Strings** (EN/DE-Dicts). Das Kit liefert nur die **Engine**; die ~30–60 Strings bleiben pro Plugin. Um Call-Site-Churn zu minimieren, **delegiert** die lokale `i18n.ts` und schrumpft auf Strings + eine Zeile:

```ts
// Plugin src/i18n.ts (nach Migration)
import { defineStrings } from "obsidian-kit/pure";
export { pickLang, setLang, getLang, t } from "obsidian-kit/pure";

const EN = { "notice.copied": "Copied", "view.cardHead": "Image {0}/{1} · {2}" /* … */ };
const DE = { "notice.copied": "Kopiert", "view.cardHead": "Bild {0}/{1} · {2}" /* … */ };
defineStrings({ en: EN, de: DE });
```

Jeder bestehende `import { t } from "./i18n"` bleibt **unverändert** funktionsfähig. Der Modul-Level-State (`currentLang`, Strings) ist **pro Plugin** (esbuild inlined → keine Cross-Plugin-Kollision, auch wenn `t` eine freie Funktion ist).

**Migrationsaufwand pro Plugin (verifiziert):**
- **img-to-md, markdown-presentation:** folgen der Spezifikation (`obsidian-i18n.md`) bereits → nur die lokale `i18n.ts` auf Delegation umbauen, ~0 Call-Site-Änderungen.
- **kuro-gamification (teuer):** `t(key, lang, vars)` → `t(key, ...args)`; named Platzhalter (`{xp}`, `{title}`, …) → positional `{0}` in `de.ts`/`en.ts` umschreiben + auf Arg-Reihenfolge mappen; `lang`-Arg an **allen** Call-Sites entfernen; `setLang(pickLang(...))` im `onload` ergänzen. **Gehört in die Migrationsphase, nicht in v0.1.0.**
- **obsidian-letterhead:** hat kein `src/` (nur gebündelte `main.js`) → nur Regel-Hinweis, **keine** Code-Migration.

---

## 6. Verteilung, Versionierung & Release

**git-Dependency, raw `.ts`:**
```jsonc
// konsumierendes Plugin package.json
"obsidian-kit": "git+https://codeberg.org/jkaindl/obsidian-kit.git#0.1.0"
```
- **Kein `prepare`/Build** — npm zieht den Source. Das Plugin-esbuild **inlined** die `.ts` direkt (esbuild kompiliert TS nativ). Die pure-Schicht hat keinen obsidian-Import; `external: ["obsidian","electron"]` bleibt unberührt.
- **Typecheck im Konsumenten:** `tsc --noEmit` mit `moduleResolution: "Bundler"` löst die `exports`-Map auf die `.ts` auf und typecheckt direkt gegen Source. Kein `allowImportingTsExtensions` nötig (das Import-Specifier trägt keine Extension; die exports-Map resolved).
- Der test-mock wird **ausschließlich** im Test-Pfad gezogen, nie ins `main.js` gebündelt. **Alias-Kette:** der vitest-`resolve.alias` im **Konsumenten** zeigt auf das dünne plugin-lokale `tests/__mocks__/obsidian.ts` (wie heute, PROF-OBS-08), das seinerseits `createObsidianMock({...})` aus `obsidian-kit/testing` aufruft und re-exportiert (§4). Das Kit selbst braucht **keinen** Alias (seine pure-Tests importieren nichts von `obsidian`).

**Kit ist KEIN Plugin** → PROF-OBS-09's Plugin-Release-Maschinerie (`manifest.json`-Assertion, `main.js`/`styles.css`-Asset-Attach, „Obsidian liest manifest aus dem Asset") **entfällt**. Kit-Release =
- **SemVer-Tag ohne v-Präfix** (`[0-9]+.[0-9]+.[0-9]+`),
- **CI-Gate:** `tsc --noEmit` + `vitest run` + `eslint` (inkl. pure-Layer-Guard) — **kein** Build/`main.js`,
- **CHANGELOG.md** als Release-Notes-Quelle,
- **dual-forge im Lockstep getaggt:** derselbe Commit wird an beide Remotes getaggt, identische SHA — via Release-Script, nicht von Hand: `git tag <ver> && git push codeberg <ver> && git push github <ver>` (beide Remotes zeigen auf denselben lokalen Tag → bit-identisch). Plugins pinnen die Codeberg-URL; fällt Codeberg aus, ist der GitHub-Mirror-Tag bit-identisch und kann temporär gepinnt werden.
- **Keine Release-Assets nötig** (Konsumenten holen Source via git-Dep).

**Versions-Skew-Mitigation (entschärft ggü. Brief §6):** Da nichts zur Laufzeit geteilt wird, ist Skew **kein Laufzeitproblem** — jedes Plugin bündelt seine eigene gepinnte Kit-Kopie. Es bleibt nur: ein Kit-Bugfix muss in N Plugins re-gepinnt werden. Mitigation = exportierter `KIT_VERSION`-Const (für Logging/Diagnose) + **periodischer „bump kit pin"-Sweep**, **keine** harte `release.yml`-Assertion.

---

## G. Dokumentations-Strategie (Kohäsions-Mittel)

**Prinzip:** Der gewählte Mechanismus — inlined, auf Tag gepinnt, jedes Plugin im eigenen Repo, kein Monorepo — eliminiert jede andere Sichtbarkeit. Wer in einem Plugin arbeitet, sieht das Kit nur als `node_modules/obsidian-kit/`. **Die Doku ist damit die einzige Schnittstelle zwischen Kit und Konsument — und das einzige Mittel gegen genau die Drift, die das Kit killt.** Schlechte Doku → Konsumenten driften wieder auseinander → das Kit bricht sein eigenes Versprechen.

**Synergie mit der raw-`.ts`-Entscheidung:** Weil Source statt gebautes `.js`+`.d.ts` ausgeliefert wird, erscheinen die **vollständigen TSDoc-Kommentare am Source** direkt im IntelliSense/Hover des Konsumenten. → **TSDoc am Modul ist der primäre Doku-Träger**, nicht ein abseits liegendes README.

**Ebenen:**
1. **`README.md` (Root):** Zweck (Drift killen) · Layering-Modell (pure/obsidian/testing) · Install-Snippet (git-Pin) · Subpfad-Map · Versions-/Release-Politik · dual-forge-Hinweis · **„So onboardest du ein neues Plugin ans Kit"** (Schritt-für-Schritt).
2. **Pro-Modul-TSDoc (am Source):** Was tut es · exakte Signatur · **Reinheits-Garantie** (pure / keine obsidian-Importe) · **kodifizierte Konvention** (z. B. „implementiert PROF-OBS-07") · ein **minimales lauffähiges Beispiel** · **Migrations-Note** (wie ein Plugin von der Inline-Version umsteigt).
3. **`MIGRATION.md`:** pro Modul ein Rezept „lokale Kopie → Kit-Import", inkl. der teuren Fälle (kuro i18n named→positional, §5).
4. **`CHANGELOG.md`:** SemVer-diszipliniert — die *einzige* Art, wie ein gepinntes Plugin erfährt, was ein Bump bringt. Jeder Tag bekommt einen Eintrag.
5. **`CONTRIBUTING.md` — „neues Modul hinzufügen":** Regel-der-Drei-Gate (≥2 echte Impls, gegen Code verifiziert) · pure-vs-obsidian-Entscheidung · `exports`-Map-Update · Test + Doc-Beispiel · Changelog-Eintrag. Macht die **deferred-Module** (capabilities, data-store, html-export) später anschlussfähig, ohne das Design neu zu erfinden.
6. **Bidirektionaler Link zu `_docs/CONVENTIONS.md`:** eine Notiz dort, die je MUST-Regel sagt, ob sie jetzt **Kit-Code** ist (importieren — PROF-OBS-07/12-Streaming-Parser) oder **nur Regel** bleibt (dom-safe/http als Pattern). Das Kit-README zeigt zurück auf die Regeln. Verhindert eine zweite Quelle der Wahrheit.
7. **Doku-driftet-nicht-Garantie:** jedes in TSDoc/README dokumentierte Beispiel wird als Testfall im `*.test.ts` des Moduls **gespiegelt** (gleiche Eingabe → gleiche dokumentierte Ausgabe), CI-gated — kein doctest-Tool nötig, nur Disziplin + Review. Das Anti-Drift-Werkzeug darf nicht selbst driften.

---

## 8. Tests & Qualität

- **pure-Schicht:** vitest (node env). Die byte-identischen `think_splitter.test.ts` und der `parseSSE`-`describe`-Block (aus `sse.test.ts`) wandern mit ins Kit — nur Import-Pfad ändern. Neue Tests für `clampInt` (Varianten-Konsolidierung) und `i18n` (`defineStrings` + 3-stufiger Fallback).
- **testing-Schicht:** der `obsidian-mock` ist selbst Test-Infrastruktur; ein Smoke-Test sichert die Stub-Oberfläche + den Plugin-Extension-Hook.
- **CI-Gate (jeder Tag/PR):** `tsc --noEmit` + `vitest run` + `eslint` (mit pure-Layer-`no-restricted-imports`-Guard) + doc-example-as-test (§G.7). Kein Build.
- `streamSSE`-Tests bleiben **lokal** je Plugin (img-to-md fakt eine `Response.getReader`; vault-rag nutzt `tests/fake_xhr.ts`/`installFakeXHR`, das nur dort existiert).

---

## 9. Sequencing & Migration

1. **v0.1.0 cutten:** byte-identische Module (`ThinkSplitter`, `parseSSE`, `normalizeEndpoint`) aus img-to-md/vault-rag nach `src/pure/` ziehen (Move + Tests); `clampInt` aus den 5 Inlinings zur einen Signatur konsolidieren; `i18n`-Engine kanonisch anlegen; `obsidian-mock` aus den 5 Forks zur **Superset**-Version mergen (json_viewer-JSDoc-Superset bei dom-Helfern beachten, falls relevant). Doku (§G) + CI grün → taggen, dual-forge pushen.
2. **Erste Konsumenten = img-to-md, dann vault-rag** (sie hielten die Duplikate → sie validieren die Entdopplung). **img-to-md zuerst** (Referenz-Impl für i18n, meiste Überlappung).
3. **Opportunistisch danach:** markdown-presentation (i18n-Engine, clampInt, test-mock), kuro-gamification (i18n **teuer** §5, clampInt, test-mock), json_viewer (clampInt, test-mock). obsidian-letterhead nur Regel-Hinweis (kein `src/`).
4. Pro Kit-Release den git-tag-Pin in jedem migrierten Plugin neu setzen (§6-Sweep).

---

## 10. Deferred & abspaltbar (bewusst NICHT in v0.1.0)

- **llm-capabilities** (später): Vision-Tabellen + `guessVision`-Kaskade + Confidence-Helfer sind byte-identisch und liftbar, **aber** die Metadaten-Parser divergieren per Return-Typ (`Confidence|null` vs `Capabilities|null`) — Extraktion erfordert Return-Shape-Parameterisierung. `thinking`-Logik + `merge/resolveCapabilities` sind vault-rag-only und bleiben draußen. Clients (Vision/Chat/Embedding) divergieren korrekt → bleiben pro Plugin.
- **data-store + logger** (später): n=1 (nur kuro). Erst hochstufen, wenn ein 2. Plugin **unabhängig** deep-merge ODER schemaVersion-Migration ODER einen leveled Runtime-Logger braucht.
- **html-export Slide-API** (später): unreif (`void doc; // kept for API symmetry`); die generische „markdown→PDF"-Naht **existiert noch nicht** (Geometrie, `.sd-*`-CSS, fit-scaling müssten erst erfunden werden). Seed inkl. `deck-css.ts`.
- **katex-font-inliner** (abspaltbar, sobald gewünscht): `inlineKatexFonts` ist generisch, pure Node, stabil → eigener `obsidian-kit/build`-Helfer ODER Build-Regel, unabhängig von der Slide-API.

---

## 11. Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| **Pure-vs-obsidian-Reinheit** (versehentlicher obsidian-Import in `pure`) | Subpfade + `no-restricted-imports`-Lint-Rule (PROF-OBS-03/04); CI-Gate |
| **Versions-Skew durch Inlining** | Kein Laufzeitproblem (nichts geteilt); `KIT_VERSION`-Const + periodischer Pin-Sweep statt harter Assertion (§6) |
| **Codeberg-SPOF / Mirror-Drift** | dual-forge im Lockstep getaggt (identische SHA); wo Provenance zählt, per Commit-SHA statt Tag pinnen |
| **i18n-Migration unterschätzt** | Aufwand verifiziert pro Plugin (§5); kuro explizit als teuer markiert + in die Migrationsphase verschoben, nicht v0.1.0 |
| **Doku-Drift** (Kit-eigenes Versprechen brechen) | doc-example-as-test, CI-gated (§G.7); TSDoc am Source als primärer Träger |
| **Über-Extraktion** (dom-safe/http/capabilities-Clients) | gegen Code verifiziert + bewusst auf Regeln/„später" zurückgestuft (§2) |
| **test-mock-Fork-Divergenz** beim Mergen | Superset-Version + Plugin-Extension-Hook für plugin-eigene Stubs (json_viewer/happy-dom als Sonderfall dokumentiert) |

---

## 12. Nicht-Ziele (YAGNI)

- **Kein** Monorepo, **kein** npm-publish, **kein** git-submodule, **kein** copy-paste-Template (= die Drift, die wir killen).
- **Keine** settings-Widget-Lib (kämpft gegen die vanilla Setting-API; PROF-OBS-06).
- **Kein** obsidian-Layer-Code in v0.1.0 (dom-safe/http sind Regeln, kein Modul).
- **Kein** Kit-Build-Schritt, solange raw `.ts` + esbuild-Inlining trägt.

---

## 13. Quellen

- **Brief / Survey-Herkunft:** [`2026-06-26-obsidian-kit-extraction-design.md`](2026-06-26-obsidian-kit-extraction-design.md); Survey-Run `markdown-presentation` 2026-06-25 (Workflow `obsidian-shared-module-survey`).
- **Verifikationslauf 2026-06-26** (10 Agenten, gegen Quellcode): byte-Diffs/greps/Reads über `image-to-markdown`, `vault-rag`, `json_viewer`, `kuro-gamification`, `markdown-presentation`, `obsidian-letterhead`.
- **Konventionen:** `_docs/CONVENTIONS.md` PROF-OBS-03/04/07/08/09/12/13; `_docs/docs/obsidian-i18n.md` (kanonisches i18n, PROF-OBS-07); `_docs/templates/obsidian-plugin/` (Scaffold-Build-Setup).
- **Konkrete Dateien:** `image-to-markdown/src/{i18n,http,sse,think_splitter,capabilities,vision_client}.ts`; `vault-rag/src/{http,sse,think_splitter,capabilities,endpoint,chat_client}.ts`; `json_viewer/src/obsidian/dom.ts`; `kuro-gamification/40_src/src/{persistence/DataStore,utils/logger,i18n/*}.ts`; `markdown-presentation/src/{render-dom,export,deck-css,dom-safe,i18n}.ts` + `esbuild.config.mjs` (katex-font-inlining); je Plugin `tests/__mocks__/obsidian.ts`.
