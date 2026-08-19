import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice } from "../src/testing/obsidian-mock";
import { copyToClipboard } from "../src/obsidian/clipboard";

// Getestet wird NUR die Notice-Bindung — der Kopiervorgang selbst haengt in
// tests/clipboard.test.ts (pure/clipboard). Die Faelle kommen aus den 13 gemessenen
// Aufrufstellen: Notice bei Erfolg (4x), Quittung am Knopf statt Notice (apple-health,
// json_viewer), gar keine Rueckmeldung (markdown-presentation), Fehlermeldung aus dem Fehler
// gebaut (obsidian-transmute), Fehlschlag ohne Notice (kuro-gamification 3x).
// Der Kern ist die erste Gruppe: die Erfolgs-Notice darf nicht luegen.

/** Ruft `call` und weist nach, dass dabei synchron nichts fliegt. Gibt das Promise weiter. */
function noThrow(call: () => Promise<boolean>): Promise<boolean> {
  let result!: Promise<boolean>;
  expect(() => { result = call(); }).not.toThrow();
  return result;
}

/** Alle bisher gezeigten Notice-Texte, in Reihenfolge. */
function notices(): unknown[] {
  return Notice.instances.map((n) => n.message);
}

function stubOk(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  return writeText;
}

function stubRejecting(err: unknown): void {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(err) } });
}

/** Keine Clipboard-API — der Pfad, den `writeClipboard` SYNCHRON meldet. */
function stubMissing(): void {
  vi.stubGlobal("navigator", {});
}

