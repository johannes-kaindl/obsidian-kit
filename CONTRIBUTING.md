# Contributing — ein neues Modul hinzufügen

Das Kit wächst **inkrementell** und nur gegen belegte Redundanz. Bevor du ein Modul aufnimmst, durchlaufe dieses Gate — es hält das Kit klein, rein und anschlussfähig.

## 1. Regel-der-Drei-Gate (gegen den echten Code verifizieren)

- Existiert das Modul in **≥2 Plugins** als echte Duplikation (nicht nur „present" oder ein geteiltes Konzept)?
- `diff`/`grep` über die Kandidaten-Dateien: ist es **byte-identisch / leicht-divergent** (→ extrahierbar) oder haben die Impls **disjunkte APIs** (→ nur eine Regel, kein Modul — wie `http`)?
- Divergiert ein Teil **korrekt** (z. B. Transport fetch vs. XHR)? Dann nur den **reinen Kern** ziehen, den variablen Teil lokal lassen (wie `parseSSE` vs. `streamSSE`).

Wenn das Gate nicht klar erfüllt ist: **nicht** aufnehmen. Plausible-aber-falsche Kandidaten (dom-safe, settings-ui) haben das Kit schon einmal fast verschmutzt — siehe Spec §2.

## 2. Schicht wählen

- **`src/pure/`** — kein obsidian-/DOM-Import (Node-testbar, PROF-OBS-03/04). Der eslint-Guard erzwingt das. Default für Logik/Parser/Utils.
- **`src/obsidian/`** — obsidian-gekoppelte Helfer (darf `obsidian` importieren). Nur wenn die Kopplung unvermeidbar ist.
- **`src/testing/`** — Test-Fixtures (das Mock-Double). Von den strengsten type-checked-Regeln befreit.

## 3. Modul + Test schreiben (TDD)

- Test zuerst (`tests/<modul>.test.ts`, vitest, **kein** `.only`/`.skip`).
- Bei byte-identischer Übernahme: die bestehende Test-Suite **mitnehmen** (nur Import-Pfad ändern).
- TSDoc am Source: **Vertrag** (Signatur) · **Reinheits-Garantie** · ggf. **kodifizierte Konvention** (`implementiert PROF-OBS-XX`) · ein **`@example`** · ggf. **Migrations-Note**.

## 4. Verdrahten

- Export in das passende Barrel (`src/pure/index.ts`) bzw. die `exports`-Map in `package.json` ergänzen.
- `npm run typecheck && npm run lint && npm test` → grün.

## 5. Dokumentieren (Doku driftet nicht)

- **`CHANGELOG.md`**: Eintrag unter der nächsten Version.
- **`README.md`** Modul-Tabelle ergänzen.
- **`MIGRATION.md`**: ein Rezept „lokale Kopie → Kit-Import".
- Jedes `@example` im TSDoc muss als Testfall gespiegelt sein (gleiche Eingabe → gleiche dokumentierte Ausgabe). Das Anti-Drift-Werkzeug darf nicht selbst driften.

## 6. Release

- SemVer-Tag ohne v-Präfix; dual-forge im Lockstep pushen (Codeberg + GitHub, identische SHA).
- Migrierte Plugins ziehen den neuen Pin bei Gelegenheit nach.
