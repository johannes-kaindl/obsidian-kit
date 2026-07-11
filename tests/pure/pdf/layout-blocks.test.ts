// tests/pure/pdf/layout-blocks.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;
const texts = (r: { ops: DrawOp[] }) => r.ops.filter(o => o.kind === 'text').map(o => (o as any).str);

describe('layoutDocument — lists/quote/hr', () => {
  it('renders a bullet marker for unordered lists', () => {
    const doc: Block[] = [{ type: 'list', ordered: false, items: [{ inlines: [{ text: 'eins' }] }] }];
    expect(texts(layoutDocument(doc, opts())).some(s => s.includes('•'))).toBe(true);
  });
  it('renders numbered markers for ordered lists', () => {
    const doc: Block[] = [{ type: 'list', ordered: true, items: [
      { inlines: [{ text: 'a' }] }, { inlines: [{ text: 'b' }] },
    ] }];
    const t = texts(layoutDocument(doc, opts()));
    expect(t.some(s => s.includes('1.'))).toBe(true);
    expect(t.some(s => s.includes('2.'))).toBe(true);
  });
  it('renders nested list items further indented', () => {
    const doc: Block[] = [{ type: 'list', ordered: false, items: [
      { inlines: [{ text: 'top' }], children: [
        { type: 'list', ordered: false, items: [{ inlines: [{ text: 'child' }] }] },
      ] },
    ] }];
    const r = layoutDocument(doc, opts());
    const top = r.ops.find(o => o.kind === 'text' && (o as any).str.includes('top')) as any;
    const child = r.ops.find(o => o.kind === 'text' && (o as any).str.includes('child')) as any;
    expect(child.x).toBeGreaterThan(top.x);
  });
  it('draws a horizontal rule as a line op', () => {
    const doc: Block[] = [{ type: 'hr' }];
    expect(layoutDocument(doc, opts()).ops.some(o => o.kind === 'line')).toBe(true);
  });
  it('draws a quote bar line for blockquotes', () => {
    const doc: Block[] = [{ type: 'blockquote', blocks: [{ type: 'paragraph', inlines: [{ text: 'zitat' }] }] }];
    const r = layoutDocument(doc, opts());
    expect(r.ops.some(o => o.kind === 'line')).toBe(true);
    expect(texts(r).some(s => s.includes('zitat'))).toBe(true);
  });
});
