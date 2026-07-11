// src/pure/pdf/encoding.ts
// Pure PDF encoding helpers. No Obsidian, no DOM.
// Ported from obsidian-letterhead/main.js

/* Windows-1252 (WinAnsi) Sonderbereich 0x80–0x9F → JS-Codepoint. */
const WINANSI_HIGH: Record<number, number> = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

export function winAnsiBytes(str: string): number[] {
  const out: number[] = [];
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    if (cp! > 0xFFFF) i++; // surrogate pair → ein Codepoint, nicht abbildbar
    if (cp! <= 0x7F) out.push(cp!);
    else if (cp! >= 0xA0 && cp! <= 0xFF) out.push(cp!);     // Latin-1
    else if (WINANSI_HIGH[cp!] != null) out.push(WINANSI_HIGH[cp!]);
    else out.push(0x3F);                                  // '?'
  }
  return out;
}

export function pdfTextBytes(str: string): number[] {
  const out: number[] = [];
  for (const b of winAnsiBytes(str)) {
    if (b === 0x28 || b === 0x29 || b === 0x5C) out.push(0x5C);
    out.push(b);
  }
  return out;
}
