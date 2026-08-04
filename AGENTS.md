# AGENTS

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../../_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `obsidian-plugins/` (das Verzeichnis direkt über dem Repo-Root, `../`).
**Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und `../REGISTRY.md`
(Lösungs-Registry) prüfen — viele Probleme sind in Nachbar-Plugins oder im
`obsidian-kit` bereits gelöst.

**Vor jeder UI-Arbeit** (Views, Modals, Settings-Tabs, CSS): `../UI-STANDARD.md` ist
verbindlich (Obsidian-nativ first, ein Frontend pro Plugin, nur Theme-CSS-Variablen).

## Kit-Distribution & Release (Policy)

**Vendoring, kein Tag-Pinning (lazy).** Consumer tragen Kit-Module als lokale Kopie unter
`src/vendor/kit/<modul>.ts` mit Herkunfts-Header (`// vendored from obsidian-kit#<tag>`).
Kein Repo konsumiert das Kit als git-Dependency. Die vendored Tags sind **bewusst per Modul
gestaffelt** — ein neuerer Kit-Tag ist **keine Drift**, Re-Vendoring nur bei Bedarf. SSOT des
Adoptions-Stands ist die generierte `../KIT-MATRIX.md` (Regeneration via `drift-audit`-Skill).
Es gibt daher **kein „Consumer auf den neuesten Tag nachziehen"** — Staffelung ist der
Normalzustand.

**Release = Tag-only (bewusste Abweichung von PROF-OBS-09).** Das Kit ist eine Source-Library
**ohne Build-Artefakt** (kein `main.js`, kein npm-Publish) — der unified `npm run release`-Flow
der Plugins greift hier strukturell nicht. Verteilung: SemVer-Tag **ohne `v`-Präfix** + manueller
Dual-Forge-Push (Forgejo kanonisch + GitHub-Mirror). Version = `KIT_VERSION`-Konstante
(`src/pure/index.ts`) + git-Tag; jeder Tag bekommt einen `CHANGELOG.md`-Eintrag.

**Den Tag explizit pushen — `--follow-tags` trägt hier nicht.** Die Kit-Tags sind
**leichtgewichtig** (`git tag <version>`, prüfbar mit `git cat-file -t 0.20.0` → `commit`),
und `--follow-tags` überträgt ausschließlich *annotated* Tags. Der Branch geht dann durch,
der Tag bleibt still liegen — passiert beim 0.21.0-Release am 2026-08-04. Also:

```bash
git push origin main && git push origin <version>
git push github main && git push github <version>
git ls-remote --tags origin <version>   # gegen die echte Gegenstelle verifizieren
```

Die Plugin-Repos sind davon **nicht** betroffen: deren `release.mjs` legt mit `git tag -a`
annotierte Tags an, dort ist `--follow-tags` korrekt.

`KIT_VERSION` ist seit 0.21.0 per Test gegen `package.json` verriegelt
(`tests/kit-version.test.ts`) — die Konstante war zuvor **zweimal in Folge** beim
Release-Bump vergessen worden (0.18.0 und 0.20.0).

## Memory

- **SDD-Artefakte (seit 2026-07-16): Cockpit, nicht Repo** — Specs/Plans/Task-Reports leben im
  Coding-Cockpit des Maintainers (`$VAULT/25_Coding/obsidian-kit/_SDD/`, CORE-META-14, maintainer-lokal).
  Sie tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in einem public Repo niemandem nützt.
  Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
- **Alt-Bestand:** `docs/superpowers/{specs,plans}/` ist eingefroren — nichts Neues dort ablegen.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`, `~/…`, repo-relativ). Herkunftsnachweise als Repo-Name + `Datei:Zeile` sind dagegen erwünscht.
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).
