import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Setting, TextComponent, ExtraButtonComponent, DropdownComponent, Notice, makeFakeEl,
} from "../src/testing/obsidian-mock";
import { buildEndpointList } from "../src/obsidian/endpoint-list";
import type { EndpointListOptions, EndpointListStrings } from "../src/obsidian/endpoint-list";
import { createModelListCache } from "../src/pure/model-list-cache";
import type { EndpointConfig } from "../src/pure/endpoint_config";
import type { EndpointStatus } from "../src/pure/endpoint_diagnostics";

const OK: EndpointStatus = { reachable: true, kind: "ok", klartext: "ok" };

function strings(): EndpointListStrings {
  return {
    addPlaceholder: "add", apiKeyPlaceholder: "key", modelPlaceholder: "model",
    ariaUrl: "url", ariaAdd: "aria-add",
    ariaApiKey: (u: string) => `key ${u}`, ariaModel: (u: string) => `model ${u}`,
    emptyModelLabel: (g: string) => `global (${g})`,
    modelHint: () => "", savedSuffix: "(saved)", refreshModels: "refresh",
    moveToFront: "top", remove: "remove", thirdParty: "third-party", probing: "probing",
    statusTooltip: (s: EndpointStatus) => s.klartext,
    role: () => "aktiv", warnings: () => "warn",
    presetTooltip: () => "preset", presetLabel: () => "preset",
    checkConnection: "check", saveFailed: "save failed",
  };
}

/** Mock-Elemente sind bewusst lose typisiert (s. Kopf von obsidian-mock.ts); das hier ist
 *  der Ausschnitt, den dieser Test davon anfasst. */
interface FakeEl {
  children: FakeEl[];
  className: string;
  __setting?: Setting;
  getAttribute(k: string): string | null;
  hasClass(c: string): boolean;
  dispatchEvent(evt: { type: string }): boolean;
}

function harness(eps: EndpointConfig[], overrides: Partial<EndpointListOptions> = {}): {
  opts: EndpointListOptions;
  containerEl: FakeEl;
  order: string[];
  save: ReturnType<typeof vi.fn>;
  reconnect: ReturnType<typeof vi.fn>;
  rerender: ReturnType<typeof vi.fn>;
  current: () => EndpointConfig[];
} {
  let stored = eps;
  const containerEl = makeFakeEl() as FakeEl;
  // EINE Liste fuer alle drei Rueckrufe: nur so laesst sich die REIHENFOLGE der Kette
  // pruefen, nicht bloss dass jedes Glied irgendwann gerufen wurde.
  const order: string[] = [];
  const save = vi.fn(() => { order.push("save"); return Promise.resolve(); });
  const reconnect = vi.fn(() => { order.push("reconnect"); return Promise.resolve(); });
  const rerender = vi.fn(() => { order.push("rerender"); });
  const opts: EndpointListOptions = {
    containerEl: containerEl as never,
    label: "Endpunkte", desc: "desc", placeholder: "http://…",
    strings: strings(), cache: createModelListCache(),
    get: () => stored,
    set: (next: EndpointConfig[]) => { stored = next; },
    active: () => stored[0]?.url ?? null,
    clientFor: () => ({
      listModels: () => Promise.resolve(["m1"]),
      probe: () => Promise.resolve(OK),
    }),
    globalModel: () => "g",
    save, reconnect, rerender,
    ...overrides,
  };
  return { opts, containerEl, order, save, reconnect, rerender, current: () => stored };
}

/** Die Setting-Zeilen in Zeichenreihenfolge: [Label, …Eintraege, Adder, Aktionen]. */
function rowsOf(containerEl: FakeEl): Setting[] {
  return containerEl.children
    .map(c => c.__setting)
    .filter((s): s is Setting => s !== undefined);
}

function textsOf(setting: Setting): TextComponent[] {
  return setting.components.filter((c: unknown): c is TextComponent => c instanceof TextComponent);
}

function extraButtonsOf(setting: Setting): ExtraButtonComponent[] {
  return setting.components.filter(
    (c: unknown): c is ExtraButtonComponent => c instanceof ExtraButtonComponent,
  );
}

/** Laesst die angestossenen Promise-Ketten (Probe, Modell-Liste, save→reconnect→rerender)
 *  durchlaufen. `setTimeout(0)` statt einer festen Zahl von Microtask-Ticks: die Kette ist
 *  mehrstufig, und ein Makrotask liegt garantiert hinter allen Microtasks. */
function flush(): Promise<void> {
  return new Promise<void>(resolve => { setTimeout(resolve, 0); });
}

beforeEach(() => { Notice.instances.length = 0; });

