import { describe, it, expect, vi } from "vitest";
import {
  createObsidianMock,
  Setting,
  App,
  ToggleComponent,
  DropdownComponent,
  SliderComponent,
  TextComponent,
  TextAreaComponent,
} from "../src/testing/obsidian-mock";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "../src/obsidian/settings_walker";

// Fake-DOM-Knoten, wie ihn `makeFakeEl()`/`Setting`/die Komponenten-Konstruktoren
// aufspannen -- lose typisiert (Runtime-API ohne echten DOM-Typ), s. PROF-OBS-08.
interface FakeNode {
  children?: FakeNode[];
  __component?: unknown;
  __setting?: unknown;
}

const mock = createObsidianMock();

// `renderSettingDefinitions` erwartet den echten `obsidian`-App-Typ; das Mock-Double
// bildet dessen Form lose nach (s. `App` in obsidian-mock.ts) -- `as never` ist hier
// die etablierte Kit-Konvention fuer diesen Mock/Real-Typ-Bruch (s. folder-suggest.test.ts).
function fakeApp() {
  return new App() as never;
}

function makeHost(initial: Record<string, unknown>) {
  const values = { ...initial };
  const setCalls: Array<[string, unknown]> = [];
  return {
    values,
    setCalls,
    getControlValue: (key: string) => values[key],
    setControlValue: (key: string, value: unknown) => {
      values[key] = value;
      setCalls.push([key, value]);
    },
  };
}

function makeContainer(): FakeNode {
  return mock.makeFakeEl() as FakeNode;
}

describe("renderSettingDefinitions: control types", () => {
  it("toggle reads current value and writes back via setControlValue", () => {
    const host = makeHost({ flag: true });
    const container = makeContainer();
    renderSettingDefinitions(container as never, [{ name: "Flag", control: { type: "toggle", key: "flag" } }], host, fakeApp());
    const toggle = (container.children?.[0]?.__component ?? findComponent(container, "ToggleComponent")) as ToggleComponent;
    expect(toggle.getValue()).toBe(true);
    toggle.onChangeCB?.(false);
    expect(host.setCalls).toEqual([["flag", false]]);
  });

  it("dropdown adds all options and writes back the selected key", () => {
    const host = makeHost({ mode: "b" });
    const container = makeContainer();
    renderSettingDefinitions(
      container as never,
      [{ name: "Mode", control: { type: "dropdown", key: "mode", options: { a: "A", b: "B" } } }],
      host,
      fakeApp(),
    );
    const dd = findComponent(container, "DropdownComponent") as DropdownComponent;
    expect(dd.options).toEqual({ a: "A", b: "B" });
    expect(dd.getValue()).toBe("b");
    dd.onChangeCB?.("a");
    expect(host.setCalls).toEqual([["mode", "a"]]);
  });

  it("slider sets limits, current value, and re-labels the setting name via displayFormat on init and on change", () => {
    const host = makeHost({ k: 10 });
    const container = makeContainer();
    renderSettingDefinitions(
      container as never,
      [{ name: "K", control: { type: "slider", key: "k", min: 5, max: 50, step: 1, displayFormat: (v: number) => String(v) } }],
      host,
      fakeApp(),
    );
    const settingInstance = findSettingInstance(container);
    expect(settingInstance.nameValue).toBe("K: 10");
    const slider = findComponent(container, "SliderComponent") as SliderComponent;
    expect(slider.limits).toEqual([5, 50, 1]);
    slider.onChangeCB?.(20);
    expect(host.setCalls).toEqual([["k", 20]]);
    expect(settingInstance.nameValue).toBe("K: 20");
  });

  it("number coerces the text input to a Number before calling setControlValue", () => {
    const host = makeHost({ n: 3 });
    const container = makeContainer();
    renderSettingDefinitions(container as never, [{ name: "N", control: { type: "number", key: "n" } }], host, fakeApp());
    const text = findComponent(container, "TextComponent") as TextComponent;
    text.onChangeCB?.("42");
    expect(host.setCalls).toEqual([["n", 42]]);
  });

  it("textarea sets rows on inputEl when control.rows is given", () => {
    const host = makeHost({ txt: "" });
    const container = makeContainer();
    renderSettingDefinitions(container as never, [{ name: "T", control: { type: "textarea", key: "txt", rows: 8 } }], host, fakeApp());
    const ta = findComponent(container, "TextAreaComponent") as TextAreaComponent;
    expect(ta.inputEl.rows).toBe(8);
  });

  it("folder wires a FolderSuggest against the text input", () => {
    const host = makeHost({ dir: "" });
    const container = makeContainer();
    renderSettingDefinitions(container as never, [{ name: "Dir", control: { type: "folder", key: "dir" } }], host, fakeApp());
    const text = findComponent(container, "TextComponent") as TextComponent;
    expect(text.inputEl.__folderSuggestAttached).toBe(true);
  });

  it("text (default) applies placeholder and writes back on change", () => {
    const host = makeHost({ s: "" });
    const container = makeContainer();
    renderSettingDefinitions(container as never, [{ name: "S", control: { type: "text", key: "s", placeholder: "hint" } }], host, fakeApp());
    const text = findComponent(container, "TextComponent") as TextComponent;
    text.onChangeCB?.("value");
    expect(host.setCalls).toEqual([["s", "value"]]);
  });
});

