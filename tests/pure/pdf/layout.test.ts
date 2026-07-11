// tests/pure/pdf/layout.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

describe('layoutDocument — core', () => {
  it('lays out a single paragraph on one page', () => {
    const doc: Block[] = [{ type: 'paragraph', inlines: [{ text: 'Hallo Welt' }] }];
    const r = layoutDocument(doc, opts());
    expect(r.pageCount).toBe(1);
    expect(r.ops.some(o => o.kind === 'text' && o.str.includes('Hallo'))).toBe(true);
  });
  it('paginates a long body across multiple pages', () => {
    const doc: Block[] = [];
    for (let i = 0; i < 200; i++) doc.push({ type: 'paragraph', inlines: [{ text: `Zeile ${i}` }] });
    const r = layoutDocument(doc, opts());
    expect(r.pageCount).toBeGreaterThan(1);
  });
  it('renders a heading bold and larger than body', () => {
    const doc: Block[] = [{ type: 'heading', level: 1, inlines: [{ text: 'Überschrift' }] }];
    const r = layoutDocument(doc, opts());
    const t = r.ops.find(o => o.kind === 'text') as Extract<DrawOp, { kind: 'text' }>;
    expect(t.fontKey).toBe('helvB');
    expect(t.sizePt).toBeGreaterThan(DEFAULT_OPTIONS.fonts.baseSizePt);
  });
  it('adds a centred page number per page when enabled', () => {
    const doc: Block[] = [{ type: 'paragraph', inlines: [{ text: 'x' }] }];
    const r = layoutDocument(doc, opts());
    expect(r.ops.some(o => o.kind === 'text' && o.str === '1')).toBe(true);
  });
  it('omits page numbers when disabled', () => {
    const o = opts(); o.frame.pageNumbers = false;
    const doc: Block[] = [{ type: 'paragraph', inlines: [{ text: 'x' }] }];
    const r = layoutDocument(doc, o);
    expect(r.ops.some(op => op.kind === 'text' && op.str === '1')).toBe(false);
  });
  it('renders unsupported blocks as italic muted text (degradation)', () => {
    const doc: Block[] = [{ type: 'unsupported', text: '[callout]' }];
    const r = layoutDocument(doc, opts());
    const t = r.ops.find(o => o.kind === 'text' && o.str.includes('callout')) as Extract<DrawOp, { kind: 'text' }>;
    expect(t.fontKey).toBe('helvI');
  });
});
