import { describe, it, expect } from "vitest";
import { makeFakeEl } from "../src/testing/obsidian-mock";
import { resolveCollapsed, collapsibleSection, COLLAPSIBLE_CSS } from "../src/obsidian/collapsible";

// makeFakeEl() gibt bewusst `any` zurück (src/testing/** ist von den type-checked-Regeln
// befreit, siehe dortiger Kommentar). tests/** ist es nicht — dieses Interface macht die
// im Test genutzte Teilmenge (children/textContent/hasClass/dispatchEvent) type-safe, ohne
// echtes DOM/happy-dom einzuführen. Der Cast auf HTMLElement an der collapsibleSection-Grenze
// ist absichtlich `unknown`-vermittelt (kein `any`), weil der Fake strukturell kein echtes
// HTMLElement ist (nur die von collapsibleSection genutzten Obsidian-Methoden).
interface FakeElement {
  children: FakeElement[];
  textContent: string;
  hasClass(cls: string): boolean;
  dispatchEvent(evt: { type: string }): boolean;
}

function fakeContainer(): FakeElement {
  return makeFakeEl() as FakeElement;
}

describe("resolveCollapsed", () => {
  it("nutzt storage-Wert wenn key + storage vorhanden", () => {
    const storage = { getCollapsed: () => false, setCollapsed: () => {} };
    expect(resolveCollapsed("sec", true, storage)).toBe(false);
  });
  it("fällt auf defaultCollapsed zurück ohne storage", () => {
    expect(resolveCollapsed("sec", true, undefined)).toBe(true);
  });
  it("fällt auf defaultCollapsed zurück ohne key", () => {
    const storage = { getCollapsed: () => false, setCollapsed: () => {} };
    expect(resolveCollapsed(undefined, true, storage)).toBe(true);
  });
  it("fällt auf defaultCollapsed zurück wenn kein Wert gespeichert (getCollapsed → undefined)", () => {
    const storage = { getCollapsed: (): boolean | undefined => undefined, setCollapsed: () => {} };
    expect(resolveCollapsed("sec", false, storage)).toBe(false);
    expect(resolveCollapsed("sec", true, storage)).toBe(true);
  });
});

describe("collapsibleSection", () => {
  it("gibt einen Body-Container zurück und rendert einen Header mit Titel", () => {
    const c = fakeContainer();
    const body = collapsibleSection(c as unknown as HTMLElement, { title: "Chat" });
    expect(body).toBeTruthy();
    expect(c.textContent).toContain("Chat");
  });
  it("startet standardmäßig eingeklappt (Body is-collapsed, Chevron chevron-right)", () => {
    const c = fakeContainer();
    const body = collapsibleSection(c as unknown as HTMLElement, { title: "Chat" });
    expect(body.hasClass("is-collapsed")).toBe(true);
  });
  it("Klick auf den Header toggelt auf und ruft storage.setCollapsed", () => {
    const c = fakeContainer();
    const calls: Array<[string, boolean]> = [];
    const storage = { getCollapsed: () => true, setCollapsed: (k: string, v: boolean) => calls.push([k, v]) };
    const body = collapsibleSection(c as unknown as HTMLElement, { title: "Chat", key: "chat", storage });
    // makeFakeEl hat kein querySelector — Traversal über .children:
    // c.children[0] = section, section.children[0] = header (erstes createDiv-Kind).
    const section = c.children[0];
    const headerEl = section.children[0];
    headerEl.dispatchEvent({ type: "click" });
    expect(calls).toEqual([["chat", false]]);
    expect(body.hasClass("is-collapsed")).toBe(false);
  });
  it("respektiert initialen storage-Zustand (nicht eingeklappt)", () => {
    const c = fakeContainer();
    const storage = { getCollapsed: () => false, setCollapsed: () => {} };
    const body = collapsibleSection(c as unknown as HTMLElement, { title: "Chat", key: "chat", storage });
    expect(body.hasClass("is-collapsed")).toBe(false);
  });
});

describe("COLLAPSIBLE_CSS", () => {
  it("ist ein nicht-leeres CSS-Snippet mit der Body-Hide-Regel", () => {
    expect(COLLAPSIBLE_CSS).toContain(".okit-collapsible-body.is-collapsed");
    expect(COLLAPSIBLE_CSS).toContain("display: none");
  });
});
