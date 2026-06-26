import { describe, it, expect } from "vitest";
import { createObsidianMock, Setting, Notice, TFile } from "../src/testing/obsidian-mock";

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
