// tests/pure/pdf/layout-frame.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

type TextOp = Extract<DrawOp, { kind: 'text' }>;
const isTextOp = (op: DrawOp): op is TextOp => op.kind === 'text';

describe('layoutDocument — frame', () => {
  it('renders a document title larger than an H1', () => {
    const o = opts(); o.frame.title = 'Mein Dokument';
    const doc: Block[] = [{ type: 'heading', level: 1, inlines: [{ text: 'H1' }] }];
    const r = layoutDocument(doc, o);
    const title = r.ops.filter(isTextOp).find((op) => op.str.includes('Mein Dokument'));
    const h1 = r.ops.filter(isTextOp).find((op) => op.str === 'H1');
    expect(title).toBeDefined();
    expect(h1).toBeDefined();
    expect(title!.sizePt).toBeGreaterThan(h1!.sizePt);
  });

  it('draws a running footer on every page when configured', () => {
    const o = opts(); o.frame.runningHeaderFooter = { position: 'footer', left: 'Titel', right: 'Datum' };
    const doc: Block[] = [];
    for (let i = 0; i < 200; i++) doc.push({ type: 'paragraph', inlines: [{ text: `z${i}` }] });
    const r = layoutDocument(doc, o);
    const footers = r.ops.filter(isTextOp).filter((op) => op.str === 'Titel');
    expect(footers.length).toBe(r.pageCount);
  });
});