describe("renderSettingDefinitions: groups", () => {
  it("renders a heading for a group and recurses into its items", () => {
    const host = makeHost({ a: true });
    const container = makeContainer();
    renderSettingDefinitions(
      container as never,
      [{ type: "group", heading: "Section", items: [{ name: "A", control: { type: "toggle", key: "a" } }] }],
      host,
      fakeApp(),
    );
    const settings = findAllSettingInstances(container);
    expect(settings[0].nameValue).toBe("Section");
    expect(settings[1].nameValue).toBe("A");
  });
});

describe("renderSettingDefinitions: hatches and cleanup", () => {
  it("a hatch returning void produces no cleanup entry", () => {
    const host = makeHost({});
    const container = makeContainer();
    const cleanup = renderSettingDefinitions(container as never, [{ name: "H", render: () => {} }], host, fakeApp());
    expect(() => cleanup()).not.toThrow();
  });

  it("a hatch returning a cleanup function is collected and run when the bundle is invoked, in order", () => {
    const host = makeHost({});
    const container = makeContainer();
    const calls: string[] = [];
    const cleanup = renderSettingDefinitions(
      container as never,
      [
        { name: "H1", render: () => () => calls.push("h1") },
        { name: "H2", render: () => () => calls.push("h2") },
      ],
      host,
      fakeApp(),
    );
    cleanup();
    expect(calls).toEqual(["h1", "h2"]);
  });

  it("a throwing cleanup does not stop later cleanups from running", () => {
    const host = makeHost({});
    const container = makeContainer();
    const calls: string[] = [];
    const cleanup = renderSettingDefinitions(
      container as never,
      [
        { name: "H1", render: () => () => { throw new Error("boom"); } },
        { name: "H2", render: () => () => calls.push("h2") },
      ],
      host,
      fakeApp(),
    );
    expect(() => cleanup()).not.toThrow();
    expect(calls).toEqual(["h2"]);
  });
});

describe("settingBodyHost", () => {
  it("empties settingEl and removes the setting-item class", () => {
    const container = makeContainer();
    const setting = new Setting(container);
    setting.settingEl.createEl?.("span", { text: "x" });
    const emptySpy = vi.spyOn(setting.settingEl, "empty");
    const removeSpy = vi.spyOn(setting.settingEl, "removeClass");
    const host = settingBodyHost(setting as never);
    expect(emptySpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("setting-item");
    expect(host).toBe(setting.settingEl);
  });
});

describe("refreshSettingsTab", () => {
  it("calls tab.update() when present instead of the fallback", () => {
    const update = vi.fn();
    const tab = { update } as never;
    const fallback = vi.fn();
    refreshSettingsTab(tab, fallback);
    expect(update).toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("calls the fallback when tab.update is absent", () => {
    const tab = {} as never;
    const fallback = vi.fn();
    refreshSettingsTab(tab, fallback);
    expect(fallback).toHaveBeenCalled();
  });
});

// --- helpers: walk the fake DOM tree the mock Setting/components attach to ---
// Rueckgabe bewusst `unknown` -- welche Komponentenklasse hinter `__component` steckt,
// entscheidet der Aufrufer per `className`; ein Cast am Call-Ort ist praeziser als ein
// erfundener Sammel-Typ hier.
function findComponent(container: FakeNode, className: string): unknown {
  const found = walk(container, (el) => {
    const comp = el.__component as { constructor?: { name?: string } } | undefined;
    return comp?.constructor?.name === className;
  });
  if (!found) throw new Error(`no ${className} found under container`);
  return found.__component;
}
function findSettingInstance(container: FakeNode): Setting {
  const found = walk(container, (el) => el.__setting !== undefined);
  if (!found) throw new Error("no Setting instance found under container");
  return found.__setting as Setting;
}
function findAllSettingInstances(container: FakeNode): Setting[] {
  const out: Setting[] = [];
  walk(container, (el) => {
    if (el.__setting !== undefined) out.push(el.__setting as Setting);
    return false;
  });
  return out;
}
function walk(el: FakeNode | null | undefined, pred: (el: FakeNode) => boolean): FakeNode | null {
  if (!el) return null;
  if (pred(el)) return el;
  for (const child of el.children ?? []) {
    const found = walk(child, pred);
    if (found) return found;
  }
  return null;
}
