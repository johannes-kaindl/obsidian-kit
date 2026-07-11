export { ThinkSplitter } from "./think-splitter";
export { parseSSE } from "./sse";
export { normalizeEndpoint, resolveActiveEndpoint, parseEndpointList } from "./endpoint";
export {
  type EndpointStatusKind, type EndpointStatus, type ProbeInput,
  classifyEndpointStatus,
  type EndpointPreset, ENDPOINT_PRESETS,
  type EndpointWarning, validateEndpointInput,
} from "./endpoint_diagnostics";
export { clampInt } from "./num";
export { mergeSettings } from "./settings";
export { type Lang, pickLang, setLang, getLang, defineStrings, t } from "./i18n";
export { type ThinkingSupport, suppressParams, reasoningHappened, isAlwaysOnThinker } from "./reasoning";
export { type ModelContext, parseLmStudioContext, parseOllamaContext } from "./model-context";
export {
  renderPdf, layoutDocument, DEFAULT_OPTIONS, fontSet, inlineText,
  type Block, type Inline, type ListItem, type Cell, type Align, type Document,
  type LayoutOptions, type FontChoice, type Margins, type RunningHF, type DrawOp,
} from "./pdf";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.10.1";
