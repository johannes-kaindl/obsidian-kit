// tests/pure/pdf/layout-code.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

describe('layoutDocument — code', () => {
  it('renders code in the mono font with a background rect', () => {
    const doc: Block[] = [{ type: 'code', text: 'const x = 1;' }];
    const r = layoutDocument(doc, opts());
    expect(r.ops.some(o => o.kind === 'rect')).toBe(true);
    const t = r.ops.find(o => o.kind === 'text') as Extract<DrawOp, { kind: 'text' }>;
    expect(t.fontKey).toBe('cour');
  });
  it('emits the background rect before the text op (paint order)', () => {
    const doc: Block[] = [{ type: 'code', text: 'x' }];
    const r = layoutDocument(doc, opts());
    const rectIdx = r.ops.findIndex(o => o.kind === 'rect');
    const textIdx = r.ops.findIndex((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text' && o.str === 'x');
    expect(rectIdx).toBeLessThan(textIdx);
  });
  it('hard-wraps overlong code lines', () => {
    const long = 'x'.repeat(400);
    const doc: Block[] = [{ type: 'code', text: long }];
    const r = layoutDocument(doc, opts());
    const codeTexts = r.ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text' && o.str.startsWith('x'));
    expect(codeTexts.length).toBeGreaterThan(1);
  });
});
