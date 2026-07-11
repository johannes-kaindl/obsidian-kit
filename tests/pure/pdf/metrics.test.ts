import { describe, it, expect } from 'vitest';
import { textWidthPt, charWidth1000, BASE_FONTS } from '../../../src/pure/pdf/metrics';

describe('metrics', () => {
  it('Courier is fixed-width 600/1000', () => {
    expect(charWidth1000('cour', 65)).toBe(600);
    expect(charWidth1000('courB', 105)).toBe(600);
  });
  it('Helvetica space is 278/1000', () => {
    expect(charWidth1000('helv', 32)).toBe(278);
  });
  it('textWidthPt scales by size', () => {
    const a = textWidthPt('helv', 10, 'AAAA');
    const b = textWidthPt('helv', 20, 'AAAA');
    expect(b).toBeCloseTo(a * 2, 5);
  });
  it('BASE_FONTS maps keys to PDF base font names', () => {
    expect(BASE_FONTS.helvB).toBe('Helvetica-Bold');
    expect(BASE_FONTS.times).toBe('Times-Roman');
    expect(BASE_FONTS.cour).toBe('Courier');
  });
});
