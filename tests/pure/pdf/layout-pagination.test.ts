import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;
const fill = (n: number): Block[] => Array.from({ length: n }, (_, i) => ({ type: 'paragraph', inlines: [{ text: `Zeile ${i}` }] }));

describe('pagination — pagebreak + keep-together', () => {
  it('pagebreak forces a new page; following content lands on the next page', () => {
    const doc: Block[] = [{ type: 'paragraph', inlines: [{ text: 'A' }] }, { type: 'pagebreak' }, { type: 'paragraph', inlines: [{ text: 'B' }] }];
    const r = layoutDocument(doc, opts());
    expect(r.pageCount).toBe(2);
    const b = r.ops.find(o => o.kind === 'text' && o.str === 'B') as Extract<DrawOp,{kind:'text'}>;
    expect(b.page).toBe(1);
  });
  it('keeps an image together: breaks before it when it would not fit here but fits on a fresh page', () => {
    // large image near page end → pushed to page 2 (not split/overflowing)
    const doc: Block[] = [...fill(60), { type: 'image', data: new Uint8Array([1]), wPx: 1000, hPx: 1400 }];
    const r = layoutDocument(doc, opts());
    const img = r.ops.find(o => o.kind === 'image') as Extract<DrawOp,{kind:'image'}>;
    // image bottom must be >= bottom margin (did not overflow past page bottom)
    const bottomYpt = 20 * 2.8346456693;
    expect(img.y).toBeGreaterThanOrEqual(bottomYpt - 0.5);
  });
  it('keepImagesTogether off → old behaviour still produces a valid image op', () => {
    const o = opts(); o.pagination.keepImagesTogether = false;
    const r = layoutDocument([{ type: 'image', data: new Uint8Array([1]), wPx: 100, hPx: 50 }], o);
    expect(r.ops.some(op => op.kind === 'image')).toBe(true);
  });
  it('keeps a heading with the next lines: a heading near page-end moves to the next page with its content', () => {
    const doc: Block[] = [...fill(30), { type: 'heading', level: 2, inlines: [{ text: 'Abschnitt' }] }, { type: 'paragraph', inlines: [{ text: 'Folgeabsatz mit genug Text um mehrere Zeilen zu erzeugen '.repeat(3) }] }];
    const r = layoutDocument(doc, opts());
    const h = r.ops.find((o): o is Extract<DrawOp,{kind:'text'}> => o.kind === 'text' && o.str === 'Abschnitt')!;
    const para = r.ops.filter((o): o is Extract<DrawOp,{kind:'text'}> => o.kind === 'text' && o.str.startsWith('Folgeabsatz'));
    // heading and the first line of its following paragraph share a page (no orphan heading)
    expect(para.length).toBeGreaterThan(0);
    expect(h.page).toBe(para[0].page);
  });
  it('headingKeepWithLines 0 → heading may sit at the very bottom (old behaviour)', () => {
    const o = opts(); o.pagination.headingKeepWithLines = 0;
    const doc: Block[] = [...fill(3), { type: 'heading', level: 2, inlines: [{ text: 'X' }] }];
    const r = layoutDocument(doc, o);
    expect(r.ops.some(op => op.kind === 'text' && op.str === 'X')).toBe(true);
  });
});
