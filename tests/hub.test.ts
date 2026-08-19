import { describe, it, expect } from "vitest";
import { makeFakeEl } from "../src/testing/obsidian-mock";
import { buildHubInto, HUB_CSS } from "../src/obsidian/hub";
import type { HubController, HubOptions, HubPanel } from "../src/obsidian/hub";

// makeFakeEl() gibt bewusst `any` zurück (src/testing/** ist von den type-checked-Regeln
// befreit). tests/** ist es nicht — dieses Interface macht die hier genutzte Teilmenge
// type-safe, ohne echtes DOM/happy-dom einzuführen. Der Cast an der buildHubInto-Grenze
// läuft über `unknown` (kein `any`): der Fake ist strukturell kein HTMLElement, er bildet
// nur die von buildHubInto benutzten Obsidian-Methoden nach.
interface FakeEl {
  children: FakeEl[];
  className: string;
  textContent: string;
  getAttribute(name: string): string | null;
  hasClass(cls: string): boolean;
  click(): void;
  focus(): void;
  dispatchEvent(evt: { type: string; key?: string; preventDefault?: () => void }): boolean;
}

type TabId = "related" | "search" | "chat";
const IDS: TabId[] = ["related", "search", "chat"];

interface LogPanel extends HubPanel<TabId> {
  log: string[];
}

function fakePanel(id: TabId): LogPanel {
  const log: string[] = [];
  return {
    id,
    label: `Label ${id}`,
    icon: "layers",
    log,
    mount(container: HTMLElement): void {
      log.push("mount");
      container.createDiv({ cls: `body-${id}` });
    },
    onShow(): void { log.push("show"); },
    onHide(): void { log.push("hide"); },
    onFileOpen(path: string | null): void { log.push(`file:${path ?? "null"}`); },
    destroy(): void { log.push("destroy"); },
  };
}

/** Panel ohne optionale Haken — deckt ab, dass der Hub sie nicht voraussetzt
 *  (local-image-generator kennt kein onFileOpen). */
function barePanel(id: TabId): HubPanel<TabId> {
  return { id, label: id, icon: "x", mount(): void {}, destroy(): void {} };
}

function fakeRoot(): FakeEl {
  return makeFakeEl() as FakeEl;
}

function build(
  panels: readonly HubPanel<TabId>[],
  defaultTab: TabId,
  root: FakeEl = fakeRoot(),
  opts?: HubOptions,
): HubController<TabId> {
  return buildHubInto(root as unknown as HTMLElement, panels, defaultTab, opts);
}

/** Panel einer Id aus der Liste holen, ohne `!` (Kit-eslint verbietet Non-null-Assertions). */
function must2(panels: readonly LogPanel[], id: TabId): LogPanel {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`Panel nicht gefunden: ${id}`);
  return p;
}

/** Kein `!`-Zugriff (Kit-eslint verbietet Non-null-Assertions): fehlt das Element, soll der
 *  Test hier und mit Namen scheitern, nicht drei Zeilen später an `undefined`. */
function must(el: FakeEl | undefined, what: string): FakeEl {
  if (!el) throw new Error(`Element nicht gefunden: ${what}`);
  return el;
}

// root.children = [tabsEl, contentEl] — dieselbe Index-Traversierung, auf die der
// finance-Test heute baut (tests/views/hub/hubController.test.ts).
const tabsOf = (root: FakeEl): FakeEl => must(root.children[0], "tabsEl");
const contentOf = (root: FakeEl): FakeEl => must(root.children[1], "contentEl");

function byDataTab(parent: FakeEl, id: TabId, what: string): FakeEl {
  return must(parent.children.find((c) => c.getAttribute("data-tab") === id), `${what}[${id}]`);
}
const tabBtn = (root: FakeEl, id: TabId): FakeEl => byDataTab(tabsOf(root), id, "tab");
const panelDiv = (root: FakeEl, id: TabId): FakeEl => byDataTab(contentOf(root), id, "panel");

/** Lässt eine per `void` abgesetzte Promise-Kette (asynchrones onShow) durchlaufen. */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

function keydown(el: FakeEl, key: string): { prevented: boolean } {
  let prevented = false;
  el.dispatchEvent({ type: "keydown", key, preventDefault: () => { prevented = true; } });
  return { prevented };
}

