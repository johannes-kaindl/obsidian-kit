export { ThinkSplitter } from "./think-splitter";
export { parseSSE } from "./sse";
export { normalizeEndpoint, resolveActiveEndpoint, parseEndpointList } from "./endpoint";
export {
  type EndpointConfig, type EndpointRole,
  authHeaders, effectiveModel, carriesApiKey,
  migrateEndpointList, applyEndpointEdit, moveEndpointToFront,
  resolveActiveEndpointConfig, endpointRole,
} from "./endpoint_config";
export {
  type EndpointStatusKind, type EndpointStatus, type ProbeInput,
  classifyEndpointStatus,
  type EndpointPreset, ENDPOINT_PRESETS,
  type EndpointWarning, validateEndpointInput,
  extractModelIds,
} from "./endpoint_diagnostics";
export { clampInt } from "./num";
export { type TimeoutTimers, type TimeoutResult, withTimeout } from "./timeout";
export { mergeSettings } from "./settings";
export { type Lang, pickLang, setLang, getLang, defineStrings, t } from "./i18n";
export { type ThinkingSupport, suppressParams, reasoningHappened, isAlwaysOnThinker } from "./reasoning";
export {
  type Confidence, type ThinkingState, type Capabilities, type CapabilityFetch,
  guessFromName, parseOllamaShow, parseLmStudioV1, parseLmStudioV0,
  mergeCapability, resolveCapabilities, fetchCapabilities,
} from "./capabilities";
export { type ModelContext, parseLmStudioContext, parseOllamaContext } from "./model-context";
export {
  type FmValue, type ParsedFrontmatter,
  parseFrontmatter, serializeFrontmatter, valueEquals, assertParseable,
} from "./frontmatter";
export {
  renderPdf, layoutDocument, DEFAULT_OPTIONS, fontSet, inlineText,
  type Block, type Inline, type ListItem, type Cell, type Align, type Document,
  type LayoutOptions, type FontChoice, type Margins, type RunningHF, type DrawOp,
} from "./pdf";
export {
  type ModelChoiceMode, type ModelHintKey, type ModelOption,
  type ModelChoice, type ModelChoiceInput,
  resolveModelChoice,
} from "./model-choice";
export {
  type ModelListResult, type ModelListClient, type ModelListCache,
  createModelListCache,
} from "./model-list-cache";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.26.0";
