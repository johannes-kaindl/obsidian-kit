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
