// tests/pure/pdf/wrap.test.ts
import { describe, it, expect } from 'vitest';
import { wrapRuns } from '../../../src/pure/pdf/wrap';

describe('wrapRuns', () => {
  it('keeps a short run on one line', () => {
    const lines = wrapRuns([{ text: 'hello world', fontKey: 'helv' }], 1000, 12);
    expect(lines.length).toBe(1);
    expect(lines[0].segments.map(s => s.text).join('')).toBe('hello world');
  });
  it('breaks across the width limit', () => {
    const lines = wrapRuns([{ text: 'aaaa bbbb cccc', fontKey: 'helv' }], 40, 12);
    expect(lines.length).toBeGreaterThan(1);
  });
  it('preserves font changes as separate segments', () => {
    const lines = wrapRuns([
      { text: 'nor ', fontKey: 'helv' },
      { text: 'bold', fontKey: 'helvB' },
    ], 1000, 12);
    expect(lines[0].segments.length).toBe(2);
    expect(lines[0].segments[1].fontKey).toBe('helvB');
  });
  it('keeps an overlong single word unbroken on its own line', () => {
    const lines = wrapRuns([{ text: 'supercalifragilistic', fontKey: 'helv' }], 10, 12);
    expect(lines.length).toBe(1);
  });
});
