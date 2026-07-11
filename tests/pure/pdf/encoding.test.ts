import { describe, it, expect } from 'vitest';
import { winAnsiBytes, pdfTextBytes } from '../../../src/pure/pdf/encoding';

describe('winAnsiBytes', () => {
  it('maps ASCII 1:1', () => {
    expect(winAnsiBytes('AB')).toEqual([65, 66]);
  });
  it('maps Latin-1 umlauts', () => {
    expect(winAnsiBytes('ä')).toEqual([0xE4]);
  });
  it('maps euro sign to 0x80 (WinAnsi high range)', () => {
    expect(winAnsiBytes('€')).toEqual([0x80]);
  });
  it('replaces unmappable codepoints with ?', () => {
    expect(winAnsiBytes('☃')).toEqual([0x3F]);
  });
});

describe('pdfTextBytes', () => {
  it('escapes parentheses and backslash', () => {
    expect(pdfTextBytes('(a\\)')).toEqual([0x5C, 0x28, 0x61, 0x5C, 0x5C, 0x5C, 0x29]);
  });
});
