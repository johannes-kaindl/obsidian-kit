import { describe, it, expect } from "vitest";
import { createObsidianMock, Setting, Notice, TFile, Modal, makeFakeEl } from "../src/testing/obsidian-mock";

describe("createObsidianMock", () => {
  it("liefert die Basis-Stubs", () => {
    const m = createObsidianMock();
    expect(typeof m.Notice).toBe("function");
    expect(typeof m.Plugin).toBe("function");
    expect(typeof m.Setting).toBe("function");
    expect(typeof m.setIcon).toBe("function");
  });
  it("erlaubt Override eigener Stubs (json_viewer happy-dom-Fall)", () => {
    const fakeEl = () => ({ custom: true });
    const m = createObsidianMock({ makeFakeEl: fakeEl as never });
    expect(m.makeFakeEl).toBe(fakeEl);
  });
  it("ein Setting-Builder ist chainbar (setName gibt sich selbst zurück)", () => {
    const containerEl = { createDiv: () => ({}) };
    const s = new Setting(containerEl);
    expect(s.setName("x")).toBe(s);
    expect(s.setDesc("y")).toBe(s);
  });
  it("Setting.addText ruft den Callback mit chainbarer Komponente", () => {
    let received: { setValue(v: string): unknown } | null = null;
    const s = new Setting({ createDiv: () => ({}) });
    s.addText((c) => { received = c; c.setValue("hi"); });
    expect(received).not.toBeNull();
    expect(s.components.length).toBe(1);
  });
  it("named export Notice akkumuliert Instanzen", () => {
    Notice.instances.length = 0;
    new Notice("hello");
    expect(Notice.instances.length).toBe(1);
    expect(Notice.instances[0].message).toBe("hello");
  });
  it("TFile leitet basename/extension aus dem Pfad ab", () => {
    const f = new TFile("notes/foo.md");
    expect(f.basename).toBe("foo");
    expect(f.extension).toBe("md");
    expect(f.name).toBe("foo.md");
  });
});

describe("Mock-Erweiterung für Modal-Tests (confirm)", () => {
  it("ButtonComponent zeichnet Text, CTA und Warning auf", () => {
    const s = new Setting(makeFakeEl());
    s.addButton((b) => b.setButtonText("Löschen").setWarning());
    s.addButton((b) => b.setButtonText("OK").setCta());
    expect(s.components[0].textValue).toBe("Löschen");
    expect(s.components[0].warningSet).toBe(true);
    expect(s.components[0].ctaSet).toBe(false);
    expect(s.components[1].ctaSet).toBe(true);
  });
  it("Setting.__last zeigt auf die zuletzt erzeugte Instanz", () => {
    const s = new Setting(makeFakeEl());
    expect(Setting.__last).toBe(s);
  });
  it("Modal.open()/close() rufen onOpen()/onClose(); __last zeigt auf die Instanz", () => {
    const calls: string[] = [];
    class M extends Modal {
      onOpen(): void { calls.push("open"); }
      onClose(): void { calls.push("close"); }
    }
    const m = new M({});
    expect(Modal.__last).toBe(m);
    m.open(); m.close();
    expect(calls).toEqual(["open", "close"]);
  });
});

describe("Mock-Erweiterung für die Endpunkt-Liste (controlEl + querySelectorAll)", () => {
  it("Setting.controlEl haengt unter settingEl und traegt die add*-Komponenten", () => {
    const s = new Setting(makeFakeEl());
    expect(s.settingEl.children).toContain(s.controlEl);
    expect(s.controlEl.hasClass("setting-item-control")).toBe(true);
    s.addText((t) => t.setValue("hi"));
    expect(s.controlEl.children).toContain(s.components[0].inputEl);
    expect(s.settingEl.children).not.toContain(s.components[0].inputEl);
  });
  it("controlEl nimmt Zusatz-DOM neben den Komponenten auf", () => {
    const s = new Setting(makeFakeEl());
    const icon = s.controlEl.createSpan({ cls: "okit-ep-status" });
    s.addText((t) => t.setValue("x"));
    expect(s.controlEl.children).toEqual([icon, s.components[0].inputEl]);
  });
  it("querySelectorAll findet Nachfahren ueber kommagetrennte Tag-Selektoren", () => {
    const root = makeFakeEl();
    const wrap = root.createDiv();
    const input = wrap.createEl("input");
    const button = root.createEl("button");
    root.createEl("span");
    // Dokument-Reihenfolge (Pre-Order): das verschachtelte input steht vor dem button.
    expect(root.querySelectorAll("input, button, select")).toEqual([input, button]);
  });
  it("querySelectorAll versteht einfache Klassenselektoren", () => {
    const root = makeFakeEl();
    const hit = root.createDiv({ cls: "okit-ep-row" });
    hit.createDiv({ cls: "andere" });
    const nested = hit.createDiv({ cls: "okit-ep-row tief" });
    expect(root.querySelectorAll(".okit-ep-row")).toEqual([hit, nested]);
    expect(root.querySelectorAll(".gibts-nicht")).toEqual([]);
  });
  it("querySelectorAll liefert bei leerem Selektor nichts und wirft nicht", () => {
    const root = makeFakeEl();
    root.createEl("input");
    expect(root.querySelectorAll("")).toEqual([]);
  });
});

