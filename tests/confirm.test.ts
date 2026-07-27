import { describe, it, expect } from "vitest";
import { makeFakeApp, Setting, Modal } from "../src/testing/obsidian-mock";
import { confirmAction } from "../src/obsidian/confirm";
import type { ConfirmOptions } from "../src/obsidian/confirm";

// confirmAction erzeugt sein Modal intern — die Mock-Handles (Modal.__last,
// Setting.__last) sind der Zugriffsweg, analog FuzzySuggestModal.__instance.
function openConfirm(opts: ConfirmOptions): { p: Promise<boolean>; modal: any; confirm: any; cancel: any } {
  const p = confirmAction(makeFakeApp() as never, opts);
  const modal: any = Modal.__last;
  const [confirm, cancel] = (Setting.__last as any).components;
  return { p, modal, confirm, cancel };
}

describe("confirmAction", () => {
  it("resolved true bei Confirm-Klick", async () => {
    const { p, confirm } = openConfirm({ message: "Wirklich?" });
    confirm.clickCB();
    await expect(p).resolves.toBe(true);
  });

  it("resolved false bei Cancel-Klick", async () => {
    const { p, cancel } = openConfirm({ message: "Wirklich?" });
    cancel.clickCB();
    await expect(p).resolves.toBe(false);
  });

  it("resolved false bei bloßem Schließen (Esc/Klick daneben)", async () => {
    const { p, modal } = openConfirm({ message: "Wirklich?" });
    modal.close();
    await expect(p).resolves.toBe(false);
  });

  it("löst genau einmal auf: Klick + nachlaufendes onClose ändern nichts (finish-Guard)", async () => {
    const { p, modal, confirm } = openConfirm({ message: "Wirklich?" });
    confirm.clickCB();       // finish(true) → close() → onClose() → finish(false) muss am Guard abprallen
    modal.onClose();         // zusätzliches nachlaufendes onClose (wie im echten Close-Ablauf)
    await expect(p).resolves.toBe(true);
  });

  it("rendert title in titleEl nur wenn gesetzt", () => {
    const { modal } = openConfirm({ title: "Löschen?", message: "m" });
    expect(modal.titleEl.textContent).toBe("Löschen?");
    const { modal: m2 } = openConfirm({ message: "m" });
    expect(m2.titleEl.textContent).toBe("");
  });

  it("rendert message-Array als einen <p> pro Zeile", () => {
    const { modal } = openConfirm({ message: ["Zeile 1", "Zeile 2"] });
    const ps = modal.contentEl.children.filter((c: any) => c.tagName === "P");
    expect(ps.map((c: any) => c.textContent)).toEqual(["Zeile 1", "Zeile 2"]);
  });

  it("Label-Defaults sind Confirm/Cancel, injizierte Labels gewinnen", () => {
    const { confirm, cancel } = openConfirm({ message: "m" });
    expect(confirm.textValue).toBe("Confirm");
    expect(cancel.textValue).toBe("Cancel");
    const { confirm: c2, cancel: k2 } = openConfirm({ message: "m", confirmLabel: "Löschen", cancelLabel: "Abbrechen" });
    expect(c2.textValue).toBe("Löschen");
    expect(k2.textValue).toBe("Abbrechen");
  });

  it("warning defaultet auf setWarning; warning:false nutzt setCta", () => {
    const { confirm } = openConfirm({ message: "m" });
    expect(confirm.warningSet).toBe(true);
    expect(confirm.ctaSet).toBe(false);
    const { confirm: c2 } = openConfirm({ message: "m", warning: false });
    expect(c2.ctaSet).toBe(true);
    expect(c2.warningSet).toBe(false);
  });
});
