# obsidian-kit — Extraction Design Brief

- **Status:** ✅ **Finalisiert** → autoritativer Spec: [`2026-06-26-obsidian-kit-spec.md`](2026-06-26-obsidian-kit-spec.md). Dieses Dokument bleibt als Survey-Herkunfts-/Evidenz-Record erhalten; bei Widersprüchen gilt der Spec (er korrigiert mehrere Brief-Claims gegen den echten Code — siehe Spec §2).
- **Datum:** 2026-06-26
- **Herkunft:** Survey-Ergebnis aus der `markdown-presentation`-Session (2026-06-25). User-Entscheidung damals: „Plugin zuerst + Kit-Cleanup parallel anstoßen". Das Plugin ist fertig (MVP auf `main`); dieser Brief hält die Survey-Evidenz fest, damit nichts verloren geht.

> **Beim Start der dedizierten Session:** `superpowers:brainstorming` laufen lassen, um diesen Brief zum finalen Spec zu verdichten (offene Fragen unten). Dann `writing-plans`.

## 1. Zweck
Ein versioniertes Repo **`obsidian-kit`**, in das **bereits doppelte** Module aus den bestehenden Obsidian-Plugins extrahiert werden, um **Code-Drift** zu killen. Nicht „Module auf Vorrat", sondern Entdopplung von belegter Redundanz (Regel-der-Drei).

## 2. Evidenz (Duplikations-Matrix, Survey über 7 Plugins)
| Modul | Vorkommen | Verdikt |
|---|---|---|
| **think-splitter** | img-to-md + vault-rag — **byte-identisch** | ✅ **EXTRACT now** (Copy-Paste-Drift, höchste Konfidenz) |
| **i18n** | img-to-md, kuro-gamification, obsidian-letterhead (+ Scaffold) — 3 divergente Signaturen | ✅ **EXTRACT now** (auf scaffold-kanonisches `pickLang/setLang/getLang/t(key,...args)` konvergieren) |
| **dom-safe** (activeDoc/activeWin) | 5 Plugins, ~10–24 LOC, fast identisch | ✅ **EXTRACT now** (winzig, drift-prone, lint-relevant PROF-OBS-13) |
| **http-transport** (requestUrl-JSON + activeWindow-Streaming-Escape) | img-to-md + vault-rag (PROF-OBS-12-Regel, nie als Code geteilt) | ✅ **EXTRACT now** (klein, drift-prone) |
| **sse-delta-parser** | img-to-md + vault-rag — `sse.ts` divergiert (fetch-stream vs XHR) | ⚠️ nur den **puren Delta-Parser** vereinheitlichen; Transport-Wiring lokal |
| **llm-capabilities** | `capabilities.ts` ist expliziter Fork img-to-md↔vault-rag (gleiche Modell-Namens-Tabellen) | ⚠️ **später**: nur `capabilities`-Heuristiken + `normalizeEndpoint` — **nicht** die Clients (Vision/Chat/Embedding divergieren korrekt) |
| **data-store + logger** | kuro (loadData/saveData + deep-merge + schema-migration; runtime LogLevel) | ⚠️ **später** (nur 1 saubere Impl; presentation = 2. Konsument) |
| **html-export** (Slides→PDF/Bilder) | existierte nirgends → in `markdown-presentation` frisch gebaut | 🌱 **später extrahieren** (der Seed ist jetzt da: `src/render-dom.ts` + `src/export.ts` + esbuild-katex-font-inlining) |
| **settings-ui** | 6 Plugins | ❌ **NICHT** als Code — nur **Regeln** teilen (Scaffold mandatiert vanilla Setting-API; eine Widget-Lib kämpfte dagegen) |
| **pdf-render** (pdf.js-Lesen) | nur img-to-md | ❌ Regel-der-Drei nicht erfüllt |
| **backlinks-paths** | 5 Plugins, aber „present" bedeutet überall etwas anderes (nur `normalizePath` gemeinsam = Obsidian-API) | ❌ kein teilbares Surface |

## 3. Empfohlene Kit-Module
- **Jetzt (≥2 echte Impls):** `i18n`, `dom-safe`, `think-splitter` (+ purer SSE-Delta-Parser), `http-transport`.
- **Später:** `llm-capabilities` (capabilities + normalizeEndpoint), `data-store` + `logger`, `html-export` (aus markdown-presentation, jetzt stabilisiert).

