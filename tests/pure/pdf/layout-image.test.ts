// tests/pure/pdf/layout-image.test.ts
import { describe, it, expect } from 'vitest';
import { layoutDocument, DrawOp } from '../../../src/pure/pdf/layout';
import { DEFAULT_OPTIONS } from '../../../src/pure/pdf/options';
import { Block } from '../../../src/pure/pdf/ir';

const opts = () => JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;

describe('layoutDocument — image', () => {
  const img: Block = { type: 'image', data: new Uint8Array([1, 2, 3]), wPx: 2000, hPx: 1000 };
  it('emits an image op carrying the bytes', () => {
    const r = layoutDocument([img], opts());
    const im = r.ops.find(o => o.kind === 'image') as Extract<DrawOp, { kind: 'image' }>;
    expect(im).toBeTruthy();
    expect(im.data.length).toBe(3);
  });
  it('caps image width to the content width', () => {
    const r = layoutDocument([img], opts());
    const im = r.ops.find(o => o.kind === 'image') as Extract<DrawOp, { kind: 'image' }>;
    const contentW = 595.28 - (20 + 20) * 2.8346456693;
    expect(im.w).toBeLessThanOrEqual(contentW + 0.01);
  });
  it('preserves aspect ratio', () => {
    const r = layoutDocument([img], opts());
    const im = r.ops.find(o => o.kind === 'image') as Extract<DrawOp, { kind: 'image' }>;
    expect(im.h / im.w).toBeCloseTo(0.5, 3);
  });
});
