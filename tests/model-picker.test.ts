import { describe, it, expect, vi } from "vitest";
import { Setting, DropdownComponent, TextComponent, ExtraButtonComponent, makeFakeEl } from "../src/testing/obsidian-mock";
import { renderModelPicker } from "../src/obsidian/model-picker";
import type { ModelChoice } from "../src/pure/model-choice";

// Der Brief-Entwurf ging von einer `setting.controlEl`-Eigenschaft aus, die der Kit-Mock
// damals nicht kannte. Seit `f0a7e74` (Vorschritt zur Endpunkt-Liste) gibt es sie -- weitere
// Unterknoten des echten `obsidian.Setting` (`infoEl`, `nameEl`, `descEl`) aber weiterhin
// nicht. Fuer diesen Test aendert das nichts: der Mock haengt jede gezeichnete Komponente
// zusaetzlich an `Setting.components` (s. obsidian-mock.ts `addDropdown`/`addText`/
// `addExtraButton`) -- das ist der etablierte, zuverlaessige Zugriffspfad (vgl.
// `tests/settings_walker.test.ts`, das denselben Weg ueber die DOM-`__component`-Marker
// nimmt, wo kein direktes Array existiert). Deshalb liest `componentsOf` hier direkt das
// Array statt einen DOM-Baum zu laufen. Aus demselben Grund (Mock-`Setting` ist strukturell
// kein echtes `obsidian.Setting`) braucht jeder `renderModelPicker`-Aufruf `as never` an der
// `setting`-Uebergabe -- etablierte Kit-Konvention fuer diesen Mock/Real-Typ-Bruch, s.
// `fakeApp()` in `settings_walker.test.ts`.
function componentsOf(setting: Setting): unknown[] {
  return setting.components;
}

function base(): { setting: Setting; onPick: ReturnType<typeof vi.fn>; onRefresh: ReturnType<typeof vi.fn> } {
  const containerEl = makeFakeEl();
  return { setting: new Setting(containerEl as never), onPick: vi.fn(), onRefresh: vi.fn() };
}

const dropdown: ModelChoice = {
  mode: "dropdown",
  options: [{ value: "a", label: "a" }, { value: "b", label: "b", suffix: "saved" }],
  value: "a",
  hintKey: "",
};

describe("renderModelPicker", () => {
  it("zeichnet ein Dropdown mit allen Optionen und haengt den Zusatz an", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting: setting as never, choice: dropdown, ariaLabel: "Modell", placeholder: "Modell",
      hint: "", savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen",
      onPick, onRefresh,
    });
    const dd = componentsOf(setting).find(c => c instanceof DropdownComponent) as DropdownComponent;
    expect(dd).toBeDefined();
    expect(dd.getValue()).toBe("a");
    expect(dd.options).toEqual({ a: "a", b: "b (gespeichert)" });
  });

  it("zeichnet Freitext im Modus freetext", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting: setting as never, choice: { mode: "freetext", options: [], value: "x", hintKey: "no-list" },
      ariaLabel: "Modell", placeholder: "Modell", hint: "Keine Liste",
      savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
    });
    const text = componentsOf(setting).find(c => c instanceof TextComponent) as TextComponent;
    expect(text).toBeDefined();
    expect(text.getValue()).toBe("x");
  });

  it("zeichnet den Refresh-Knopf in JEDEM Modus und verdrahtet ihn mit onRefresh", () => {
    for (const choice of [dropdown, { ...dropdown, mode: "locked" as const }]) {
      const { setting, onPick, onRefresh } = base();
      renderModelPicker({
        setting: setting as never, choice, ariaLabel: "Modell", placeholder: "Modell", hint: "",
        savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
      });
      const refresh = componentsOf(setting).find(c => c instanceof ExtraButtonComponent) as ExtraButtonComponent;
      expect(refresh).toBeDefined();
      refresh.clickCB?.();
      expect(onRefresh).toHaveBeenCalledTimes(1);
    }
  });

  it("meldet die Auswahl im Modus dropdown zurueck, im Modus locked nicht", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting: setting as never, choice: dropdown, ariaLabel: "Modell", placeholder: "Modell", hint: "",
      savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
    });
    const dd = componentsOf(setting).find(c => c instanceof DropdownComponent) as DropdownComponent;
    // Der Mock loest onChange nicht automatisch bei `setValue` aus (anders als der echte
    // Obsidian-<select>) -- der etablierte Weg, eine Nutzerauswahl zu simulieren, ist der
    // direkte Aufruf des registrierten Callbacks (s. `settings_walker.test.ts`, z.B.
    // `dd.onChangeCB?.("a")`).
    dd.onChangeCB?.("b");
    expect(onPick).toHaveBeenCalledWith("b");

    const locked = base();
    renderModelPicker({
      setting: locked.setting as never, choice: { ...dropdown, mode: "locked" }, ariaLabel: "Modell",
      placeholder: "Modell", hint: "", savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen",
      onPick: locked.onPick, onRefresh: locked.onRefresh,
    });
    const lockedDd = componentsOf(locked.setting).find(c => c instanceof DropdownComponent) as DropdownComponent;
    expect(lockedDd.onChangeCB).toBeNull();
    lockedDd.onChangeCB?.("b");
    expect(locked.onPick).not.toHaveBeenCalled();
  });
});
