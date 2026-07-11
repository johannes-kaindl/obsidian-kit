# Changelog

Alle nennenswerten Änderungen am Kit. Format: SemVer ohne v-Präfix. Dies ist die **einzige** Quelle, aus der ein auf einen Tag gepinntes Plugin erfährt, was ein Bump bringt — jeder Tag bekommt einen Eintrag.

## 0.11.0 — pdf: layoutDocument komponierbar (Start-/Folgeseiten-Cursor)

### `obsidian-kit/pure/pdf`
- **`LayoutOptions.page.startY`** (optional) — initiale Baseline-Y (PDF-pt) auf Seite 0; ohne Angabe unverändert `topYFirst - ASCENT*baseSize` (alte Semantik).
- **`LayoutOptions.page.followTopMm`** (optional) — Top-Kante (mm von oben) für Seite ≥1; ohne Angabe unverändert `marginMm.top`.
- **`LayoutResult.endPage`/`endY`** — Cursor-Position nach dem letzten Block (nächste freie Baseline), damit ein Aufrufer weitere Inhalte nahtlos anschließen kann.
- Rein additiv: ohne die neuen Felder ist die Ausgabe byte-identisch zu 0.10.1; `renderPdf` ignoriert die neuen Felder unverändert.

Consumer: **`obsidian-letterhead`** (Brief-Body eingebettet in eine Seite mit vorhandenem Kopf).

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
