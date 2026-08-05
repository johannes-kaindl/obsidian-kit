import { describe, it, expect } from "vitest";
import { makeFakeApp, Modal, ButtonComponent } from "../src/testing/obsidian-mock";
import { confirmAction } from "../src/obsidian/confirm";
import type { ConfirmOptions } from "../src/obsidian/confirm";

// makeFakeEl() liefert ein bewusst lose typisiertes Element-Double; das hier ist der
// Ausschnitt, den dieser Test davon anfasst. Ein vollstaendiger Typ waere erfunden —
// die nachgebildete Runtime-API hat ihn nicht.
interface FakeEl {
  className: string;
  tagName: string;
  textContent: string;
  children: FakeEl[];
  __component?: ButtonComponent;
}
// Bewusst KEINE Intersection mit Modal: dessen contentEl ist `any`, und `any & FakeEl`
// bleibt `any` — die Callback-Parameter unten waeren wieder implizit untypisiert.
interface OpenModal {
  contentEl: FakeEl;
  titleEl: FakeEl;
  close(): void;
  onClose(): void;
}

// Der Klick-Handler ist am Mock nullable. Ein `?.()` wuerde bei fehlendem Handler still
// nichts tun und der Test schluege erst spaeter und unklar fehl.
function click(b: ButtonComponent): void {
  expect(b.clickCB).toBeTruthy();
  b.clickCB?.();
}

// confirmAction erzeugt sein Modal intern — Modal.__last ist der Zugriffsweg,
// analog FuzzySuggestModal.__instance. Die Buttons liegen in einem
// modal-button-container-Div in contentEl; [0]=Cancel, [1]=Confirm (UI-STANDARD §2).
function openConfirm(opts: ConfirmOptions): {
  p: Promise<boolean>;
  modal: OpenModal;
  confirm: ButtonComponent;
  cancel: ButtonComponent;
} {
  const p = confirmAction(makeFakeApp() as never, opts);
  const modal = Modal.__last as unknown as OpenModal;
  const container = modal.contentEl.children.find((c) => c.className === "modal-button-container");
  expect(container).toBeTruthy();
  const [cancel, confirm] = (container as FakeEl).children.map((c) => c.__component as ButtonComponent);
  return { p, modal, confirm, cancel };
}

describe("confirmAction", () => {
  it("resolved true bei Confirm-Klick", async () => {
    const { p, confirm } = openConfirm({ message: "Wirklich?" });
    click(confirm);
    await expect(p).resolves.toBe(true);
  });

  it("resolved false bei Cancel-Klick", async () => {
    const { p, cancel } = openConfirm({ message: "Wirklich?" });
    click(cancel);
    await expect(p).resolves.toBe(false);
  });

  it("resolved false bei bloßem Schließen (Esc/Klick daneben)", async () => {
    const { p, modal } = openConfirm({ message: "Wirklich?" });
    modal.close();
    await expect(p).resolves.toBe(false);
  });

  it("löst genau einmal auf: Klick + nachlaufendes onClose ändern nichts (finish-Guard)", async () => {
    const { p, modal, confirm } = openConfirm({ message: "Wirklich?" });
    click(confirm);       // finish(true) → close() → onClose() → finish(false) muss am Guard abprallen
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
    const ps = modal.contentEl.children.filter((c) => c.tagName === "P");
    expect(ps.map((c) => c.textContent)).toEqual(["Zeile 1", "Zeile 2"]);
  });

  it("Label-Defaults sind Confirm/Cancel, injizierte Labels gewinnen", () => {
    const { confirm, cancel } = openConfirm({ message: "m" });
    expect(confirm.textValue).toBe("Confirm");
    expect(cancel.textValue).toBe("Cancel");
    const { confirm: c2, cancel: k2 } = openConfirm({ message: "m", confirmLabel: "Löschen", cancelLabel: "Abbrechen" });
    expect(c2.textValue).toBe("Löschen");
    expect(k2.textValue).toBe("Abbrechen");
  });

  // buttonEl ist am Mock `any` — fuer die eine Klassen-Assertion unten auf den
  // tatsaechlich genutzten Ausschnitt zurueckholen.
  const classNameOf = (b: ButtonComponent): string => (b.buttonEl as { className: string }).className;

  it("warning defaultet auf destruktiv; warning:false nutzt setCta", () => {
    const { confirm } = openConfirm({ message: "m" });
    expect(confirm.destructiveSet).toBe(true);
    expect(confirm.ctaSet).toBe(false);
    const { confirm: c2 } = openConfirm({ message: "m", warning: false });
    expect(c2.ctaSet).toBe(true);
    expect(c2.destructiveSet).toBe(false);
  });

  // setWarning() ist ab Obsidian 1.13 deprecated, setDestructive() gibt es erst ab 1.13 —
  // Konsumenten mit kleinerer minAppVersion brauchen deshalb einen Laufzeit-Check statt
  // eines harten Aufrufs (Muster: vault-rag/src/settings.ts → applyDestructive).
  it("nutzt setDestructive, wenn die API vorhanden ist (Obsidian >= 1.13)", () => {
    const { confirm } = openConfirm({ message: "m" });
    expect(confirm.destructiveSet).toBe(true);
    expect(confirm.warningSet).toBe(false);
  });

  it("faellt auf die mod-warning-Klasse zurueck, wenn setDestructive fehlt (< 1.13)", () => {
    const proto = ButtonComponent.prototype as unknown as Record<string, unknown>;
    const orig = proto.setDestructive;
    delete proto.setDestructive;
    try {
      const { confirm } = openConfirm({ message: "m" });
      expect(confirm.destructiveSet).toBe(false);
      expect(classNameOf(confirm)).toContain("mod-warning");
    } finally {
      proto.setDestructive = orig;
    }
  });
});