describe("buildHubInto — Aufbau", () => {
  it("mountet jedes Panel genau einmal und legt Tab + Panel je Id an", () => {
    const panels = IDS.map(fakePanel);
    const root = fakeRoot();
    build(panels, "related", root);

    for (const p of panels) expect(p.log.filter((e) => e === "mount")).toHaveLength(1);
    expect(tabsOf(root).children).toHaveLength(3);
    expect(contentOf(root).children).toHaveLength(3);
    for (const id of IDS) {
      expect(tabBtn(root, id)).toBeTruthy();
      expect(panelDiv(root, id)).toBeTruthy();
    }
  });

  it("gibt root genau zwei Kinder (Tab-Leiste, Content) — Vertrag der Consumer-Tests", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root);
    expect(root.children).toHaveLength(2);
    expect(tabsOf(root).hasClass("okit-hub-tabs")).toBe(true);
    expect(contentOf(root).hasClass("okit-hub-content")).toBe(true);
    expect(root.hasClass("okit-hub-root")).toBe(true);
  });

  it("leert root vorher — zweimal bauen verdoppelt nichts", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root);
    build(IDS.map(fakePanel), "related", root);
    expect(root.children).toHaveLength(2);
    expect(tabsOf(root).children).toHaveLength(3);
  });

  it("Tab trägt Icon-Span und Label-Span (UI-STANDARD §4: Icon UND Label)", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root);
    const btn = tabBtn(root, "chat");
    expect(must(btn.children[0], "icon").hasClass("okit-hub-tab-icon")).toBe(true);
    const label = must(btn.children[1], "label");
    expect(label.hasClass("okit-hub-tab-label")).toBe(true);
    expect(label.textContent).toBe("Label chat");
  });

  it("rootClasses kommen zusätzlich an den Root (finance: eigener Design-Scope)", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root, { rootClasses: ["finance-plugin"] });
    expect(root.hasClass("okit-hub-root")).toBe(true);
    expect(root.hasClass("finance-plugin")).toBe(true);
  });
});

describe("buildHubInto — Navigation", () => {
  it("zeigt initial nur den Default-Tab", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "search", root);
    expect(panelDiv(root, "search").hasClass("is-hidden")).toBe(false);
    expect(panelDiv(root, "related").hasClass("is-hidden")).toBe(true);
    expect(tabBtn(root, "search").hasClass("is-active")).toBe(true);
    expect(tabBtn(root, "related").hasClass("is-active")).toBe(false);
  });

  it("ruft onShow initial nur auf dem Default-Panel", () => {
    const panels = IDS.map(fakePanel);
    build(panels, "search");
    expect(must2(panels, "search").log).toContain("show");
    expect(must2(panels, "related").log).not.toContain("show");
  });

  it("setTab: altes Panel hide, neues show, Sichtbarkeit getauscht", () => {
    const panels = IDS.map(fakePanel);
    const root = fakeRoot();
    const ctrl = build(panels, "related", root);

    ctrl.setTab("chat");

    expect(must2(panels, "related").log).toContain("hide");
    expect(must2(panels, "chat").log).toContain("show");
    expect(ctrl.currentTab()).toBe("chat");
    expect(panelDiv(root, "chat").hasClass("is-hidden")).toBe(false);
    expect(panelDiv(root, "related").hasClass("is-hidden")).toBe(true);
  });

  it("setTab auf den bereits aktiven Tab ist ein No-op (kein zweites onShow)", () => {
    const panels = IDS.map(fakePanel);
    const ctrl = build(panels, "related");
    const related = must2(panels, "related");
    related.log.length = 0;

    ctrl.setTab("related");

    expect(related.log).toEqual([]);
  });

  // Guard aus der finance-Fassung: ohne ihn versteckt applyVisibility ALLE Panels.
  it("setTab auf eine Id ohne Panel prallt ab und lässt den Hub sichtbar", () => {
    const panels = [fakePanel("related"), fakePanel("chat")];
    const root = fakeRoot();
    const ctrl = build(panels, "related", root);

    ctrl.setTab("search");

    expect(ctrl.currentTab()).toBe("related");
    expect(panelDiv(root, "related").hasClass("is-hidden")).toBe(false);
    expect(must2(panels, "related").log).not.toContain("hide");
  });

  it("unbekannter defaultTab fällt auf panels[0] zurück (deaktiviertes Feature im Layout-State)", () => {
    const panels = [fakePanel("related"), fakePanel("chat")];
    const root = fakeRoot();
    const ctrl = build(panels, "search", root);

    expect(ctrl.currentTab()).toBe("related");
    expect(panelDiv(root, "related").hasClass("is-hidden")).toBe(false);
    expect(must2(panels, "related").log).toContain("show");
  });

  it("Klick auf den Tab-Button schaltet um (Verdrahtung über addEventListener)", () => {
    const panels = IDS.map(fakePanel);
    const root = fakeRoot();
    const ctrl = build(panels, "related", root);

    tabBtn(root, "chat").click();

    expect(ctrl.currentTab()).toBe("chat");
    expect(panelDiv(root, "chat").hasClass("is-hidden")).toBe(false);
  });

  it("refreshActive löst onShow nur auf dem aktiven Panel erneut aus", () => {
    const panels = IDS.map(fakePanel);
    const ctrl = build(panels, "related");
    for (const p of panels) p.log.length = 0;

    ctrl.refreshActive();

    expect(must2(panels, "related").log).toEqual(["show"]);
    expect(must2(panels, "chat").log).toEqual([]);
  });

  it("notifyFileOpen erreicht alle Panels — auch die ohne onFileOpen", () => {
    const withHook = fakePanel("related");
    const panels: HubPanel<TabId>[] = [withHook, barePanel("chat")];
    const ctrl = build(panels, "related");

    expect(() => { ctrl.notifyFileOpen("Note.md"); }).not.toThrow();
    expect(withHook.log).toContain("file:Note.md");
    ctrl.notifyFileOpen(null);
    expect(withHook.log).toContain("file:null");
  });

  it("destroy räumt jedes Panel ab und lässt root stehen (das empty() bleibt beim View)", () => {
    const panels = IDS.map(fakePanel);
    const root = fakeRoot();
    const ctrl = build(panels, "related", root);

    ctrl.destroy();

    for (const p of panels) expect(p.log).toContain("destroy");
    expect(root.children).toHaveLength(2);
  });

  it("nimmt ein asynchrones onShow entgegen (finance-Obermenge void | Promise<void>)", async () => {
    const seen: string[] = [];
    const panel: HubPanel<TabId> = {
      id: "related", label: "r", icon: "x",
      mount(): void {},
      onShow: () => Promise.resolve().then(() => { seen.push("async-show"); }),
      destroy(): void {},
    };
    build([panel], "related");
    await flush();
    expect(seen).toEqual(["async-show"]);
  });
});