## 4. Mechanismus (Survey-Empfehlung)
Eigenes Codeberg-Repo **`obsidian-kit`**, von jedem Plugin als **git-Dependency gepinnt auf einen Release-Tag** eingebunden (`"obsidian-kit": "git+https://codeberg.org/<user>/obsidian-kit.git#<tag>"`). esbuild **inlined** es beim Build → kein Runtime-Problem; jedes Plugin behält seinen eigenen Release-Takt (PROF-OBS-09).
- **Verworfen:** published-npm (zweite Registry/Identity), git-submodule (verschmutzt Working-Trees, bricht „copy template + go"), monorepo (widerspricht „je Plugin eigenes Repo"), copy-paste-Templates (= die Drift, die wir killen).
- **Layering:** Sub-Pfade `obsidian-kit/pure` (i18n, think-splitter, capabilities) vs `obsidian-kit/obsidian` (dom-safe, http, settings-Helfer) — eslint-Guard gegen obsidian-Import in der pure-Schicht (sonst Node-Testbarkeit kaputt).

## 5. Sequencing
- **AI-Plugin-Dedup (now, unabhängig):** think_splitter, http, capabilities, i18n aus img-to-md + vault-rag — die haben ihre 2 Impls bereits; blockiert nichts.
- **html-export (später):** jetzt extrahierbar, da markdown-presentation die API bewährt hat. Nicht vorher (sonst friert man eine unausgereifte Slide-API ein).
- Migration der Plugins **eins nach dem anderen**, git-tag-Pin nach jeder Kit-Release neu setzen.

## 6. Risiken (für die finale Spec adressieren)
- **Versions-Skew durch Inlining:** zwei Plugins können verschiedene Kit-Versionen bündeln; ein Kit-Bugfix muss N-mal re-released werden → Kit-Versions-Assertion in jeder `release.yml` + periodischer „bump kit pin"-Sweep.
- **Pure-vs-obsidian-Reinheit:** versehentlicher obsidian-Import in der pure-Schicht → Sub-Pfade + Lint-Rule.
- **settings-ui-Fehl-Extraktion:** verlockend (6 Plugins), aber lint-illegal gegen vanilla Setting-API → Regeln-only.
- **LLM-Cluster-Über-Extraktion:** Clients divergieren korrekt; nur Heuristiken teilen.
- **Codeberg-SPOF / Mirror-Drift:** Kit auf beiden Remotes lockstep taggen; wo Provenance zählt, per Commit-SHA pinnen.

## 7. Offene Fragen fürs Brainstorming
1. Wo lebt das Kit physisch — eigenes Repo (empfohlen) vs. ein Bereich in `_docs` (User-Ursprungsidee)? Tradeoffs: eigenes Repo = sauberer Release/Versionierung; `_docs` = ein Ort weniger, aber vermischt Konventions-Doku mit konsumierbarem Code.
2. Erste Kit-Release: nur `pure`-Module (i18n, think-splitter) oder gleich `dom-safe`+`http` mit?
3. Test-/Build-Setup des Kit (vitest, eigene esbuild? oder nur tsc + Typen?).
4. Reihenfolge der Plugin-Migration (img-to-md zuerst, da meiste Überlappung?).

## 8. Quellen
- Survey-Run: `markdown-presentation` Session 2026-06-25 (Workflow `obsidian-shared-module-survey`).
- Konkrete Dateien: `image-to-markdown/src/{i18n,http,sse,think_splitter,capabilities}.ts`, `vault-rag/src/{http,sse,think_splitter,capabilities,chat_client}.ts`, `json_viewer/src/obsidian/dom.ts`, `kuro-gamification/40_src/src/{persistence/DataStore,utils/logger,i18n}.ts`, `obsidian-letterhead` (UI_STRINGS, @page/print), Scaffold `_docs/templates/obsidian-plugin/` + `_docs/docs/obsidian-i18n.md`.
- html-export-Seed: `markdown-presentation/src/{render-dom,export,deck-css}.ts` + `esbuild.config.mjs` (katex-font-inlining).
