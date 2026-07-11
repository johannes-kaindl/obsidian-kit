// src/pure/pdf/layout.ts
import { mmToPt, pageSizePt, hexToRgb01 } from './geometry';
import { textWidthPt } from './metrics';
import { wrapRuns, WrapRun } from './wrap';
import { Block, Inline } from './ir';
import { LayoutOptions, fontSet } from './options';

export type DrawOp =
  | { page: number; kind: 'text'; x: number; y: number; str: string; fontKey: string; sizePt: number; rgb: [number, number, number] }
  | { page: number; kind: 'line'; x1: number; y1: number; x2: number; y2: number; wPt: number; rgb: [number, number, number] }
  | { page: number; kind: 'rect'; x: number; y: number; w: number; h: number; rgb: [number, number, number] }
  | { page: number; kind: 'image'; data: Uint8Array; wPx: number; hPx: number; x: number; y: number; w: number; h: number };

export interface LayoutResult { pageCount: number; ops: DrawOp[] }

const ASCENT = 0.78;

export function layoutDocument(doc: Block[], options: LayoutOptions): LayoutResult {
  const { wPt: PAGE_W, hPt: PAGE_H } = pageSizePt(options.page.size);
  const m = options.page.marginMm;
  const leftPt = mmToPt(m.left);
  const rightEdge = PAGE_W - mmToPt(m.right);
  const contentWidthPt = rightEdge - leftPt;
  const topYFirst = PAGE_H - mmToPt(m.top);
  const bottomY = mmToPt(m.bottom);

  const F = fontSet(options.fonts.body);
  const baseSize = options.fonts.baseSizePt;
  const lineH = options.fonts.lineHeight;
  const hScale = options.fonts.headingScale;
  const TEXT = hexToRgb01(options.colors.text);
  const MUTED = hexToRgb01(options.colors.muted);

  const ops: DrawOp[] = [];
  let page = 0;
  let y = topYFirst - ASCENT * baseSize; // baseline of the first line

  const T = (x: number, yy: number, str: string, fontKey: string, sz: number, rgb: [number, number, number]) => {
    if (str !== '' && str != null) ops.push({ page, kind: 'text', x, y: yy, str: String(str), fontKey, sizePt: sz, rgb });
  };

  // Move the cursor down by h pt; page-break if it would cross the bottom margin.
  const advance = (h: number): number => {
    if (y - h < bottomY) { page += 1; y = topYFirst - ASCENT * baseSize; }
    const yy = y; y -= h; return yy;
  };

  // Resolve an inline run to a font key for the given base set.
  const runFont = (r: Inline): string => {
    if (r.code) return F.mono;
    if (r.bold && r.italic) return F.boldItalic;
    if (r.bold) return F.bold;
    if (r.italic) return F.italic;
    return F.body;
  };

  // Emit a wrapped run-block at the current cursor, then a gap.
  const emitInlines = (inlines: Inline[], sz: number, fontOverride: ((r: Inline) => string) | null, rgb: [number, number, number], gapAfter: number, indentPt: number) => {
    const runs: WrapRun[] = (inlines.length ? inlines : [{ text: '' }]).map((r) => ({ text: r.text, fontKey: fontOverride ? fontOverride(r) : runFont(r) }));
    const lines = wrapRuns(runs, contentWidthPt - indentPt, sz);
    for (const ln of lines) {
      const yy = advance(sz * lineH);
      for (const seg of ln.segments) T(leftPt + indentPt + seg.xPt, yy, seg.text, seg.fontKey, sz, rgb);
    }
    y -= gapAfter;
  };

  const paraGap = baseSize * 0.7;

  const renderBlock = (b: Block) => {
    switch (b.type) {
      case 'heading': {
        const sz = baseSize * Math.pow(hScale, 7 - b.level); // H1 largest
        y -= baseSize * 0.4; // space above heading
        emitInlines(b.inlines, sz, () => F.bold, TEXT, baseSize * 0.35, 0);
        break;
      }
      case 'paragraph':
        emitInlines(b.inlines, baseSize, null, TEXT, paraGap, 0);
        break;
      case 'unsupported':
        emitInlines([{ text: b.text }], baseSize, () => F.italic, MUTED, paraGap, 0);
        break;
      default:
        break; // other block types added in later tasks
    }
  };

  for (const b of doc) renderBlock(b);

  // Page numbers (footer, centred) — drawn after content so pageCount is known.
  if (options.frame.pageNumbers) {
    const pageCount = page + 1;
    const sz = baseSize - 2;
    for (let p = 0; p < pageCount; p++) {
      const label = String(p + 1);
      const w = textWidthPt(F.body, sz, label);
      ops.push({ page: p, kind: 'text', x: (PAGE_W - w) / 2, y: bottomY - mmToPt(6), str: label, fontKey: F.body, sizePt: sz, rgb: MUTED });
    }
  }

  return { pageCount: page + 1, ops };
}
