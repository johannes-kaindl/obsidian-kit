// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { domToIrSync, resolveImages } from '../../../src/pure/pdf/dom-to-ir';
import { codePlaceholder, parseCodePlaceholder } from '../../../src/pure/pdf/code-blocks';
import type { Block, Inline } from '../../../src/pure/pdf/ir';

type ParagraphBlock = Extract<Block, { type: 'paragraph' }>;
type ListBlock = Extract<Block, { type: 'list' }>;
type TableBlock = Extract<Block, { type: 'table' }>;

function dom(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

const resolve = (t: string) => parseCodePlaceholder(t, 'TESTCODE');

describe('domToIrSync', () => {
  it('maps headings with levels', () => {
    const { blocks } = domToIrSync(dom('<h2>Titel</h2>'));
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('maps a paragraph with bold and italic runs', () => {
    const { blocks } = domToIrSync(dom('<p>a <strong>b</strong> <em>c</em></p>'));
    const p = blocks[0] as ParagraphBlock;
    expect(p.type).toBe('paragraph');
    expect(p.inlines.some((r: Inline) => r.bold)).toBe(true);
    expect(p.inlines.some((r: Inline) => r.italic)).toBe(true);
  });

  it('maps nested lists', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as ListBlock;
    expect(list.type).toBe('list');
    expect(list.items[0].children![0].type).toBe('list');
  });

  it('does not duplicate nested list text into the parent item inlines', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as ListBlock;
    const childList = list.items[0].children![0] as ListBlock;
    const childItem = childList.items[0];
    const childText = childItem.inlines.map((r: Inline) => r.text).join('');
    expect(childText).toBe('child');
  });

  it('maps a fenced code block with language', () => {
    const { blocks } = domToIrSync(dom('<pre><code class="language-js">x=1</code></pre>'));
    expect(blocks[0]).toMatchObject({ type: 'code', lang: 'js' });
  });

  it('maps a table with header and rows', () => {
    const { blocks } = domToIrSync(dom('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>a1</td></tr></tbody></table>'));
    const t = blocks[0] as TableBlock;
    expect(t.type).toBe('table');
    expect(t.header.length).toBe(1);
    expect(t.rows.length).toBe(1);
  });

  it('collects image placeholders + refs', () => {
    const { blocks, imageEls } = domToIrSync(dom('<p><img src="x.png" alt="A"></p>'));
    expect(blocks.some((b) => b.type === 'image')).toBe(true);
    expect(imageEls.length).toBe(1);
  });

  it('turns a placeholder paragraph back into its extracted code block', () => {
    const { blocks } = domToIrSync(dom(`<p>${codePlaceholder('TESTCODE', 0)}</p>`), {
      codes: [{ lang: 'json', text: '{"a":1}' }],
      resolvePlaceholder: resolve,
    });
    expect(blocks).toEqual([{ type: 'code', lang: 'json', text: '{"a":1}' }]);
  });

  it('resolves placeholders by index, not by order of appearance', () => {
    const { blocks } = domToIrSync(
      dom(`<p>${codePlaceholder('TESTCODE', 1)}</p><p>${codePlaceholder('TESTCODE', 0)}</p>`),
      { codes: [{ lang: 'js', text: 'first' }, { lang: 'py', text: 'second' }], resolvePlaceholder: resolve },
    );
    expect(blocks).toEqual([
      { type: 'code', lang: 'py', text: 'second' },
      { type: 'code', lang: 'js', text: 'first' },
    ]);
  });

  it('leaves a placeholder-looking paragraph alone when no such code exists', () => {
    const { blocks } = domToIrSync(dom(`<p>${codePlaceholder('TESTCODE', 7)}</p>`), {
      codes: [],
      resolvePlaceholder: resolve,
    });
    expect(blocks[0].type).toBe('paragraph');
  });

  it('ignores placeholders when no resolvePlaceholder is passed', () => {
    const { blocks } = domToIrSync(dom(`<p>${codePlaceholder('TESTCODE', 0)}</p>`), {
      codes: [{ lang: 'json', text: '{"a":1}' }],
    });
    expect(blocks[0].type).toBe('paragraph');
  });

  it('inserts a pagebreak on the marker paragraph', () => {
    const { blocks } = domToIrSync(dom('<p>vor</p><p>---BREAK---</p><p>nach</p>'), { pageBreakMarker: '---BREAK---' });
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'pagebreak', 'paragraph']);
  });
});

describe('resolveImages', () => {
  it('resolves an image block via the decode callback', async () => {
    const el = document.createElement('img');
    el.src = 'x.png';
    const { blocks } = await resolveImages(
      [{ type: 'image', data: new Uint8Array(0), wPx: 0, hPx: 0 }],
      [el],
      () => Promise.resolve({ data: new Uint8Array([1]), wPx: 10, hPx: 20 }),
    );
    expect(blocks[0]).toEqual({ type: 'image', data: new Uint8Array([1]), wPx: 10, hPx: 20, alt: undefined });
  });

  it('degrades to unsupported when decode fails', async () => {
    const el = document.createElement('img');
    el.src = 'x.png';
    const { blocks, unsupportedAdded } = await resolveImages(
      [{ type: 'image', data: new Uint8Array(0), wPx: 0, hPx: 0, alt: 'Logo' }],
      [el],
      () => Promise.resolve(null),
    );
    expect(unsupportedAdded).toBe(1);
    expect(blocks[0]).toMatchObject({ type: 'unsupported' });
  });
});
