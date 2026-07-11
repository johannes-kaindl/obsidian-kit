import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

describe('layoutDocument — metadata block', () => {
  const md: Block = { type: 'metadata', entries: [
    { key: 'type', value: 'Cockpit' },
    { key: 'status', value: 'Evergreen' },
  ] };
  it('renders each key (muted) and value (text)', () => {
    const r = layoutDocument([md], opts());
    const texts = r.ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text');
    const strs = texts.map(t => t.str);
    expect(strs).toContain('type');
    expect(strs).toContain('Cockpit');
    const keyOp = texts.find(t => t.str === 'type')!;
    const valOp = texts.find(t => t.str === 'Cockpit')!;
    expect(valOp.x).toBeGreaterThan(keyOp.x);           // value sits in a right-hand column
    expect(keyOp.rgb).not.toEqual(valOp.rgb);           // key muted, value text colour
  });
  it('draws a hairline rule below the block', () => {
    const r = layoutDocument([md], opts());
    expect(r.ops.some(o => o.kind === 'line')).toBe(true);
  });
  it('renders nothing for an empty metadata block', () => {
    const o = opts(); o.frame.pageNumbers = false;
    const r = layoutDocument([{ type: 'metadata', entries: [] }], o);
    expect(r.ops.length).toBe(0);
  });
});
