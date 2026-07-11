// tests/pure/pdf/layout-table.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

const isText = (o: DrawOp): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text';

describe('layoutDocument — table', () => {
  const table: Block = {
    type: 'table',
    header: [{ inlines: [{ text: 'A' }] }, { inlines: [{ text: 'B' }] }],
    rows: [
      [{ inlines: [{ text: 'a1' }] }, { inlines: [{ text: 'b1' }] }],
      [{ inlines: [{ text: 'a2' }] }, { inlines: [{ text: 'b2' }] }],
    ],
  };
  it('renders header and cell text', () => {
    const r = layoutDocument([table], opts());
    const strs = r.ops.filter(isText).map((o) => o.str);
    expect(strs).toContain('A');
    expect(strs).toContain('a1');
    expect(strs).toContain('b2');
  });
  it('draws grid border lines', () => {
    const r = layoutDocument([table], opts());
    expect(r.ops.filter((o) => o.kind === 'line').length).toBeGreaterThan(3);
  });
  it('splits long tables across pages', () => {
    const rows: { inlines: { text: string }[] }[][] = [];
    for (let i = 0; i < 120; i++) rows.push([{ inlines: [{ text: `r${i}` }] }, { inlines: [{ text: 'x' }] }]);
    const big: Block = { type: 'table', header: [{ inlines: [{ text: 'H' }] }, { inlines: [{ text: 'H2' }] }], rows };
    const r = layoutDocument([big], opts());
    expect(r.pageCount).toBeGreaterThan(1);
  });
});
