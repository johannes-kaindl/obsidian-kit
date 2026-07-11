// tests/pure/pdf/render.test.ts
import { describe, it, expect } from 'vitest';
import { renderPdf, DEFAULT_OPTIONS } from '../../../src/pure/pdf/index';
import { Block } from '../../../src/pure/pdf/ir';

function decode(u8: Uint8Array): string { let s = ''; for (const b of u8) s += String.fromCharCode(b); return s; }

describe('renderPdf', () => {
  it('produces a valid PDF from a mixed document', () => {
    const doc: Block[] = [
      { type: 'heading', level: 1, inlines: [{ text: 'Titel' }] },
      { type: 'paragraph', inlines: [{ text: 'Ein ' }, { text: 'fetter', bold: true }, { text: ' Absatz.' }] },
      { type: 'list', ordered: false, items: [{ inlines: [{ text: 'Punkt' }] }] },
      { type: 'code', text: 'x = 1' },
    ];
    const bytes = renderPdf(doc, DEFAULT_OPTIONS);
    const s = decode(bytes);
    expect(s.startsWith('%PDF-1.7')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('embeds an image XObject when the doc has an image', () => {
    const doc: Block[] = [{ type: 'image', data: new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]), wPx: 100, hPx: 50 }];
    const s = decode(renderPdf(doc, DEFAULT_OPTIONS));
    expect(s).toContain('/Subtype /Image');
    expect(s).toContain('/Filter /DCTDecode');
  });
});
