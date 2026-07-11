// src/pure/pdf/layout.ts
import { mmToPt, pageSizePt, hexToRgb01 } from './geometry';
import { textWidthPt } from './metrics';
import { wrapRuns, WrapRun } from './wrap';
import { Block, Inline, inlineText } from './ir';
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
  const RULE = hexToRgb01(options.colors.rule);
  const CODEBG = hexToRgb01(options.colors.codeBg);
  const TBORDER = hexToRgb01(options.colors.tableBorder);

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

  // Ordered/unordered list with nested children (indent grows per level).
  const renderListItems = (items: { inlines: Inline[]; children?: Block[] }[], ordered: boolean, level: number) => {
    const indent = mmToPt(6) * (level + 1);
    for (let i = 0; i < items.length; i++) {
      const marker = ordered ? `${i + 1}.` : '•';
      const markerRun: Inline = { text: marker + '  ' };
      const runs = [markerRun, ...items[i].inlines];
      emitInlines(runs, baseSize, null, TEXT, baseSize * 0.25, indent - mmToPt(6));
      for (const child of (items[i].children || [])) {
        if (child.type === 'list') renderListItems(child.items, child.ordered, level + 1);
        else renderBlockIndented(child, indent, TEXT);
      }
    }
    y -= baseSize * 0.4;
  };

  // Render a single block with an extra left indent (used by lists/blockquotes).
  const renderBlockIndented = (b: Block, indentPt: number, rgb: [number, number, number]) => {
    if (b.type === 'paragraph') emitInlines(b.inlines, baseSize, null, rgb, baseSize * 0.5, indentPt);
    else renderBlock(b); // headings/etc. inside items fall back to normal rendering
  };

  // Draw a muted vertical bar spanning the blockquote's text ops added since `fromOp`.
  const drawQuoteBars = (fromOp: number, barX: number) => {
    const byPage = new Map<number, { top: number; bot: number }>();
    for (let i = fromOp; i < ops.length; i++) {
      const o = ops[i];
      if (o.kind !== 'text') continue;
      const cur = byPage.get(o.page) || { top: -Infinity, bot: Infinity };
      cur.top = Math.max(cur.top, o.y + ASCENT * o.sizePt);
      cur.bot = Math.min(cur.bot, o.y);
      byPage.set(o.page, cur);
    }
    for (const [p, r] of byPage) ops.push({ page: p, kind: 'line', x1: barX, y1: r.bot, x2: barX, y2: r.top, wPt: 1.5, rgb: MUTED });
  };

  // Hard-wrap a mono line to the content width by character count.
  const wrapMono = (line: string, sz: number, maxWidthPt: number): string[] => {
    const charW = textWidthPt(F.mono, sz, 'M'); // Courier is fixed-width
    const maxChars = Math.max(1, Math.floor(maxWidthPt / charW));
    if (line.length <= maxChars) return [line];
    const out: string[] = [];
    for (let i = 0; i < line.length; i += maxChars) out.push(line.slice(i, i + maxChars));
    return out;
  };

  // Compute column widths: proportional to each column's longest cell text, capped to content width.
  const columnWidths = (header: { inlines: Inline[] }[], rows: { inlines: Inline[] }[][], sz: number): number[] => {
    const cols = header.length || (rows[0] ? rows[0].length : 0);
    if (cols === 0) return [];
    const natural: number[] = new Array<number>(cols).fill(mmToPt(12));
    const measure = (cells: { inlines: Inline[] }[]) => {
      for (let c = 0; c < cols; c++) {
        const txt = inlineText((cells[c] || { inlines: [] }).inlines);
        natural[c] = Math.max(natural[c], textWidthPt(F.body, sz, txt) + mmToPt(4));
      }
    };
    measure(header);
    for (const r of rows) measure(r);
    const sum = natural.reduce((a, b) => a + b, 0) || 1;
    return natural.map((w) => (w / sum) * contentWidthPt);
  };

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
      case 'list':
        renderListItems(b.items, b.ordered, 0);
        break;
      case 'blockquote': {
        const barX = leftPt + mmToPt(1.5);
        const savedIndent = mmToPt(4);
        // Render inner blocks indented; draw the quote bar afterwards for the spanned range.
        const before = ops.length;
        for (const inner of b.blocks) renderBlockIndented(inner, savedIndent, MUTED);
        // Draw a muted vertical bar on each page the quote spans.
        drawQuoteBars(before, barX);
        y -= baseSize * 0.3;
        break;
      }
      case 'hr': {
        const yy = advance(baseSize * lineH);
        const midY = yy + ASCENT * baseSize * 0.4;
        ops.push({ page, kind: 'line', x1: leftPt, y1: midY, x2: rightEdge, y2: midY, wPt: 0.5, rgb: RULE });
        break;
      }
      case 'code': {
        const sz = baseSize - 1;
        const padPt = mmToPt(2);
        const innerWidth = contentWidthPt - 2 * padPt;
        const rawLines = b.text.replace(/\n$/, '').split('\n');
        const wrapped: string[] = [];
        for (const ln of rawLines) wrapped.push(...wrapMono(ln, sz, innerWidth));
        y -= baseSize * 0.2;
        for (const ln of wrapped) {
          const lineHeightPt = sz * 1.35;
          // Reserve the line, then paint the background rect behind it (before) and the text (after) — PDF paints in stream order.
          const yy = advance(lineHeightPt);
          ops.push({ page, kind: 'rect', x: leftPt, y: yy - (lineHeightPt - ASCENT * sz), w: contentWidthPt, h: lineHeightPt, rgb: CODEBG });
          T(leftPt + padPt, yy, ln, F.mono, sz, TEXT);
        }
        y -= baseSize * 0.6;
        break;
      }
      case 'table': {
        const sz = baseSize - 1;
        const cols = columnWidths(b.header, b.rows, sz);
        const padPt = mmToPt(1.5);
        const drawRow = (cells: { inlines: Inline[]; align?: 'left' | 'center' | 'right' }[], headerRow: boolean) => {
          // Wrap each cell, find the tallest, reserve that height, then paint cells + borders.
          const wrapped = cols.map((cw, c) => {
            const cell = cells[c] || { inlines: [] };
            const runs: WrapRun[] = (cell.inlines.length ? cell.inlines : [{ text: '' }]).map((r) => ({ text: r.text, fontKey: headerRow ? F.bold : runFont(r) }));
            return wrapRuns(runs, cw - 2 * padPt, sz);
          });
          const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
          const rowH = maxLines * sz * lineH + 2 * padPt;
          const yTop = advance(rowH); // baseline slot for first line region
          const rowTopY = yTop + ASCENT * sz + padPt;
          const rowBotY = rowTopY - rowH;
          let x = leftPt;
          for (let c = 0; c < cols.length; c++) {
            if (headerRow) ops.push({ page, kind: 'rect', x, y: rowBotY, w: cols[c], h: rowH, rgb: hexToRgb01(options.colors.codeBg) });
            // cell text lines
            const lines = wrapped[c];
            for (let li = 0; li < lines.length; li++) {
              const ly = rowTopY - padPt - ASCENT * sz - li * sz * lineH;
              for (const seg of lines[li].segments) T(x + padPt + seg.xPt, ly, seg.text, seg.fontKey, sz, TEXT);
            }
            // vertical border
            ops.push({ page, kind: 'line', x1: x, y1: rowBotY, x2: x, y2: rowTopY, wPt: 0.4, rgb: TBORDER });
            x += cols[c];
          }
          // right border + horizontal borders
          ops.push({ page, kind: 'line', x1: x, y1: rowBotY, x2: x, y2: rowTopY, wPt: 0.4, rgb: TBORDER });
          ops.push({ page, kind: 'line', x1: leftPt, y1: rowTopY, x2: x, y2: rowTopY, wPt: 0.4, rgb: TBORDER });
          ops.push({ page, kind: 'line', x1: leftPt, y1: rowBotY, x2: x, y2: rowBotY, wPt: 0.4, rgb: TBORDER });
        };
        y -= baseSize * 0.2;
        if (b.header.length) drawRow(b.header, true);
        for (const r of b.rows) drawRow(r, false);
        y -= baseSize * 0.6;
        break;
      }
      case 'unsupported':
        emitInlines([{ text: b.text }], baseSize, () => F.italic, MUTED, paraGap, 0);
        break;
      case 'image': {
        const maxW = contentWidthPt * (options.image.maxWidthPct / 100);
        const ratio = b.hPx / Math.max(1, b.wPx);
        let wPt = Math.min(maxW, mmToPt(b.wPx * 0.264583)); // px→mm at 96dpi as a natural cap
        if (wPt < mmToPt(10)) wPt = maxW; // tiny natural size → fill available width
        let hPt = wPt * ratio;
        const maxH = (topYFirst - bottomY) * 0.9;
        if (hPt > maxH) { hPt = maxH; wPt = hPt / ratio; }
        // Reserve the image height (page-break if needed) and place from the top of the slot.
        const yTop = advance(hPt + baseSize * 0.6);
        const imgBottom = yTop + ASCENT * baseSize - hPt;
        ops.push({ page, kind: 'image', data: b.data, wPx: b.wPx, hPx: b.hPx, x: leftPt, y: imgBottom, w: wPt, h: hPt });
        break;
      }
      default:
        break; // other block types added in later tasks
    }
  };

  if (options.frame.title) {
    const sz = baseSize * Math.pow(hScale, 7); // larger than H1
    emitInlines([{ text: options.frame.title }], sz, () => F.bold, TEXT, baseSize * 0.9, 0);
  }

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

  const hf = options.frame.runningHeaderFooter;
  if (hf) {
    const pageCount = page + 1;
    const sz = baseSize - 3;
    const yPos = hf.position === 'header' ? PAGE_H - mmToPt(m.top) + mmToPt(6) : bottomY - mmToPt(11);
    for (let p = 0; p < pageCount; p++) {
      if (hf.left) ops.push({ page: p, kind: 'text', x: leftPt, y: yPos, str: hf.left, fontKey: F.body, sizePt: sz, rgb: MUTED });
      if (hf.center) { const w = textWidthPt(F.body, sz, hf.center); ops.push({ page: p, kind: 'text', x: (PAGE_W - w) / 2, y: yPos, str: hf.center, fontKey: F.body, sizePt: sz, rgb: MUTED }); }
      if (hf.right) { const w = textWidthPt(F.body, sz, hf.right); ops.push({ page: p, kind: 'text', x: rightEdge - w, y: yPos, str: hf.right, fontKey: F.body, sizePt: sz, rgb: MUTED }); }
    }
  }

  return { pageCount: page + 1, ops };
}