describe("Mock-Ehrlichkeit: Tag-Namen, Tooltips, remove()", () => {
  it("Komponenten-Elemente tragen ihren echten Tag-Namen", () => {
    const s = new Setting(makeFakeEl());
    s.addText((t) => t.setValue("a"));
    s.addTextArea((t) => t.setValue("b"));
    s.addDropdown((d) => d.addOption("x", "x"));
    s.addSlider((sl) => sl.setValue(1));
    s.addButton((b) => b.setButtonText("go"));
    s.addExtraButton((b) => b.setIcon("trash-2"));
    expect(s.components.map((c: { inputEl?: { tagName: string }; selectEl?: { tagName: string };
      sliderEl?: { tagName: string }; buttonEl?: { tagName: string };
      extraSettingsEl?: { tagName: string } }) =>
      (c.inputEl ?? c.selectEl ?? c.sliderEl ?? c.buttonEl ?? c.extraSettingsEl)?.tagName,
    )).toEqual(["INPUT", "TEXTAREA", "SELECT", "INPUT", "BUTTON", "DIV"]);
  });

  it("querySelectorAll findet die add*-Komponenten einer Setting-Zeile", () => {
    const root = makeFakeEl();
    const s = new Setting(root);
    s.addText((t) => t.setValue("a"));
    s.addDropdown((d) => d.addOption("x", "x"));
    s.addButton((b) => b.setButtonText("go"));
    // Genau der Selektor, mit dem die Endpunkt-Liste ihre Zeilen sperrt.
    const found = root.querySelectorAll("input, button, select");
    expect(found.length).toBe(3);
    found.forEach((el: { disabled?: boolean }) => { el.disabled = true; });
    expect(s.components.map((c: { inputEl?: { disabled?: boolean }; selectEl?: { disabled?: boolean };
      buttonEl?: { disabled?: boolean } }) =>
      (c.inputEl ?? c.selectEl ?? c.buttonEl)?.disabled,
    )).toEqual([true, true, true]);
  });

  it("Button-/ExtraButton-Tooltip und ExtraButton-Icon werden aufgezeichnet", () => {
    const s = new Setting(makeFakeEl());
    s.addButton((b) => b.setButtonText("go").setTooltip("Knopf-Hinweis"));
    s.addExtraButton((b) => b.setIcon("refresh-cw").setTooltip("Modelle abrufen"));
    expect(s.components[0].tooltip).toBe("Knopf-Hinweis");
    expect(s.components[1].iconName).toBe("refresh-cw");
    expect(s.components[1].tooltip).toBe("Modelle abrufen");
  });

  it("remove() haengt den Knoten beim Elternknoten aus", () => {
    const root = makeFakeEl();
    const a = root.createSpan({ cls: "a" });
    const b = root.createSpan({ cls: "b" });
    expect(a.parentElement).toBe(root);
    a.remove();
    expect(root.children).toEqual([b]);
    expect(a.parentElement).toBeNull();
    // Zweites remove() ist folgenlos, nicht fatal.
    a.remove();
    expect(root.children).toEqual([b]);
  });

  it("appendChild haengt an, verschiebt aber NICHT (dokumentierte Abweichung vom echten DOM)", () => {
    const from = makeFakeEl();
    const to = makeFakeEl();
    const node = from.createSpan();
    to.appendChild(node);
    // Im echten DOM waere `from` jetzt leer. Deshalb ist eine Test-Aussage ueber die
    // Reihenfolge der Kinder nur dort belastbar, wo nichts umgehaengt wurde.
    expect(from.children).toEqual([node]);
    expect(to.children).toEqual([node]);
  });
});
