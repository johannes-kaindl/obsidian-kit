import { describe, it, expect, vi } from "vitest";
import { FolderSuggest } from "../src/obsidian/folder-suggest";

// Fake-App: nur der eine genutzte Pfad app.vault.getAllFolders() → TFolder-Stubs.
function makeApp(paths: string[]) {
  return { vault: { getAllFolders: () => paths.map((p) => ({ path: p })) } } as never;
}

// Fake-Input: value + dispatchEvent reichen (Mock-setValue schreibt nach inputEl.value).
function makeInput() {
  return { value: "", dispatchEvent: vi.fn() } as unknown as HTMLInputElement;
}

describe("FolderSuggest", () => {
  it("filtert case-insensitiv per Substring", () => {
    const s = new FolderSuggest(makeApp(["10_Projekte", "20_Archiv", "10_Projekte/Sub"]), makeInput());
    expect(s.getSuggestions("pro")).toEqual(["10_Projekte", "10_Projekte/Sub"]);
  });

  it("deckelt die Vorschlagsliste bei 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => `Ordner-${i}`);
    const s = new FolderSuggest(makeApp(many), makeInput());
    expect(s.getSuggestions("ordner")).toHaveLength(20);
  });

  it("rendert den Pfad als Text", () => {
    const s = new FolderSuggest(makeApp([]), makeInput());
    const el = { setText: vi.fn() };
    s.renderSuggestion("10_Projekte", el as unknown as HTMLElement);
    expect(el.setText).toHaveBeenCalledWith("10_Projekte");
  });

  it("selectSuggestion setzt Wert, feuert genau ein input-Event und schließt", () => {
    const input = makeInput();
    const s = new FolderSuggest(makeApp([]), input);
    const closeSpy = vi.spyOn(s, "close");
    s.selectSuggestion("10_Projekte", {} as MouseEvent);
    expect((input as unknown as { value: string }).value).toBe("10_Projekte");
    const de = (input as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }).dispatchEvent;
    expect(de).toHaveBeenCalledTimes(1);
    expect((de.mock.calls[0][0] as Event).type).toBe("input");
    expect(closeSpy).toHaveBeenCalled();
  });
});
