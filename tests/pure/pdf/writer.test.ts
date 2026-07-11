import { describe, it, expect } from 'vitest';
import { PdfWriter } from '../../../src/pure/pdf/writer';

function decode(u8: Uint8Array): string {
  let s = ''; for (const b of u8) s += String.fromCharCode(b); return s;
}

describe('PdfWriter', () => {
  it('emits a valid PDF header, xref and trailer', () => {
    const w = new PdfWriter();
    const p = w.addPage();
    p.text(72, 700, 'Hallo €', 'helv', 12, [0, 0, 0]);
    const bytes = w.build();
    const s = decode(bytes);
    expect(s.startsWith('%PDF-1.7')).toBe(true);
    expect(s).toContain('/Type /Catalog');
    expect(s).toContain('/BaseFont /Helvetica');
    expect(s).toContain('startxref');
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('encodes the euro sign as WinAnsi 0x80 in the content stream', () => {
    const w = new PdfWriter();
    w.addPage().text(72, 700, '€', 'helv', 12, [0, 0, 0]);
    const s = decode(w.build());
    expect(s).toContain(String.fromCharCode(0x80));
  });
  it('emits a fill-rect operator', () => {
    const w = new PdfWriter();
    w.addPage().rect(10, 10, 100, 20, [0.9, 0.9, 0.9]);
    expect(decode(w.build())).toContain(' re f');
  });
  it('honours a custom page size in the MediaBox', () => {
    const w = new PdfWriter(612, 792);
    w.addPage();
    expect(decode(w.build())).toContain('/MediaBox [0 0 612 792]');
  });
});
