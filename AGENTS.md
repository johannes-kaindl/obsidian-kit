# AGENTS

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `/Users/Shared/code/obsidian-plugins/`.
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
Dual-Forge-Push (Codeberg kanonisch + GitHub-Mirror). Version = `KIT_VERSION`-Konstante
(`src/pure/index.ts`) + git-Tag; jeder Tag bekommt einen `CHANGELOG.md`-Eintrag.
