import { describe, it, expect } from "vitest";
import { makeFakeApp, Modal, ButtonComponent } from "../src/testing/obsidian-mock";
import { confirmAction } from "../src/obsidian/confirm";
import type { ConfirmOptions } from "../src/obsidian/confirm";

// confirmAction erzeugt sein Modal intern — Modal.__last ist der Zugriffsweg,
// analog FuzzySuggestModal.__instance. Die Buttons liegen in einem
// modal-button-container-Div in contentEl; [0]=Cancel, [1]=Confirm (UI-STANDARD §2).
function openConfirm(opts: ConfirmOptions): { p: Promise<boolean>; modal: any; confirm: any; cancel: any } {
  const p = confirmAction(makeFakeApp() as never, opts);
  const modal: any = Modal.__last;
  const container = modal.contentEl.children.find((c: any) => c.className === "modal-button-container");
  expect(container).toBeTruthy();
  const [cancel, confirm] = container.children.map((c: any) => c.__component);
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

  // Der openConfirm-Helper liefert das Modal-Innere untypisiert (any) — für die Button-
  // Assertions auf den Mock-Typ zurückholen statt unsafe-member-access zu erzeugen.
  const btn = (c: unknown): ButtonComponent => c as ButtonComponent;
  const classNameOf = (b: ButtonComponent): string => (b.buttonEl as { className: string }).className;

  it("warning defaultet auf destruktiv; warning:false nutzt setCta", () => {
    const { confirm } = openConfirm({ message: "m" });
    expect(btn(confirm).destructiveSet).toBe(true);
    expect(btn(confirm).ctaSet).toBe(false);
    const { confirm: c2 } = openConfirm({ message: "m", warning: false });
    expect(btn(c2).ctaSet).toBe(true);
    expect(btn(c2).destructiveSet).toBe(false);
  });

  // setWarning() ist ab Obsidian 1.13 deprecated, setDestructive() gibt es erst ab 1.13 —
  // Konsumenten mit kleinerer minAppVersion brauchen deshalb einen Laufzeit-Check statt
  // eines harten Aufrufs (Muster: vault-rag/src/settings.ts → applyDestructive).
  it("nutzt setDestructive, wenn die API vorhanden ist (Obsidian >= 1.13)", () => {
    const { confirm } = openConfirm({ message: "m" });
    expect(btn(confirm).destructiveSet).toBe(true);
    expect(btn(confirm).warningSet).toBe(false);
  });

  it("faellt auf die mod-warning-Klasse zurueck, wenn setDestructive fehlt (< 1.13)", () => {
    const proto = ButtonComponent.prototype as unknown as Record<string, unknown>;
    const orig = proto.setDestructive;
    delete proto.setDestructive;
    try {
      const { confirm } = openConfirm({ message: "m" });
      expect(btn(confirm).destructiveSet).toBe(false);
      expect(classNameOf(btn(confirm))).toContain("mod-warning");
    } finally {
      proto.setDestructive = orig;
    }
  });
});
