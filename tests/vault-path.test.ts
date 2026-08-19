import { describe, it, expect } from "vitest";
import { joinVaultPath, normalizeVaultDir, vaultDirname } from "../src/pure/vault-path";

// Vereinigung der Testmengen der fünf Quell-Repos:
//   apple-health/tests/core/export-path.test.ts     (3 joinPath-Fälle)
//   audio-interface/tests/core/file-naming.test.ts  (3 joinVaultPath-Fälle)
//   epub-exporter/tests/core/output-path.test.ts    (Wurzel-Fall über resolveOutputPath)
//   obsidian-paperize/tests/obsidian/output.test.ts (Wurzel-Fall über resolveOutputPath)
//   obsidian-letterhead/tests/obsidian/output-target.test.ts
//     (trailing-slash-Fall, leerer customFolder, und die writePdf-Wurzel-Regression,
//      die hier als vaultDirname-Fall wieder auftaucht)
// Dazu die Fälle, die die Parametrisierung neu einführt (null/undefined, Backslash,
// interner Mehrfach-Slash) und je ein Regressionstest für die zwei gemessenen Defekte.

describe("normalizeVaultDir", () => {
  it("lässt einen sauberen Ordner unverändert", () => {
    expect(normalizeVaultDir("30_Health")).toBe("30_Health");
    expect(normalizeVaultDir("Audio/Sub")).toBe("Audio/Sub");
  });

  it("leerer Ordner ist die Vault-Wurzel", () => {
    expect(normalizeVaultDir("")).toBe("");
  });

  it("nimmt null und undefined entgegen — vier der fünf Vorlagen trugen den (dir || '')-Guard", () => {
    expect(normalizeVaultDir(null)).toBe("");
    expect(normalizeVaultDir(undefined)).toBe("");
  });

  it("räumt führende und schließende Slashes weg", () => {
    expect(normalizeVaultDir("/30_Health/")).toBe("30_Health");
    expect(normalizeVaultDir("Export/PDF/")).toBe("Export/PDF");
    expect(normalizeVaultDir("/Export/PDF")).toBe("Export/PDF");
  });

  it("eine reine Slash-Folge ist die Wurzel, kein Ordner", () => {
    // letterhead reicht normalizePath('') = '/' durch (obsidian/main.ts:463);
    // Obsidians normalizePath liefert für die Wurzel '/', hier ist sie ''.
    expect(normalizeVaultDir("/")).toBe("");
    expect(normalizeVaultDir("///")).toBe("");
  });

  it("kollabiert interne Mehrfach-Slashes (Erweiterung gegenüber allen fünf Vorlagen)", () => {
    expect(normalizeVaultDir("Export//PDF")).toBe("Export/PDF");
    expect(normalizeVaultDir("//Export///PDF//")).toBe("Export/PDF");
  });

  it("wandelt Backslashes zu Slashes (wie Obsidians normalizePath)", () => {
    expect(normalizeVaultDir("Export\\PDF")).toBe("Export/PDF");
    expect(normalizeVaultDir("\\Export\\PDF\\")).toBe("Export/PDF");
  });

  it("normalisiert NICHT nach NFC und tastet NBSP nicht an — Pfade bestehender Vaults bleiben gleich", () => {
    // Obsidians normalizePath macht beides; hier bewusst ausgelassen, weil es Ordnernamen
    // bestehender Vaults still verändern würde (und dieses Modul nur Slashes verantwortet).
    expect(normalizeVaultDir("Ordner\u00A0mit")).toBe("Ordner\u00A0mit");
    expect(normalizeVaultDir("Cafe\u0301")).toBe("Cafe\u0301");
    expect(normalizeVaultDir("Cafe\u0301")).not.toBe("Caf\u00E9");
  });
});

