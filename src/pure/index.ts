export { ThinkSplitter } from "./think-splitter";
export { parseSSE } from "./sse";
export { normalizeEndpoint, resolveActiveEndpoint, parseEndpointList } from "./endpoint";
export {
  type EndpointStatusKind, type EndpointStatus, type ProbeInput,
  classifyEndpointStatus,
} from "./endpoint_diagnostics";
export { clampInt } from "./num";
export { mergeSettings } from "./settings";
export { type Lang, pickLang, setLang, getLang, defineStrings, t } from "./i18n";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.4.0";
