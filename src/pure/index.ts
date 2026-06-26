export { ThinkSplitter } from "./think-splitter";
export { parseSSE } from "./sse";
export { normalizeEndpoint, resolveActiveEndpoint } from "./endpoint";
export { clampInt } from "./num";
export { type Lang, pickLang, setLang, getLang, defineStrings, t } from "./i18n";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.2.0";