describe("joinVaultPath", () => {
  it("fügt Ordner und Datei zusammen", () => {
    // apple-health/tests/core/export-path.test.ts
    expect(joinVaultPath("30_Health", "a.md")).toBe("30_Health/a.md");
    // audio-interface/tests/core/file-naming.test.ts
    expect(joinVaultPath("Audio/Sub", "x.wav")).toBe("Audio/Sub/x.wav");
  });

  it("leerer Ordner bedeutet Vault-Wurzel — kein führender Slash", () => {
    // paperize 'handles a note in the vault root', epub 'beside the note at vault root',
    // letterhead 'falls back to the vault root when customFolder is empty'
    expect(joinVaultPath("", "a.md")).toBe("a.md");
    expect(joinVaultPath("/", "Muster GmbH.pdf")).toBe("Muster GmbH.pdf");
    expect(joinVaultPath(null, "a.md")).toBe("a.md");
    expect(joinVaultPath(undefined, "a.md")).toBe("a.md");
  });

  it("toleriert einen Ordner mit schließendem Slash", () => {
    // letterhead 'tolerates a custom folder with a trailing slash'
    expect(joinVaultPath("Export/PDF/", "Brief.pdf")).toBe("Export/PDF/Brief.pdf");
  });

  it("räumt führende und schließende Slashes weg", () => {
    // apple-health + audio-interface pinnen beide die volle Semantik
    expect(joinVaultPath("/30_Health/", "a.md")).toBe("30_Health/a.md");
    expect(joinVaultPath("/Audio/", "x.wav")).toBe("Audio/x.wav");
  });

  it("Regression: ein führender Slash aus einem Freitextfeld überlebt NICHT", () => {
    // letterheads Fassung (nur /\/+$/) lieferte hier '/Export/Briefe/Brief.pdf' — ein Pfad,
    // den adapter.exists/mkdir laut obsidian.d.ts nicht bekommen darf. paperize (main.ts:135),
    // epub (main.ts:139), apple-health (tabs/detail.ts:148) und audio-interface
    // (exporter.ts:90) reichen ihr Freitextfeld roh hierher.
    expect(joinVaultPath("/Export/Briefe", "Brief.pdf")).toBe("Export/Briefe/Brief.pdf");
  });

  it("reicht den Dateinamen unverändert durch — auch mit Punkten, Leerzeichen, Umlauten", () => {
    expect(joinVaultPath("Briefe/2026", "2026-06-09 Mustermann GmbH.pdf"))
      .toBe("Briefe/2026/2026-06-09 Mustermann GmbH.pdf");
    expect(joinVaultPath("Anhänge", "9.6.2026 Muster.pdf")).toBe("Anhänge/9.6.2026 Muster.pdf");
    // Der Dateiname wird NICHT gesäubert und NICHT normalisiert: das ist Sache des
    // Aufrufers (sanitizeBase/sanitizeFilename), nicht dieses Moduls.
    expect(joinVaultPath("Export", "Kapitel #3.epub")).toBe("Export/Kapitel #3.epub");
  });

  it("mehrsegmentige Dateinamen bleiben mehrsegmentig", () => {
    expect(joinVaultPath("Export", "sub/x.pdf")).toBe("Export/sub/x.pdf");
  });
});

describe("vaultDirname", () => {
  it("liefert den Elternordner eines verschachtelten Pfads", () => {
    expect(vaultDirname("Export/PDF/Brief.pdf")).toBe("Export/PDF");
    expect(vaultDirname("a/b/c/d.md")).toBe("a/b/c");
  });

  it("Regression: eine Datei in der Wurzel hat KEINEN Ordner, nicht einen um ein Zeichen gekürzten", () => {
    // slice(0, lastIndexOf('/')) ergäbe bei -1 'Muster GmbH.pd' und legte neben jedem
    // Export einen Phantom-Ordner an. Von einem echten Gerät gemeldet (letterhead,
    // 2026-07-24); die drei anderen Repos trafen den Fall nur zufällig nicht.
    expect(vaultDirname("Muster GmbH.pdf")).toBe("");
    expect(vaultDirname("Muster GmbH.pdf")).not.toBe("Muster GmbH.pd");
  });

  it("ein einzelner führender Slash ergibt die Wurzel, keinen leeren Ordnernamen", () => {
    expect(vaultDirname("/x.pdf")).toBe("");
  });

  it("leerer Pfad ergibt leeren Ordner", () => {
    expect(vaultDirname("")).toBe("");
  });

  it("ist die Umkehrung von joinVaultPath", () => {
    for (const dir of ["", "/", "Export", "/Export/PDF/", "Export\\PDF"]) {
      expect(vaultDirname(joinVaultPath(dir, "Brief.pdf"))).toBe(normalizeVaultDir(dir));
    }
  });
});