beforeEach(() => { Notice.instances.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("copyToClipboard — die Erfolgs-Notice darf nicht luegen", () => {
  it("zeigt copiedMessage erst NACH erfolgreichem Schreiben", async () => {
    const writeText = stubOk();

    const pending = copyToClipboard("cmd", { copiedMessage: "Kopiert" });
    // Der gemessene Bug der vier Inline-Stellen ist genau diese Zeile: dort steht die Notice
    // unmittelbar hinter `void writeText(...)`, also schon jetzt.
    expect(notices()).toEqual([]);

    await expect(pending).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("cmd");
    expect(notices()).toEqual(["Kopiert"]);
  });

  it("zeigt bei abgelehntem writeText die FEHLER-Notice, nie die Erfolgs-Notice", async () => {
    stubRejecting(new Error("Document is not focused"));

    await expect(copyToClipboard("cmd", { copiedMessage: "Kopiert" })).resolves.toBe(false);
    expect(notices()).toEqual(["Copy failed"]);
  });

  it("zeigt bei fehlender Clipboard-API keine Erfolgs-Notice", async () => {
    stubMissing();

    await expect(noThrow(() => copyToClipboard("cmd", { copiedMessage: "Kopiert" }))).resolves.toBe(false);
    expect(notices()).toEqual(["Copy failed"]);
  });

  it("meldet genau einmal — nie Erfolg und Fehlschlag zusammen", async () => {
    stubOk();

    await copyToClipboard("x", { copiedMessage: "Kopiert", failedMessage: "Fehlgeschlagen" });
    expect(notices()).toEqual(["Kopiert"]);
  });
});

describe("copyToClipboard — Erfolgs-Quittung", () => {
  it("ohne copiedMessage bleibt der Erfolg still (Quittung am Knopf)", async () => {
    stubOk();
    const onCopied = vi.fn();

    // apple-health/src/obsidian/tabs/detail.ts:105 und json_viewer/src/obsidian/CopyButton.ts:17
    await expect(copyToClipboard("x", { onCopied })).resolves.toBe(true);
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual([]);
  });

  it("kommt ganz ohne Optionen aus, meldet aber weiterhin den Fehlschlag", async () => {
    stubOk();
    // markdown-presentation/src/settings.ts:304 kopiert einen Theme-Namen ohne Quittung.
    await expect(noThrow(() => copyToClipboard("theme-key"))).resolves.toBe(true);
    expect(notices()).toEqual([]);
  });

  it("zeigt die Notice VOR onCopied — ein werfender Callback verschluckt sie nicht", async () => {
    stubOk();
    const boom = new Error("consumer bug");

    // Consumer-Code wird nicht abgeschirmt (s. Modulkopf Punkt 5): der Wurf propagiert als
    // Rejection. Die Quittung steht da trotzdem schon.
    await expect(copyToClipboard("x", {
      copiedMessage: "Kopiert",
      onCopied: () => { throw boom; },
    })).rejects.toBe(boom);
    expect(notices()).toEqual(["Kopiert"]);
  });
});

describe("copyToClipboard — Fehlschlag-Meldung", () => {
  it("nutzt ohne failedMessage den Kit-Default 'Copy failed'", async () => {
    stubRejecting(new Error("denied"));

    // json_viewer/tests/obsidian/clipboard.test.ts:27 prueft /copy failed/i — bleibt gruen.
    await copyToClipboard("x");
    expect(notices()).toEqual(["Copy failed"]);
    expect(String(notices()[0])).toMatch(/copy failed/i);
  });

  it("nimmt einen fertigen String (i18n bleibt beim Consumer)", async () => {
    stubRejecting(new Error("denied"));

    await copyToClipboard("x", { failedMessage: "Kopieren fehlgeschlagen" });
    expect(notices()).toEqual(["Kopieren fehlgeschlagen"]);
  });

  it("baut den Text auf Wunsch aus Grund und Fehler (obsidian-transmute)", async () => {
    const cause = new Error("Write permission denied");
    stubRejecting(cause);
    const seen: [string, unknown][] = [];

    await copyToClipboard("x", {
      failedMessage: (reason, error) => {
        seen.push([reason, error]);
        return `Fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      },
    });
    expect(seen).toEqual([["denied", cause]]);
    expect(notices()).toEqual(["Fehlgeschlagen: Write permission denied"]);
  });

  it("uebergibt der Message-Funktion auch ohne API einen gesetzten Fehler (nie 'undefined')", async () => {
    stubMissing();
    const seen: [string, unknown][] = [];

    await copyToClipboard("x", {
      failedMessage: (reason, error) => {
        seen.push([reason, error]);
        return `Fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
      },
    });
    expect(seen[0]?.[0]).toBe("unavailable");
    expect(seen[0]?.[1]).toBeInstanceOf(Error);
    expect(String(notices()[0])).not.toMatch(/undefined/);
  });

  it("failedMessage: null unterdrueckt die Notice, onFailed laeuft trotzdem", async () => {
    stubRejecting(new Error("denied"));
    const onFailed = vi.fn();

    // kuro-gamification/src/modals/DataIoModal.ts:29 faellt auf ta.select() zurueck.
    await expect(copyToClipboard("x", { failedMessage: null, onFailed })).resolves.toBe(false);
    expect(notices()).toEqual([]);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0]?.[0]).toBe("denied");
  });

  it("zeigt die Notice VOR onFailed", async () => {
    stubRejecting(new Error("denied"));
    const order: string[] = [];

    await copyToClipboard("x", {
      failedMessage: "Fehlgeschlagen",
      onFailed: () => { order.push(`callback:${String(notices()[0])}`); },
    });
    expect(order).toEqual(["callback:Fehlgeschlagen"]);
  });
});

describe("copyToClipboard — geerbte Zusagen der pure-Schicht", () => {
  it("meldet den unavailable-Pfad SYNCHRON, noch vor der Rueckgabe", async () => {
    // Load-bearing: json_viewer/tests/obsidian/CopyButton.test.ts prueft die Notice
    // unmittelbar nach btn.click(), ohne Microtask-Flush. Diese Schicht darf keinen Tick
    // dazwischenschieben.
    stubMissing();

    const pending = copyToClipboard("x");
    expect(notices()).toEqual(["Copy failed"]);
    await expect(pending).resolves.toBe(false);
  });

  it("wirft nicht, wenn schon der Property-Read wirft — und meldet trotzdem", async () => {
    vi.stubGlobal("navigator", Object.defineProperty({}, "clipboard", {
      configurable: true,
      get(): never { throw new Error("insecure context"); },
    }));

    await expect(noThrow(() => copyToClipboard("x"))).resolves.toBe(false);
    expect(notices()).toEqual(["Copy failed"]);
  });

  it("rejectet nie — `void copyToClipboard(...)` ist an Klick-Handlern sicher", async () => {
    stubRejecting(new Error("nope"));

    const settled = await copyToClipboard("x").then(
      (value) => ({ rejected: false, value }),
      () => ({ rejected: true, value: null }),
    );
    expect(settled).toEqual({ rejected: false, value: false });
  });
});