describe("buildHubInto — ARIA-Tabs-Muster", () => {
  it("deklariert tablist/tab/tabpanel und verknüpft beide Richtungen", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root);

    expect(tabsOf(root).getAttribute("role")).toBe("tablist");
    const btn = tabBtn(root, "chat");
    const panel = panelDiv(root, "chat");
    expect(btn.getAttribute("role")).toBe("tab");
    expect(btn.getAttribute("type")).toBe("button");
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(btn.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(btn.getAttribute("id"));
  });

  it("vergibt über zwei Hub-Instanzen hinweg verschiedene DOM-Ids", () => {
    const a = fakeRoot();
    const b = fakeRoot();
    build(IDS.map(fakePanel), "related", a);
    build(IDS.map(fakePanel), "related", b);
    expect(tabBtn(a, "related").getAttribute("id")).not.toBe(tabBtn(b, "related").getAttribute("id"));
  });

  it("aria-selected und roving tabindex wandern beim Tab-Wechsel mit", () => {
    const root = fakeRoot();
    const ctrl = build(IDS.map(fakePanel), "related", root);

    expect(tabBtn(root, "related").getAttribute("aria-selected")).toBe("true");
    expect(tabBtn(root, "related").getAttribute("tabindex")).toBe("0");
    expect(tabBtn(root, "chat").getAttribute("aria-selected")).toBe("false");
    expect(tabBtn(root, "chat").getAttribute("tabindex")).toBe("-1");

    ctrl.setTab("chat");

    expect(tabBtn(root, "related").getAttribute("aria-selected")).toBe("false");
    expect(tabBtn(root, "related").getAttribute("tabindex")).toBe("-1");
    expect(tabBtn(root, "chat").getAttribute("aria-selected")).toBe("true");
    expect(tabBtn(root, "chat").getAttribute("tabindex")).toBe("0");
  });

  it("Pfeil rechts/links wandert mit Umlauf und aktiviert dabei", () => {
    const root = fakeRoot();
    const ctrl = build(IDS.map(fakePanel), "related", root);

    expect(keydown(tabBtn(root, "related"), "ArrowRight").prevented).toBe(true);
    expect(ctrl.currentTab()).toBe("search");

    keydown(tabBtn(root, "search"), "ArrowLeft");
    expect(ctrl.currentTab()).toBe("related");

    keydown(tabBtn(root, "related"), "ArrowLeft");   // Umlauf an den Anfang
    expect(ctrl.currentTab()).toBe("chat");

    keydown(tabBtn(root, "chat"), "ArrowRight");     // Umlauf ans Ende
    expect(ctrl.currentTab()).toBe("related");
  });

  it("Home/End springen an den Rand", () => {
    const root = fakeRoot();
    const ctrl = build(IDS.map(fakePanel), "search", root);

    keydown(tabBtn(root, "search"), "End");
    expect(ctrl.currentTab()).toBe("chat");

    keydown(tabBtn(root, "chat"), "Home");
    expect(ctrl.currentTab()).toBe("related");
  });

  it("fremde Tasten bleiben unangetastet (kein preventDefault, kein Wechsel)", () => {
    const root = fakeRoot();
    const ctrl = build(IDS.map(fakePanel), "related", root);

    const r = keydown(tabBtn(root, "related"), "a");

    expect(r.prevented).toBe(false);
    expect(ctrl.currentTab()).toBe("related");
  });
});

