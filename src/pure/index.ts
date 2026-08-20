export {
  type FmValue, type ParsedFrontmatter,
  parseFrontmatter, serializeFrontmatter, valueEquals, assertParseable,
} from "./frontmatter";
export {
  renderPdf, layoutDocument, DEFAULT_OPTIONS, fontSet, inlineText,
  type Block, type Inline, type ListItem, type Cell, type Align, type Document,
  type LayoutOptions, type FontChoice, type Margins, type RunningHF, type DrawOp,
} from "./pdf";
export { type CalloutFold, wrapCallout } from "./callout";
export { normalizeVaultDir, joinVaultPath, vaultDirname } from "./vault-path";

/** Diagnose-Konstante: erlaubt einem Plugin zu loggen, welche gepinnte Kit-Version es bündelt (Spec §6). */
export const KIT_VERSION = "0.28.0";
