import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import type { Block } from '../../../src/pure/pdf/ir';

type TextOp = Extract<DrawOp, { kind: 'text' }>;
const isText = (o: DrawOp): o is TextOp => o.kind === 'text';

const para = (t: string): Block => ({ type: 'paragraph', inlines: [{ text: t }] });

describe('layoutDocument — embeddable cursor', () => {
  it('honours startY as the first baseline on page 0', () => {
    const opts = { ...DEFAULT_OPTIONS, page: { ...DEFAULT_OPTIONS.page, startY: 400 } };
    const r = layoutDocument([para('A')], opts);
    const firstText = r.ops.find(isText) as TextOp;
    expect(firstText.page).toBe(0);
    // baseline of first line sits at startY (no ASCENT offset re-applied twice)
    expect(firstText.y).toBeCloseTo(400, 1);
  });

  it('returns an end cursor', () => {
    const r = layoutDocument([para('A'), para('B')], DEFAULT_OPTIONS);
    expect(typeof r.endPage).toBe('number');
    expect(typeof r.endY).toBe('number');
    expect(r.endY).toBeLessThan(841.89); // below page top
  });

  it('uses followTopMm for the top of continuation pages', () => {
    // Force a page break with many paragraphs, small startY near the bottom.
    const many: Block[] = Array.from({ length: 60 }, (_, i) => para('line ' + i));
    const opts = { ...DEFAULT_OPTIONS, page: { ...DEFAULT_OPTIONS.page, followTopMm: 25 } };
    const r = layoutDocument(many, opts);
    expect(r.pageCount).toBeGreaterThan(1);
    // first text op on page 1 must sit near (pageH - 25mm), not (pageH - marginTop)
    const PT = 2.8346456693, pageH = 841.89;
    const p1 = r.ops.filter((o): o is TextOp => isText(o) && o.page === 1);
    expect(p1.length).toBeGreaterThan(0);
    expect(p1[0].y).toBeLessThan(pageH - 25 * PT); // below the 25mm top edge
    expect(p1[0].y).toBeGreaterThan(pageH - 40 * PT); // but near it
  });

  it('is byte-compatible without the new fields (regression)', () => {
    const r = layoutDocument([para('A')], DEFAULT_OPTIONS);
    const firstText = r.ops.find(isText) as TextOp;
    // default first baseline = topYFirst - ASCENT*baseSize (existing behaviour)
    expect(firstText.y).toBeGreaterThan(700);
  });
});