describe("buildEndpointList", () => {
  it("zeichnet eine Adder-Zeile zusaetzlich zu den bestehenden Eintraegen", () => {
    const h = harness([{ url: "http://a" }]);
    buildEndpointList(h.opts);

    const rows = rowsOf(h.containerEl);
    // Label-Zeile + 1 Eintrag + Adder + Aktionszeile
    expect(rows.length).toBe(4);
    const [label, entry, adder, actions] = rows as [Setting, Setting, Setting, Setting];
    expect(label.nameValue).toBe("Endpunkte");
    expect(label.components.length).toBe(0);

    // Der Eintrag traegt URL + Schluessel, die Adder-Zeile nur ein leeres URL-Feld.
    expect(textsOf(entry).map(t => t.getValue())).toEqual(["http://a", ""]);
    expect(textsOf(adder).map(t => t.getValue())).toEqual([""]);
    // …und keine Zeilen-Knoepfe (kein "zuerst verwenden", kein Muelleimer am leeren Feld).
    expect(extraButtonsOf(adder).length).toBe(0);
    expect(extraButtonsOf(entry).length).toBe(1);   // nur Muelleimer; Platz 1 hat kein "zuerst verwenden"

    // Die Aktionszeile ist die letzte, nicht der Adder.
    expect(actions.components.length).toBeGreaterThan(0);
    expect(h.current()).toEqual([{ url: "http://a" }]);
  });

  it("committet erst bei blur, nicht pro Tastendruck", async () => {
    const h = harness([{ url: "http://a" }]);
    buildEndpointList(h.opts);
    const url = textsOf(rowsOf(h.containerEl)[1])[0];

    // Tippen: der Wert steht im Feld, aber es gibt gar keinen onChange-Rueckruf — genau das
    // ist die Invariante (sonst wuerde im Adder jeder Zwischenstand h/ht/htt… angehaengt).
    url.setValue("http://a2");
    expect(url.onChangeCB).toBeNull();
    await flush();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.current()).toEqual([{ url: "http://a" }]);

    // Erst blur committet.
    (url.inputEl as FakeEl).dispatchEvent({ type: "blur" });
    expect(h.current()).toEqual([{ url: "http://a2" }]);
    await flush();
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it("sperrt die Zeilen bei einer Listen-Mutation und faehrt save → reconnect → rerender", async () => {
    const h = harness([{ url: "http://a" }, { url: "http://b" }]);
    buildEndpointList(h.opts);

    expect(h.containerEl.getAttribute("aria-busy")).toBe("false");

    // Zweite Eintragszeile: [0]=Label, [1]=http://a, [2]=http://b. Ihre Zusatzknoepfe sind
    // in Zeichenreihenfolge [zuerst verwenden, entfernen] — synchron abgegriffen, bevor der
    // Modell-Picker seinen eigenen Refresh-Knopf nachtraegt (der kommt erst nach dem Promise).
    const second = rowsOf(h.containerEl)[2];
    const buttons = extraButtonsOf(second);
    expect(buttons.length).toBe(2);
    buttons[0].clickCB?.();

    // Sofort gesperrt: die gerenderten Zeilen-Indizes sind bis zum Re-Render stale.
    expect(h.containerEl.getAttribute("aria-busy")).toBe("true");
    expect(h.containerEl.hasClass("okit-ep-busy")).toBe(true);

    await flush();
    expect(h.current().map(c => c.url)).toEqual(["http://b", "http://a"]);
    expect(h.order).toEqual(["save", "reconnect", "rerender"]);
  });

  // Die Leer-Option selbst kommt wie in der Vorlage aus resolveModelChoice (`allowEmpty`);
  // was das Kit NICHT mehr kennt, ist `emptyLabel` — die Option kommt sprachfrei mit leerem
  // Label herein und wird erst beim Zeichnen beschriftet. Genau das prueft dieser Fall.
  it("beschriftet die Leer-Option des Modell-Dropdowns ueber emptyModelLabel", async () => {
    const h = harness([{ url: "http://a" }]);
    buildEndpointList(h.opts);
    await flush();

    const entry = rowsOf(h.containerEl)[1];
    const dd = entry.components.find(
      (c: unknown): c is DropdownComponent => c instanceof DropdownComponent,
    );
    expect(dd).toBeDefined();
    expect(dd?.options).toEqual({ "": "global (g)", m1: "m1" });
    expect(dd?.getValue()).toBe("");
  });

  // Regression (gemeldet 2026-08-08): der Fall oben deckt nur `current === ""` ab und lief an
  // dem Fehler vorbei. Traegt die Zeile ein Override und liefert der Endpunkt eine Liste, fehlte
  // die Leer-Option ganz — das Override war ueber die Oberflaeche nicht mehr zuruecknehmbar.
  it("bietet die Leer-Option auch dann an, wenn die Zeile schon ein Modell-Override traegt", async () => {
    const h = harness([{ url: "http://a", model: "m1" }]);
    buildEndpointList(h.opts);
    await flush();

    const entry = rowsOf(h.containerEl)[1];
    const dd = entry.components.find(
      (c: unknown): c is DropdownComponent => c instanceof DropdownComponent,
    );
    expect(dd).toBeDefined();
    expect(dd?.options).toEqual({ "": "global (g)", m1: "m1" });
    expect(dd?.getValue()).toBe("m1");
    // Der Weg zurueck ist gangbar: die Leer-Option waehlen nimmt das Override zurueck.
    dd?.onChangeCB?.("");
    expect(h.current()).toEqual([{ url: "http://a" }]);
    await flush();
  });

  it("laesst die UI nach einem gescheiterten Speichern nicht verriegelt zurueck", async () => {
    const order: string[] = [];
    const save = vi.fn(() => { order.push("save"); return Promise.reject(new Error("nope")); });
    const h = harness([{ url: "http://a" }, { url: "http://b" }], { save });

    buildEndpointList(h.opts);
    const second = rowsOf(h.containerEl)[2];
    extraButtonsOf(second)[0].clickCB?.();
    expect(h.containerEl.getAttribute("aria-busy")).toBe("true");

    await flush();
    // Entriegelt, gemeldet, neu gezeichnet — reconnect lief nie (die Kette brach davor ab).
    expect(h.containerEl.getAttribute("aria-busy")).toBe("false");
    expect(h.containerEl.hasClass("okit-ep-busy")).toBe(false);
    expect(h.reconnect).not.toHaveBeenCalled();
    expect(h.rerender).toHaveBeenCalledTimes(1);
    expect(Notice.instances.map(n => n.message)).toEqual(["save failed"]);
  });
});
