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

// Regression 2026-08-04 (Paperize-Geräteabnahme): grafisch gerenderte Elemente — MathJax,
// Mermaid & Co. — tragen keinen Textknoten. Der Fallback-Zweig prüfte nur `textContent`,
// also verschwanden sie **spurlos und ungezählt**: kein Block, kein Platzhalter, und weil
// der Zähler bei 0 blieb, auch keine Sammel-Notice. Stiller Verlust ist schlimmer als
// sichtbare Vereinfachung — dem PDF sah man nicht an, dass etwas fehlte.
describe('domToIrSync — grafisch gerenderte Elemente', () => {
  const mathBlock = '<div class="math math-block"><mjx-container><svg><g></g></svg></mjx-container></div>';

  it('turns a block-level formula into a counted unsupported block', () => {
    const { blocks, unsupportedCount } = domToIrSync(dom(mathBlock));
    expect(unsupportedCount).toBe(1);
    expect(blocks[0]).toMatchObject({ type: 'unsupported' });
  });

  it('leaves a visible placeholder where an inline formula was', () => {
    const { blocks, unsupportedCount } = domToIrSync(
      dom('<p>Energie <span class="math math-inline"><mjx-container><svg></svg></mjx-container></span> pro Masse</p>'),
    );
    const p = blocks[0] as ParagraphBlock;
    expect(p.type).toBe('paragraph');
    const text = p.inlines.map((r: Inline) => r.text).join('');
    expect(text).toContain('Energie');
    expect(text).toContain('pro Masse');
    expect(text).toMatch(/\[.+\]/); // irgendein sichtbarer Platzhalter dazwischen
    expect(unsupportedCount).toBe(1);
  });

  it('counts a bare svg that carries no text', () => {
    const { unsupportedCount } = domToIrSync(dom('<figure><svg><circle /></svg></figure>'));
    expect(unsupportedCount).toBe(1);
  });

  // Dekoratives Beiwerk ist kein Inhaltsverlust: Obsidians Callout-Titel traegt ein
  // Lucide-Icon, das nach dem ersten Fix als „[Grafik]" im PDF landete und den Zaehler
  // hochtrieb — Rauschen an einer Stelle, an der nichts fehlte (echter Export 2026-08-04).
  // Erkannt wird es an denselben zwei Merkmalen, die Icons ueberall tragen: `aria-hidden`
  // (W3C-Konvention fuer „rein dekorativ") und `icon` im Klassennamen.
  it('ignores decorative icons marked aria-hidden', () => {
    const { blocks, unsupportedCount } = domToIrSync(
      dom('<div class="callout"><div class="callout-title"><div class="callout-icon"><svg aria-hidden="true"><path /></svg></div><div class="callout-title-inner">Achtung</div></div><div class="callout-content"><p>Inhalt</p></div></div>'),
    );
    expect(unsupportedCount).toBe(0);
    const texts = blocks.map((b) => JSON.stringify(b)).join(' ');
    expect(texts).not.toContain('[Grafik]');
    expect(texts).toContain('Achtung');
    expect(texts).toContain('Inhalt');
  });

  it('ignores icons recognised by their class name alone', () => {
    const { unsupportedCount } = domToIrSync(dom('<div class="callout-icon"><svg class="svg-icon lucide-info"></svg></div>'));
    expect(unsupportedCount).toBe(0);
  });

  it('still reports a real graphic that merely sits next to an icon', () => {
    const { unsupportedCount } = domToIrSync(
      dom('<div><div class="clickable-icon"><svg aria-hidden="true"></svg></div><div class="diagram"><svg><rect /></svg></div></div>'),
    );
    expect(unsupportedCount).toBe(1);
  });

  // Das Export-DOM ist NICHT das Preview-DOM: in Obsidians detached Container fuellt
  // `setIcon` das Callout-Icon nicht, es bleibt `<svg width="16" height="16">` — ohne
  // Klasse, ohne aria-hidden. Der erste Icon-Fix pruefte nur das Element selbst und stieg
  // dann in den dekorativen Container hinein, wo genau dieses nackte SVG als „[Grafik]"
  // landete. Gemessen am echten Export 2026-08-04, nicht am Preview.
  it('skips a decorative container completely, including bare svg inside it', () => {
    const { blocks, unsupportedCount } = domToIrSync(
      dom('<div class="callout"><div class="callout-title"><div class="callout-icon"><svg width="16" height="16"></svg></div><div class="callout-title-inner">Hinweis</div></div><div class="callout-content"><p>Inhalt</p></div></div>'),
    );
    expect(unsupportedCount).toBe(0);
    expect(JSON.stringify(blocks)).not.toContain('[Grafik]');
    expect(JSON.stringify(blocks)).toContain('Hinweis');
  });

  it('does not swallow text that sits in an icon-named element', () => {
    const { blocks } = domToIrSync(dom('<div class="icon-legend">Legende</div>'));
    expect(JSON.stringify(blocks)).toContain('Legende');
  });

  it('still ignores empty layout wrappers', () => {
    const { blocks, unsupportedCount } = domToIrSync(dom('<div></div><div><span></span></div>'));
    expect(unsupportedCount).toBe(0);
    expect(blocks).toHaveLength(0);
  });
});

// Regression 2026-08-04: `- [ ]` und `- [x]` rendern als optisch gleiche Bullets — im PDF
// war „erledigt" nicht mehr von „offen" zu unterscheiden. Kein Datenverlust wie bei den
// Formeln, aber Bedeutungsverlust.
describe('domToIrSync — Aufgabenlisten', () => {
  const taskList =
    '<ul class="contains-task-list">' +
    '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox"> offen</li>' +
    '<li class="task-list-item is-checked" data-task="x"><input type="checkbox" checked class="task-list-item-checkbox"> erledigt</li>' +
    '</ul>';

  it('keeps the checkbox state visible', () => {
    const { blocks } = domToIrSync(dom(taskList));
    const list = blocks[0] as ListBlock;
    const first = list.items[0].inlines.map((r: Inline) => r.text).join('');
    const second = list.items[1].inlines.map((r: Inline) => r.text).join('');
    expect(first).toMatch(/^\[ \]/);
    expect(second).toMatch(/^\[x\]/i);
    expect(first).toContain('offen');
    expect(second).toContain('erledigt');
  });

  it('leaves ordinary list items untouched', () => {
    const { blocks } = domToIrSync(dom('<ul><li>normal</li></ul>'));
    const list = blocks[0] as ListBlock;
    expect(list.items[0].inlines.map((r: Inline) => r.text).join('')).toBe('normal');
  });
});