describe("HUB_CSS", () => {
  it("trägt alle vier Umbruch-Zutaten — keine ist verzichtbar", () => {
    expect(HUB_CSS).toContain("flex-wrap: wrap");        // (1) Container
    expect(HUB_CSS).toContain("flex: 1 1 auto");         // (2) Tab
    expect(HUB_CSS).toContain("min-width: 0");           // (3) Tab
    expect(HUB_CSS).toContain(".okit-hub-tab-label");    // (4) eigenes Label-Element
    expect(HUB_CSS).toContain("text-overflow: ellipsis");
    expect(HUB_CSS).toContain("white-space: nowrap");
  });

  // Regressionswächter gegen genau den Drift, der in local-image-generator/styles.css steht:
  // `flex: 1` ist `1 1 0%` — hypothetische Hauptgröße 0, also bricht die Leiste NIE um.
  it("nutzt am Tab nirgends flex: 1 / flex-basis: 0 (hebt den Umbruch auf)", () => {
    expect(HUB_CSS).not.toMatch(/flex:\s*1\s*;/);
    expect(HUB_CSS).not.toMatch(/flex:\s*1\s+1\s+0/);
    expect(HUB_CSS).not.toMatch(/flex-basis:\s*0/);
  });

  it("blendet nur versteckte Panels aus und markiert den aktiven Tab", () => {
    expect(HUB_CSS).toContain(".okit-hub-panel.is-hidden");
    expect(HUB_CSS).toContain("display: none");
    expect(HUB_CSS).toContain(".okit-hub-tab.is-active");
  });

  it("hält sich an UI-STANDARD §3: keine Hex-/rgb-Farben, kein !important", () => {
    expect(HUB_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(HUB_CSS).not.toMatch(/\brgba?\(/);
    expect(HUB_CSS).not.toContain("!important");
  });

  it("verwendet ausschließlich Obsidian-Theme-Variablen (keine plugin-eigenen --fl-/--nv-)", () => {
    const vars = [...HUB_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(0);
    const allowed = /^--(background|text|interactive|size|font|radius|color)-/;
    expect(vars.filter((v) => !allowed.test(v))).toEqual([]);
  });

  // Der Test, der ligs und apple-healths toten Label-Span gefunden hätte: jede Klasse, die
  // der Builder erzeugt, braucht eine Regel — sonst hängt DOM ohne Wirkung im Baum.
  it("deckt jede vom Builder erzeugte okit-Klasse mit einer Regel ab", () => {
    const root = fakeRoot();
    build(IDS.map(fakePanel), "related", root);

    const seen = new Set<string>();
    const walk = (el: FakeEl): void => {
      for (const cls of el.className.split(" ")) if (cls.startsWith("okit-")) seen.add(cls);
      for (const child of el.children) walk(child);
    };
    walk(root);

    expect(seen.size).toBeGreaterThanOrEqual(7);
    const ohneRegel = [...seen].filter((cls) => !HUB_CSS.includes(`.${cls}`));
    expect(ohneRegel).toEqual([]);
  });
});
