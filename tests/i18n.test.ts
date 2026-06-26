import { describe, it, expect, beforeEach } from "vitest";
import { pickLang, setLang, getLang, defineStrings, t } from "../src/pure/i18n";

beforeEach(() => {
  setLang("en");
  defineStrings({
    en: { hi: "Hello", card: "Image {0}/{1}" },
    de: { hi: "Hallo", card: "Bild {0}/{1}" },
  });
});

describe("i18n", () => {
  it("pickLang erkennt de-Prefix, sonst en", () => {
    expect(pickLang("de-DE")).toBe("de");
    expect(pickLang("en-US")).toBe("en");
    expect(pickLang(null)).toBe("en");
  });
  it("setLang/getLang round-trip", () => {
    setLang("de");
    expect(getLang()).toBe("de");
  });
  it("t nutzt aktuelle Sprache", () => {
    setLang("de");
    expect(t("hi")).toBe("Hallo");
  });
  it("t fällt currentLang → en → key zurück", () => {
    setLang("de");
    defineStrings({ en: { only: "EN" }, de: {} });
    expect(t("only")).toBe("EN");
    expect(t("missing")).toBe("missing");
  });
  it("t interpoliert positional {0}/{1}", () => {
    expect(t("card", 3, 7)).toBe("Image 3/7");
  });
  it("unbesetzter Platzhalter bleibt stehen", () => {
    expect(t("card", 3)).toBe("Image 3/{1}");
  });
});
