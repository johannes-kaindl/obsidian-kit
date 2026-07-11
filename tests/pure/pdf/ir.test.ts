import { describe, it, expect } from 'vitest';
import { inlineText, Block } from '../../../src/pure/pdf/ir';

describe('ir', () => {
  it('inlineText concatenates run text', () => {
    expect(inlineText([{ text: 'a' }, { text: 'b', bold: true }])).toBe('ab');
  });
  it('a heading block is well-typed', () => {
    const b: Block = { type: 'heading', level: 2, inlines: [{ text: 'Titel' }] };
    expect(b.type).toBe('heading');
  });
});
