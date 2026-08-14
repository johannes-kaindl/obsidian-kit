import { describe, it, expect } from 'vitest';
import { extractCodeBlocks, codePlaceholder, parseCodePlaceholder } from '../../../src/pure/pdf/code-blocks';

describe('extractCodeBlocks', () => {
  it('replaces a fenced block with a placeholder and returns its code', () => {
    const md = 'Vorher\n\n```json\n{"a":1}\n```\n\nNachher';

    const r = extractCodeBlocks(md, 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'json', text: '{"a":1}' }]);
    expect(r.markdown).toBe(`Vorher\n\n${codePlaceholder('TESTCODE', 0)}\n\nNachher`);
  });

  it('handles tilde fences (~~~json is hijacked just like ```json)', () => {
    const r = extractCodeBlocks('~~~json\n{"a":1}\n~~~', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'json', text: '{"a":1}' }]);
    expect(r.markdown).toBe(codePlaceholder('TESTCODE', 0));
  });

  it('handles a fence without a language', () => {
    const r = extractCodeBlocks('```\nplain\n```', 'TESTCODE');

    expect(r.codes).toEqual([{ text: 'plain' }]);
    expect(r.markdown).toBe(codePlaceholder('TESTCODE', 0));
  });

  it('extracts an indented fence inside a list item', () => {
    const r = extractCodeBlocks('- Punkt\n\n    ```json\n    {"a":1}\n    ```\n', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'json', text: '{"a":1}' }]);
    expect(r.markdown).toContain(codePlaceholder('TESTCODE', 0));
    expect(r.markdown).not.toContain('```');
  });

  it('keeps a longer fence intact when it contains a triple backtick', () => {
    const r = extractCodeBlocks('````md\nText mit ``` darin\n````', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'md', text: 'Text mit ``` darin' }]);
    expect(r.markdown).toBe(codePlaceholder('TESTCODE', 0));
  });

  it('numbers multiple blocks independently', () => {
    const r = extractCodeBlocks('```js\na\n```\n\nText\n\n```py\nb\n```', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'js', text: 'a' }, { lang: 'py', text: 'b' }]);
    expect(r.markdown).toBe(`${codePlaceholder('TESTCODE', 0)}\n\nText\n\n${codePlaceholder('TESTCODE', 1)}`);
  });

  it('leaves inline code untouched', () => {
    const md = 'Ein `inline` und noch `einer` im Satz.';

    const r = extractCodeBlocks(md, 'TESTCODE');

    expect(r.codes).toEqual([]);
    expect(r.markdown).toBe(md);
  });

  // A fenced block may interrupt a paragraph in CommonMark/Obsidian. Without blank-line
  // padding the placeholder ends up inside the neighbouring paragraph (soft break), and the
  // consumer — which matches a *lone* placeholder paragraph — no longer recognises it: the
  // code is dropped and the raw placeholder is printed instead.
  it('pads the placeholder when a fence hugs the preceding text', () => {
    const r = extractCodeBlocks('Text:\n```js\ncode\n```\n', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'js', text: 'code' }]);
    expect(r.markdown).toBe(`Text:\n\n${codePlaceholder('TESTCODE', 0)}\n`);
  });

  it('pads the placeholder when text hugs the closing fence', () => {
    const r = extractCodeBlocks('```js\ncode\n```\nDanach', 'TESTCODE');

    expect(r.codes).toEqual([{ lang: 'js', text: 'code' }]);
    expect(r.markdown).toBe(`${codePlaceholder('TESTCODE', 0)}\n\nDanach`);
  });

  it('leaves an unclosed fence alone rather than swallowing the rest', () => {
    const md = 'Text\n\n```json\nnie geschlossen';

    const r = extractCodeBlocks(md, 'TESTCODE');

    expect(r.codes).toEqual([]);
    expect(r.markdown).toBe(md);
  });
});

describe('parseCodePlaceholder', () => {
  it('recognizes only its own prefix', () => {
    expect(parseCodePlaceholder('TESTCODE0', 'TESTCODE')).toBe(0);
    expect(parseCodePlaceholder('OTHERCODE0', 'TESTCODE')).toBe(null);
  });

  it('returns null for non-placeholder text', () => {
    expect(parseCodePlaceholder('Ein normaler Absatz', 'TESTCODE')).toBe(null);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseCodePlaceholder('  TESTCODE3  ', 'TESTCODE')).toBe(3);
  });
});
