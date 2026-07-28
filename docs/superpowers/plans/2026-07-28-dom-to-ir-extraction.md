# dom-to-ir + code-blocks + image → obsidian-kit 0.17.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei near-/byte-identische Module (`dom-to-ir.ts`, `code-blocks.ts`, `image.ts`), die
aktuell dupliziert in `obsidian-letterhead` und `obsidian-paperize` liegen, ins gemeinsame
`obsidian-kit` heben und in beiden Consumern per Vendoring einbinden.

**Architecture:** Drei neue Dateien unter `obsidian-kit/src/pure/pdf/` (reine DOM/Browser-APIs,
kein Obsidian-Import). Präfix-Unterschiede zwischen Consumern werden durch explizite
Parameter/Callbacks gekapselt statt hart codiert: `code-blocks.ts`-Funktionen nehmen `prefix:
string` als letzten Parameter, `domToIrSync`s `opts` bekommt `resolvePlaceholder?: (text:
string) => number | null` statt eines internen Imports. `image.ts` wird verbatim aus letterheads
bereits PROF-OBS-04-konformer Version (Canvas-Factory-Injection) übernommen — paperize übernimmt
diesen Fix beim Vendoring mit.

**Tech Stack:** TypeScript, Vitest (+ happy-dom für DOM-Environment-Tests), Obsidian Plugin API
(nur in den Consumer-`obsidian/`-Schichten, nicht im Kit-`pure/`-Layer).

## Global Constraints

- Kein `obsidian`-Import in `src/pure/**` — geprüft über `npm run lint` im Kit und
  `npm run check:pure` in den Consumern.
- Kit-Version-Bump ist additiv (Minor): `0.16.1` → `0.17.0`, keine bestehenden Exports ändern
  sich in Signatur.
- Jeder Task endet grün (`npm run typecheck && npm test`, in den Consumern zusätzlich
  `npm run build`) bevor committet wird.
- Vendoring bleibt Copy-Paste (kein npm-Publish) — VENDOR.json trägt Version + SHA + Dateiliste,
  wie in allen bisherigen Kit-Consumer-Repos etabliert.

---

## Spec-Referenz

`obsidian-kit/docs/superpowers/specs/2026-07-28-dom-to-ir-extraction-design.md`

## File Structure

**obsidian-kit:**
- Create: `src/pure/pdf/code-blocks.ts`
- Create: `src/pure/pdf/dom-to-ir.ts`
- Create: `src/pure/pdf/image.ts`
- Modify: `src/pure/pdf/index.ts` (neue Re-Exports)
- Modify: `src/pure/index.ts` (`KIT_VERSION` → `"0.17.0"`)
- Modify: `package.json` (`version` → `"0.17.0"`, `happy-dom` devDependency)
- Modify: `CHANGELOG.md` (neuer `0.17.0`-Eintrag oben)
- Create: `tests/pure/pdf/code-blocks.test.ts`
- Create: `tests/pure/pdf/dom-to-ir.test.ts`
- Create: `tests/pure/pdf/image.test.ts`

**obsidian-letterhead:**
- Create: `src/vendor/kit/pdf/code-blocks.ts`, `dom-to-ir.ts`, `image.ts`
- Modify: `src/vendor/kit/VENDOR.json`
- Delete: `src/core/code-blocks.ts`, `src/core/dom-to-ir.ts`, `src/core/image.ts`
- Delete: `tests/core/code-blocks.test.ts`, `tests/core/dom-to-ir.test.ts`
- Modify: `src/obsidian/main.ts` (Imports + Call-Sites)
- Modify: `tests/vendor-smoke.test.ts` (Smoke-Block ergänzen)

**obsidian-paperize:**
- Create: `src/vendor/kit/pdf/code-blocks.ts`, `dom-to-ir.ts`, `image.ts`
- Modify: `src/vendor/kit/VENDOR.json`
- Delete: `src/core/code-blocks.ts`, `src/core/dom-to-ir.ts`, `src/core/image.ts`
- Delete: `tests/core/code-blocks.test.ts`, `tests/core/dom-to-ir.test.ts`
- Modify: `src/obsidian/main.ts` (Imports + Call-Sites + `createEl`-Import + PROF-OBS-04-Fix)
- Modify: `tests/vendor-smoke.test.ts` (Smoke-Block ergänzen)

**obsidian-plugins (Dach):**
- Modify: `REGISTRY.md`, `KIT-MATRIX.md`

---

### Task 1: Kit — `code-blocks.ts` (TDD)

**Files:**
- Create: `obsidian-kit/src/pure/pdf/code-blocks.ts`
- Test: `obsidian-kit/tests/pure/pdf/code-blocks.test.ts`

**Interfaces:**
- Produces: `interface ExtractedCode { lang?: string; text: string }`,
  `codePlaceholder(prefix: string, i: number): string` — **Achtung:** in dieser Datei ist die
  Parameter-Reihenfolge `(prefix, i)` für `codePlaceholder`, aber `extractCodeBlocks(md:
  string, prefix: string)` und `parseCodePlaceholder(text: string, prefix: string)` haben
  `prefix` als **letzten** Parameter — siehe Step 3, exakte Signaturen dort im Code.

- [ ] **Step 1: Write the failing test**

```typescript
// obsidian-kit/tests/pure/pdf/code-blocks.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/code-blocks.test.ts`
Expected: FAIL — `Cannot find module '../../../src/pure/pdf/code-blocks'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// obsidian-kit/src/pure/pdf/code-blocks.ts
export interface ExtractedCode {
  lang?: string;
  text: string;
}

export function codePlaceholder(prefix: string, i: number): string {
  return `${prefix}${i}`;
}

/** Index of the placeholder this text is, or null. Counterpart to codePlaceholder(). */
export function parseCodePlaceholder(text: string, prefix: string): number | null {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const m = re.exec(text.trim());
  return m ? Number(m[1]) : null;
}

// Opening fence: optional indent, 3+ backticks or tildes, optional language.
const OPEN_RE = /^(\s*)(`{3,}|~{3,})(\S*)\s*$/;

export function extractCodeBlocks(md: string, prefix: string): { markdown: string; codes: ExtractedCode[] } {
  const lines = md.split('\n');
  const out: string[] = [];
  const codes: ExtractedCode[] = [];
  let i = 0;

  while (i < lines.length) {
    const open = OPEN_RE.exec(lines[i]);
    if (!open) { out.push(lines[i]); i++; continue; }

    const [, indent, fence, lang] = open;
    // Closing fence: same char, at least as long, nothing else on the line. This is what
    // keeps a ``` inside a ````-block from ending it early.
    const close = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;

    // Unclosed fence: not a code block. Leave the line as-is so the renderer decides.
    if (j >= lines.length) { out.push(lines[i]); i++; continue; }

    const body = lines.slice(i + 1, j).map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l));
    codes.push({ lang: lang || undefined, text: body.join('\n') });
    out.push(indent + codePlaceholder(prefix, codes.length - 1));
    i = j + 1;
  }

  return { markdown: out.join('\n'), codes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/code-blocks.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
cd obsidian-kit
git add src/pure/pdf/code-blocks.ts tests/pure/pdf/code-blocks.test.ts
git commit -m "feat(pdf): code-blocks — Fence-Extraktion mit parametrisierbarem Platzhalter-Präfix"
```

---

### Task 2: Kit — `dom-to-ir.ts` (TDD)

**Files:**
- Create: `obsidian-kit/src/pure/pdf/dom-to-ir.ts`
- Test: `obsidian-kit/tests/pure/pdf/dom-to-ir.test.ts`

**Interfaces:**
- Consumes: `Block`, `Inline`, `ListItem`, `Cell`, `Align` aus `./ir` (bereits im Kit
  vorhanden); `ExtractedCode` aus `./code-blocks` (Task 1); `codePlaceholder`,
  `parseCodePlaceholder` aus `./code-blocks` (nur in Tests, nicht im Modul selbst — das Modul
  bleibt über `resolvePlaceholder` entkoppelt).
- Produces: `domToIrSync(root: HTMLElement, opts?: { pageBreakMarker?: string; codes?:
  ExtractedCode[]; resolvePlaceholder?: (text: string) => number | null }): { blocks: Block[];
  imageEls: HTMLImageElement[]; unsupportedCount: number }`, `resolveImages(blocks: Block[],
  imageEls: HTMLImageElement[], decode: (src: string) => Promise<{ data: Uint8Array; wPx:
  number; hPx: number } | null>): Promise<{ blocks: Block[]; unsupportedAdded: number }>`.

- [ ] **Step 1: Write the failing test**

```typescript
// obsidian-kit/tests/pure/pdf/dom-to-ir.test.ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { domToIrSync, resolveImages } from '../../../src/pure/pdf/dom-to-ir';
import { codePlaceholder, parseCodePlaceholder } from '../../../src/pure/pdf/code-blocks';

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
    const p = blocks[0] as any;
    expect(p.type).toBe('paragraph');
    expect(p.inlines.some((r: any) => r.bold)).toBe(true);
    expect(p.inlines.some((r: any) => r.italic)).toBe(true);
  });

  it('maps nested lists', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as any;
    expect(list.type).toBe('list');
    expect(list.items[0].children[0].type).toBe('list');
  });

  it('does not duplicate nested list text into the parent item inlines', () => {
    const { blocks } = domToIrSync(dom('<ul><li>top<ul><li>child</li></ul></li></ul>'));
    const list = blocks[0] as any;
    const childItem = list.items[0].children[0].items[0];
    const childText = childItem.inlines.map((r: any) => r.text).join('');
    expect(childText).toBe('child');
  });

  it('maps a fenced code block with language', () => {
    const { blocks } = domToIrSync(dom('<pre><code class="language-js">x=1</code></pre>'));
    expect(blocks[0]).toMatchObject({ type: 'code', lang: 'js' });
  });

  it('maps a table with header and rows', () => {
    const { blocks } = domToIrSync(dom('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>a1</td></tr></tbody></table>'));
    const t = blocks[0] as any;
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
      async () => ({ data: new Uint8Array([1]), wPx: 10, hPx: 20 }),
    );
    expect(blocks[0]).toEqual({ type: 'image', data: new Uint8Array([1]), wPx: 10, hPx: 20, alt: undefined });
  });

  it('degrades to unsupported when decode fails', async () => {
    const el = document.createElement('img');
    el.src = 'x.png';
    const { blocks, unsupportedAdded } = await resolveImages(
      [{ type: 'image', data: new Uint8Array(0), wPx: 0, hPx: 0, alt: 'Logo' }],
      [el],
      async () => null,
    );
    expect(unsupportedAdded).toBe(1);
    expect(blocks[0]).toMatchObject({ type: 'unsupported' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/dom-to-ir.test.ts`
Expected: FAIL — `Cannot find module '../../../src/pure/pdf/dom-to-ir'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// obsidian-kit/src/pure/pdf/dom-to-ir.ts
import { Block, Inline, ListItem, Cell, Align } from './ir';
import type { ExtractedCode } from './code-blocks';

const EMPTY = new Uint8Array(0);
const nameOf = (n: Node) => (n.nodeName || '').toUpperCase();
const isText = (n: Node) => n.nodeType === 3;
const isElem = (n: Node) => n.nodeType === 1;

// Inline runs (bold/italic/code/link) from an element's descendants.
function runsFrom(node: Node, ctx: { bold: boolean; italic: boolean; code: boolean; link?: string }, acc: Inline[]): Inline[] {
  for (const c of Array.from(node.childNodes || [])) {
    if (isText(c)) {
      const txt = c.textContent || '';
      if (txt) acc.push({ text: txt, bold: ctx.bold || undefined, italic: ctx.italic || undefined, code: ctx.code || undefined, link: ctx.link });
    } else if (isElem(c)) {
      const nm = nameOf(c);
      if (nm === 'BR') { acc.push({ text: '\n' }); continue; }
      if (nm === 'IMG') continue; // inline images are ignored inside text runs
      if (nm === 'UL' || nm === 'OL') continue; // nested lists are handled as separate child blocks
      const next = {
        bold: ctx.bold || nm === 'STRONG' || nm === 'B',
        italic: ctx.italic || nm === 'EM' || nm === 'I',
        code: ctx.code || nm === 'CODE',
        link: nm === 'A' ? ((c as HTMLAnchorElement).getAttribute('href') || ctx.link) : ctx.link,
      };
      runsFrom(c, next, acc);
    }
  }
  return acc;
}

function mergeRuns(runs: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (r.text === '\n') { out.push(r); continue; }
    if (last && last.text !== '\n' && !!last.bold === !!r.bold && !!last.italic === !!r.italic && !!last.code === !!r.code && last.link === r.link) last.text += r.text;
    else out.push({ ...r });
  }
  return out.filter((r) => r.text !== '');
}

function inlinesOf(el: Element): Inline[] {
  return mergeRuns(runsFrom(el, { bold: false, italic: false, code: false }, []));
}

function cellAlign(td: Element): Align | undefined {
  const s = (td.getAttribute('style') || '').toLowerCase();
  if (s.includes('center')) return 'center';
  if (s.includes('right')) return 'right';
  const a = (td.getAttribute('align') || '').toLowerCase();
  if (a === 'center' || a === 'right' || a === 'left') return a;
  return undefined;
}

export function domToIrSync(
  root: HTMLElement,
  opts?: { pageBreakMarker?: string; codes?: ExtractedCode[]; resolvePlaceholder?: (text: string) => number | null },
): { blocks: Block[]; imageEls: HTMLImageElement[]; unsupportedCount: number } {
  const blocks: Block[] = [];
  const imageEls: HTMLImageElement[] = [];
  let unsupportedCount = 0;
  const marker = opts?.pageBreakMarker;
  const codes = opts?.codes;
  const resolvePlaceholder = opts?.resolvePlaceholder;

  // A placeholder paragraph stands for a fenced block that was pulled out of the Markdown
  // before rendering (see extractCodeBlocks) — Obsidian post-processors from other plugins
  // never saw it, so the original code is still intact here.
  const codeFor = (txt: string): ExtractedCode | null => {
    if (!codes || !codes.length || !resolvePlaceholder) return null;
    const i = resolvePlaceholder(txt);
    return i === null ? null : (codes[i] ?? null);
  };

  const parseList = (listEl: Element): ListItem[] => {
    const items: ListItem[] = [];
    for (const li of Array.from(listEl.children)) {
      if (nameOf(li) !== 'LI') continue;
      // Split the LI's own inline text from nested lists.
      const childBlocks: Block[] = [];
      for (const sub of Array.from(li.children)) {
        const nm = nameOf(sub);
        if (nm === 'UL' || nm === 'OL') childBlocks.push({ type: 'list', ordered: nm === 'OL', items: parseList(sub) });
      }
      if (li.querySelector('img')) unsupportedCount++;
      items.push({ inlines: inlinesOf(li), children: childBlocks.length ? childBlocks : undefined });
    }
    return items;
  };

  const parseTable = (tableEl: Element): Block => {
    let header: Cell[] = [];
    const rows: Cell[][] = [];
    const thead = tableEl.querySelector('thead');
    const tbody = tableEl.querySelector('tbody') || tableEl;
    if (thead) {
      const tr = thead.querySelector('tr');
      if (tr) header = Array.from(tr.children).map((td) => {
        if (td.querySelector('img')) unsupportedCount++;
        return { inlines: inlinesOf(td), align: cellAlign(td) };
      });
    }
    for (const tr of Array.from(tbody.querySelectorAll('tr'))) {
      if (thead && tr.parentElement && tr.parentElement.nodeName.toUpperCase() === 'THEAD') continue;
      const cells = Array.from(tr.children).map((td) => {
        if (td.querySelector('img')) unsupportedCount++;
        return { inlines: inlinesOf(td), align: cellAlign(td) };
      });
      if (cells.length) rows.push(cells);
    }
    return { type: 'table', header, rows };
  };

  const walk = (node: Node) => {
    for (const c of Array.from(node.childNodes || [])) {
      if (isText(c)) { const t = (c.textContent || '').trim(); if (t) blocks.push({ type: 'paragraph', inlines: [{ text: t }] }); continue; }
      if (!isElem(c)) continue;
      const el = c as Element;
      const nm = nameOf(el);
      if (/^H[1-6]$/.test(nm)) blocks.push({ type: 'heading', level: Number(nm[1]) as 1, inlines: inlinesOf(el) });
      else if (nm === 'P') {
        const txt = (el.textContent || '').trim();
        if (marker && txt === marker) { blocks.push({ type: 'pagebreak' }); continue; }
        const code = codeFor(txt);
        if (code) { blocks.push({ type: 'code', lang: code.lang, text: code.text }); continue; }
        const inl = inlinesOf(el);
        if (inl.length) blocks.push({ type: 'paragraph', inlines: inl });
        for (const img of Array.from(el.querySelectorAll('img'))) {
          blocks.push({ type: 'image', data: EMPTY, wPx: 0, hPx: 0, alt: img.getAttribute('alt') || undefined });
          imageEls.push(img);
        }
      }
      else if (nm === 'UL' || nm === 'OL') blocks.push({ type: 'list', ordered: nm === 'OL', items: parseList(el) });
      else if (nm === 'BLOCKQUOTE') { const inner: Block[] = []; const sub = domToIrSync(el as HTMLElement, opts); inner.push(...sub.blocks); imageEls.push(...sub.imageEls); unsupportedCount += sub.unsupportedCount; blocks.push({ type: 'blockquote', blocks: inner }); }
      else if (nm === 'PRE') { const code = el.querySelector('code'); const langCls = code ? (code.getAttribute('class') || '') : ''; const lm = /language-(\S+)/.exec(langCls); blocks.push({ type: 'code', lang: lm ? lm[1] : undefined, text: (el.textContent || '') }); }
      else if (nm === 'TABLE') blocks.push(parseTable(el));
      else if (nm === 'IMG') { blocks.push({ type: 'image', data: EMPTY, wPx: 0, hPx: 0, alt: (el as HTMLImageElement).getAttribute('alt') || undefined }); imageEls.push(el as HTMLImageElement); }
      else if (nm === 'HR') blocks.push({ type: 'hr' });
      else if (nm === 'DIV' || nm === 'SECTION' || nm === 'ARTICLE') walk(el);
      else { const t = (el.textContent || '').trim(); if (t) { blocks.push({ type: 'unsupported', text: t }); unsupportedCount++; } }
    }
  };

  walk(root);
  return { blocks, imageEls, unsupportedCount };
}

export async function resolveImages(
  blocks: Block[],
  imageEls: HTMLImageElement[],
  decode: (src: string) => Promise<{ data: Uint8Array; wPx: number; hPx: number } | null>,
): Promise<{ blocks: Block[]; unsupportedAdded: number }> {
  let unsupportedAdded = 0;
  let imgIdx = 0;
  const mapBlock = async (b: Block): Promise<Block> => {
    if (b.type === 'image') {
      const el = imageEls[imgIdx++];
      const src = el ? (el.getAttribute('src') || el.src || '') : '';
      const dec = src ? await decode(src) : null;
      if (!dec) { unsupportedAdded++; return { type: 'unsupported', text: b.alt ? `[Bild: ${b.alt}]` : '[Bild konnte nicht eingebettet werden]' }; }
      return { type: 'image', data: dec.data, wPx: dec.wPx, hPx: dec.hPx, alt: b.alt };
    }
    if (b.type === 'blockquote') return { type: 'blockquote', blocks: await Promise.all(b.blocks.map(mapBlock)) };
    return b;
  };
  const out = await Promise.all(blocks.map(mapBlock));
  return { blocks: out, unsupportedAdded };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/dom-to-ir.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
cd obsidian-kit
git add src/pure/pdf/dom-to-ir.ts tests/pure/pdf/dom-to-ir.test.ts
git commit -m "feat(pdf): dom-to-ir — DOM→IR-Konverter mit entkoppeltem resolvePlaceholder-Callback"
```

---

### Task 3: Kit — `image.ts` (TDD) + happy-dom devDependency

**Files:**
- Create: `obsidian-kit/src/pure/pdf/image.ts`
- Test: `obsidian-kit/tests/pure/pdf/image.test.ts`
- Modify: `obsidian-kit/package.json`

**Interfaces:**
- Produces: `imageToJpeg(src: string, makeCanvas: () => HTMLCanvasElement, maxWpx?: number):
  Promise<{ data: Uint8Array; wPx: number; hPx: number } | null>`.

- [ ] **Step 1: Add happy-dom devDependency**

```bash
cd obsidian-kit
npm install --save-dev happy-dom@^20.10.6
```

- [ ] **Step 2: Write the failing test**

```typescript
// obsidian-kit/tests/pure/pdf/image.test.ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { imageToJpeg } from '../../../src/pure/pdf/image';

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = vi.fn(() => ctx) as any;
  canvas.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA') as any;
  return canvas;
}

describe('imageToJpeg', () => {
  it('returns null for an empty src', async () => {
    const result = await imageToJpeg('', fakeCanvas);
    expect(result).toBe(null);
  });

  it('rasterizes an image to JPEG bytes with scaled dimensions', async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2000;
      naturalHeight = 1000;
      set src(_v: string) { queueMicrotask(() => this.onload && this.onload()); }
    }
    (globalThis as any).Image = FakeImage;

    try {
      const result = await imageToJpeg('data:image/png;base64,x', fakeCanvas, 1000);
      expect(result).not.toBe(null);
      expect(result!.wPx).toBe(1000);
      expect(result!.hPx).toBe(500);
      expect(result!.data).toBeInstanceOf(Uint8Array);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });

  it('returns null when the image fails to load', async () => {
    const OriginalImage = globalThis.Image;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onerror && this.onerror()); }
    }
    (globalThis as any).Image = FailingImage;

    try {
      const result = await imageToJpeg('data:image/png;base64,x', fakeCanvas);
      expect(result).toBe(null);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });

  it('returns null when the canvas has no 2D context', async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_v: string) { queueMicrotask(() => this.onload && this.onload()); }
    }
    (globalThis as any).Image = FakeImage;

    try {
      const noCtxCanvas = () => {
        const c = document.createElement('canvas');
        c.getContext = vi.fn(() => null) as any;
        return c;
      };
      const result = await imageToJpeg('data:image/png;base64,x', noCtxCanvas);
      expect(result).toBe(null);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/image.test.ts`
Expected: FAIL — `Cannot find module '../../../src/pure/pdf/image'`

- [ ] **Step 4: Write minimal implementation**

```typescript
// obsidian-kit/src/pure/pdf/image.ts
/* ------------------------------------------------------------------ *
 *  Image · Rasterung (Runtime: Image/canvas) → JPEG-Bytes
 * ------------------------------------------------------------------ */
/* Rastert ein (ggf. SVG-)Bild aus seiner data:/resource-URL auf weißem
   Grund zu JPEG-Bytes für die PDF-Einbettung. Transparenz wird auf Weiß
   geflacht (Brief). Gibt null zurück, wenn keine Quelle oder ein Fehler
   — dann ohne Bild.

   Das <canvas> wird als Factory injiziert, nicht hier erzeugt: `createEl`/
   `activeDocument` sind Obsidian-Globals, die in pure/ nichts verloren haben
   — der Aufrufer im jeweiligen Plugin liefert `() => createEl('canvas')`. So
   bleibt dieses Modul frei von Obsidian-Globals und von rohem
   `document.createElement` (obsidianmd/prefer-create-el). */
export async function imageToJpeg(
  src: string,
  makeCanvas: () => HTMLCanvasElement,
  maxWpx?: number
): Promise<{ data: Uint8Array; wPx: number; hPx: number } | null> {
  if (!src) return null;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
    const naturalW = img.naturalWidth || img.width || 1;
    const naturalH = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, (maxWpx || 1200) / naturalW);
    const wPx = Math.max(1, Math.round(naturalW * scale));
    const hPx = Math.max(1, Math.round(naturalH * scale));
    const canvas = makeCanvas();
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, wPx, hPx);
    ctx.drawImage(img, 0, 0, wPx, hPx);
    const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { data, wPx, hPx };
  } catch (e) {
    console.error('obsidian-kit: image rasterization failed', e);
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd obsidian-kit && npx vitest run tests/pure/pdf/image.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd obsidian-kit
git add package.json package-lock.json src/pure/pdf/image.ts tests/pure/pdf/image.test.ts
git commit -m "feat(pdf): image — imageToJpeg mit injizierter Canvas-Factory (PROF-OBS-04-konform)"
```

---

### Task 4: Kit — Wiring, Version-Bump, Tag + Push

**Files:**
- Modify: `obsidian-kit/src/pure/pdf/index.ts`
- Modify: `obsidian-kit/src/pure/index.ts`
- Modify: `obsidian-kit/package.json`
- Modify: `obsidian-kit/CHANGELOG.md`

**Interfaces:**
- Consumes: alle Exporte aus Task 1–3.
- Produces: Kit @0.17.0, öffentlich über `pure/pdf` und `pure` re-exportiert.

- [ ] **Step 1: `src/pure/pdf/index.ts` erweitern**

```typescript
// src/pure/pdf/index.ts
import { pageSizePt } from './geometry';
import { PdfWriter } from './writer';
import { layoutDocument } from './layout';
import { Block } from './ir';
import { LayoutOptions } from './options';

export * from './ir';
export * from './options';
export * from './dom-to-ir';
export * from './code-blocks';
export { imageToJpeg } from './image';
export { layoutDocument } from './layout';
export type { DrawOp } from './layout';

// End-to-end: IR + options → PDF bytes. Synchronous; images must be pre-decoded.
export function renderPdf(doc: Block[], options: LayoutOptions): Uint8Array {
  const { pageCount, ops } = layoutDocument(doc, options);
  const { wPt, hPt } = pageSizePt(options.page.size);
  const writer = new PdfWriter(wPt, hPt);
  const pages = [];
  for (let i = 0; i < pageCount; i++) pages.push(writer.addPage());
  const imgNames = new Map<Uint8Array, string>();
  for (const op of ops) {
    const pg = pages[op.page] || pages[pages.length - 1];
    if (op.kind === 'text') pg.text(op.x, op.y, op.str, op.fontKey, op.sizePt, op.rgb);
    else if (op.kind === 'line') pg.line(op.x1, op.y1, op.x2, op.y2, op.wPt, op.rgb);
    else if (op.kind === 'rect') pg.rect(op.x, op.y, op.w, op.h, op.rgb);
    else if (op.kind === 'image') {
      let name = imgNames.get(op.data);
      if (!name) { name = writer.addJpeg(op.data, op.wPx, op.hPx); imgNames.set(op.data, name); }
      pg.image(name, op.x, op.y, op.w, op.h);
    }
  }
  return writer.build();
}
```

- [ ] **Step 2: `src/pure/index.ts` — `KIT_VERSION` bumpen**

Ändere die letzte Zeile von:
```typescript
export const KIT_VERSION = "0.15.0";
```
zu:
```typescript
export const KIT_VERSION = "0.17.0";
```

(Behebt nebenbei die bestehende Drift zur `package.json`-Version 0.16.1 — kein eigener Task,
da dieselbe Zeile ohnehin angefasst wird.)

- [ ] **Step 3: `package.json` — Version + devDependency prüfen**

Ändere `"version": "0.16.1"` zu `"version": "0.17.0"`. `happy-dom` steht bereits als
devDependency aus Task 3, Step 1 — hier nur verifizieren, dass es committet ist.

- [ ] **Step 4: `CHANGELOG.md` — neuer Eintrag oben (nach der Kopfzeile)**

```markdown
## 0.17.0 — pdf: dom-to-ir + code-blocks + image aus letterhead/paperize gehoben

### `obsidian-kit/pure/pdf`
- **`code-blocks.ts`** (neu) — `extractCodeBlocks`/`codePlaceholder`/`parseCodePlaceholder`,
  parametrisiert per `prefix`-Argument (kein Default — jeder Consumer bindet seinen eigenen
  Präfix, verhindert stille Kollisionen).
- **`dom-to-ir.ts`** (neu) — `domToIrSync`/`resolveImages`. Platzhalter-Auflösung über
  `opts.resolvePlaceholder: (text) => number | null` statt fester Kopplung an
  `code-blocks.ts` — Consumer binden `(t) => parseCodePlaceholder(t, PREFIX)` selbst.
- **`image.ts`** (neu) — `imageToJpeg(src, makeCanvas, maxWpx)`. Canvas wird als Factory
  injiziert (kein Obsidian-Global im Kit-Modul).
- Hard-Dupe zwischen `obsidian-letterhead` und `obsidian-paperize` aufgelöst (waren nach dem
  Code-Fence-Fix vom 2026-07-28 byte-identisch bzw. nur im Platzhalter-Präfix unterschiedlich).

Consumer: **`obsidian-letterhead`**, **`obsidian-paperize`**.
```

- [ ] **Step 5: Verifikation**

Run: `cd obsidian-kit && npm run typecheck && npm test && npm run lint`
Expected: alle drei grün, `npm test` zeigt die neuen `pdf/{code-blocks,dom-to-ir,image}`-Suiten.

- [ ] **Step 6: Commit + Tag + Dual-Push**

```bash
cd obsidian-kit
git add src/pure/pdf/index.ts src/pure/index.ts package.json CHANGELOG.md
git commit -m "release: 0.17.0 — dom-to-ir/code-blocks/image aus letterhead+paperize gehoben"
git tag 0.17.0
git push codeberg main --tags
git push github main --tags
```

---

### Task 5: obsidian-letterhead — Vendor-Migration

**Files:**
- Create: `obsidian-letterhead/src/vendor/kit/pdf/code-blocks.ts`, `dom-to-ir.ts`, `image.ts`
  (verbatim aus `obsidian-kit@0.17.0/src/pure/pdf/{code-blocks,dom-to-ir,image}.ts`, Header
  `// vendored from obsidian-kit@0.17.0, src/pure/pdf/<name>.ts — do not hand-edit` ergänzt)
- Modify: `obsidian-letterhead/src/vendor/kit/VENDOR.json`
- Delete: `obsidian-letterhead/src/core/code-blocks.ts`, `src/core/dom-to-ir.ts`,
  `src/core/image.ts`
- Delete: `obsidian-letterhead/tests/core/code-blocks.test.ts`,
  `tests/core/dom-to-ir.test.ts`
- Modify: `obsidian-letterhead/src/obsidian/main.ts:30-32,399,401`
- Modify: `obsidian-letterhead/tests/vendor-smoke.test.ts`

**Interfaces:**
- Consumes: `extractCodeBlocks(md, prefix)`, `domToIrSync(root, { codes, resolvePlaceholder })`,
  `parseCodePlaceholder(text, prefix)`, `imageToJpeg(src, makeCanvas, maxWpx)` aus
  `obsidian-kit@0.17.0`.

- [ ] **Step 1: Vendor-Dateien kopieren**

```bash
cd obsidian-letterhead
mkdir -p src/vendor/kit/pdf
for f in code-blocks dom-to-ir image; do
  { echo "// vendored from obsidian-kit@0.17.0, src/pure/pdf/${f}.ts — do not hand-edit"; \
    cat ../obsidian-kit/src/pure/pdf/${f}.ts; } > src/vendor/kit/pdf/${f}.ts
done
```

- [ ] **Step 2: Alte lokale Module + Tests löschen**

```bash
git rm src/core/code-blocks.ts src/core/dom-to-ir.ts src/core/image.ts
git rm tests/core/code-blocks.test.ts tests/core/dom-to-ir.test.ts
```

- [ ] **Step 3: `VENDOR.json` aktualisieren**

Lies zunächst den aktuellen Inhalt (`cat src/vendor/kit/VENDOR.json`), ergänze
`pdf/code-blocks.ts, pdf/dom-to-ir.ts, pdf/image.ts` in der `vendored`-Dateiliste, setze
`version` auf `"0.17.0"` und `sha` auf den Kurz-Hash des Kit-Commits aus Task 4 Step 6
(`cd ../obsidian-kit && git rev-parse --short HEAD`).

- [ ] **Step 4: `src/obsidian/main.ts` — Imports umbiegen**

Zeilen 30–32 ändern von:
```typescript
import { domToIrSync, resolveImages } from '../core/dom-to-ir';
import { extractCodeBlocks } from '../core/code-blocks';
import { imageToJpeg } from '../core/image';
```
zu:
```typescript
import { domToIrSync, resolveImages } from '../vendor/kit/pdf/dom-to-ir';
import { extractCodeBlocks, parseCodePlaceholder } from '../vendor/kit/pdf/code-blocks';
import { imageToJpeg } from '../vendor/kit/pdf/image';
```

- [ ] **Step 5: Call-Sites anpassen (Zeilen 399/401)**

Ändere:
```typescript
const { markdown, codes } = extractCodeBlocks(model.bodyMarkdown || '');
await MarkdownRenderer.render(this.app, markdown, holder, model.sourcePath || '', comp);
const ex = domToIrSync(holder, { codes });
```
zu:
```typescript
const { markdown, codes } = extractCodeBlocks(model.bodyMarkdown || '', 'LETTERHEADCODE');
await MarkdownRenderer.render(this.app, markdown, holder, model.sourcePath || '', comp);
const ex = domToIrSync(holder, { codes, resolvePlaceholder: (t) => parseCodePlaceholder(t, 'LETTERHEADCODE') });
```

`imageToJpeg(...)`-Aufrufe (Zeilen 348, 351, 371) bleiben unverändert — Signatur identisch.

- [ ] **Step 6: Smoke-Test ergänzen**

In `tests/vendor-smoke.test.ts` ergänzen (nach dem bestehenden `collapsible`-Block):

```typescript
import { domToIrSync } from '../src/vendor/kit/pdf/dom-to-ir';
import { extractCodeBlocks, codePlaceholder, parseCodePlaceholder } from '../src/vendor/kit/pdf/code-blocks';

describe('vendored dom-to-ir + code-blocks', () => {
  it('extracts a fence and resolves it back to a code block', () => {
    const { markdown, codes } = extractCodeBlocks('```js\nx=1\n```', 'LETTERHEADCODE');
    const div = document.createElement('div');
    div.innerHTML = `<p>${markdown}</p>`;
    const { blocks } = domToIrSync(div, {
      codes,
      resolvePlaceholder: (t) => parseCodePlaceholder(t, 'LETTERHEADCODE'),
    });
    expect(blocks).toEqual([{ type: 'code', lang: 'js', text: 'x=1' }]);
  });
});
```

Prüfe, ob die Datei bereits `// @vitest-environment happy-dom` am Kopf hat (nötig für
`document.createElement`) — falls nicht, ergänzen.

- [ ] **Step 7: Verifikation**

Run: `cd obsidian-letterhead && npm run typecheck && npm test && npm run build`
Expected: alle grün.

- [ ] **Step 8: Commit**

```bash
cd obsidian-letterhead
git add -A
git commit -m "chore(vendor): dom-to-ir/code-blocks/image aus obsidian-kit@0.17.0 vendoren"
```

---

### Task 6: obsidian-paperize — Vendor-Migration + PROF-OBS-04-Fix

**Files:**
- Create: `obsidian-paperize/src/vendor/kit/pdf/code-blocks.ts`, `dom-to-ir.ts`, `image.ts`
- Modify: `obsidian-paperize/src/vendor/kit/VENDOR.json`
- Delete: `obsidian-paperize/src/core/code-blocks.ts`, `src/core/dom-to-ir.ts`,
  `src/core/image.ts`
- Delete: `obsidian-paperize/tests/core/code-blocks.test.ts`, `tests/core/dom-to-ir.test.ts`
- Modify: `obsidian-paperize/src/obsidian/main.ts:2,9-11,92,94,153-161`
- Modify: `obsidian-paperize/tests/vendor-smoke.test.ts`
- Modify: `obsidian-paperize/tests/core/dom-to-ir.test.ts` → wird gelöscht (Task-interne
  Integrationstests für Placeholder-Verhalten leben jetzt im Kit, siehe Task 2)

**Interfaces:**
- Consumes: gleiche Kit-API wie Task 5.

- [ ] **Step 1: Vendor-Dateien kopieren**

```bash
cd obsidian-paperize
mkdir -p src/vendor/kit/pdf
for f in code-blocks dom-to-ir image; do
  { echo "// vendored from obsidian-kit@0.17.0, src/pure/pdf/${f}.ts — do not hand-edit"; \
    cat ../obsidian-kit/src/pure/pdf/${f}.ts; } > src/vendor/kit/pdf/${f}.ts
done
```

- [ ] **Step 2: Alte lokale Module + Tests löschen**

```bash
git rm src/core/code-blocks.ts src/core/dom-to-ir.ts src/core/image.ts
git rm tests/core/code-blocks.test.ts tests/core/dom-to-ir.test.ts
```

- [ ] **Step 3: `VENDOR.json` aktualisieren**

Analog zu Task 5 Step 3 — `version` `"0.17.0"`, `sha` aus dem Kit-Commit, Dateiliste um
`pdf/code-blocks.ts, pdf/dom-to-ir.ts, pdf/image.ts` erweitern.

- [ ] **Step 4: `src/obsidian/main.ts` — Import-Zeile 2 (`createEl` ergänzen)**

Ändere Zeile 2 von:
```typescript
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath, getLanguage } from 'obsidian';
```
zu:
```typescript
import { Plugin, Notice, MarkdownRenderer, Component, TFile, normalizePath, getLanguage, createEl } from 'obsidian';
```

- [ ] **Step 5: Zeilen 9–11 — Vendor-Imports**

Ändere:
```typescript
import { domToIrSync, resolveImages } from '../core/dom-to-ir';
import { extractCodeBlocks } from '../core/code-blocks';
import { imageToJpeg } from '../core/image';
```
zu:
```typescript
import { domToIrSync, resolveImages } from '../vendor/kit/pdf/dom-to-ir';
import { extractCodeBlocks, parseCodePlaceholder } from '../vendor/kit/pdf/code-blocks';
import { imageToJpeg } from '../vendor/kit/pdf/image';
```

- [ ] **Step 6: Zeilen 92/94 — `exportFile`-Call-Sites**

Ändere:
```typescript
const { markdown, codes } = extractCodeBlocks(body);
await MarkdownRenderer.render(this.app, markdown, holder, file.path, comp);
const extracted = domToIrSync(holder, { pageBreakMarker: this.settings.pageBreakMarker, codes });
```

Der Kommentar direkt darüber (Zeilen 89–91 vor `try {`) bleibt bestehen, ergänze eine Zeile:
```typescript
    try {
      // Pull fenced code out of the Markdown BEFORE rendering. MarkdownRenderer runs every
      // registered post-processor, including other plugins' — a code-block processor (e.g.
      // json_viewer on ```json) replaces the <pre> with its own widget DOM, and the original
      // code would be unrecoverable from it.
      const { markdown, codes } = extractCodeBlocks(body, 'PAPERIZECODE');
      await MarkdownRenderer.render(this.app, markdown, holder, file.path, comp);
      const extracted = domToIrSync(holder, {
        pageBreakMarker: this.settings.pageBreakMarker,
        codes,
        resolvePlaceholder: (t) => parseCodePlaceholder(t, 'PAPERIZECODE'),
      });
```

(Dieser Kommentar + `extractCodeBlocks`-Aufruf wurden bereits im Code-Fence-Fix vom
2026-07-28 eingeführt — hier wird nur der zweite Parameter `'PAPERIZECODE'` und
`resolvePlaceholder` ergänzt.)

- [ ] **Step 7: Zeile 160 — `decodeImage`, PROF-OBS-04-Fix**

Ändere in `decodeImage` (um Zeile 153–162):
```typescript
      return await imageToJpeg(url, 1600);
```
zu:
```typescript
      return await imageToJpeg(url, () => createEl('canvas'), 1600);
```

- [ ] **Step 8: Smoke-Test ergänzen**

In `tests/vendor-smoke.test.ts` denselben Block wie in Task 5 Step 6 ergänzen, mit
`'PAPERIZECODE'` statt `'LETTERHEADCODE'`.

- [ ] **Step 9: Verifikation (inkl. `check:pure`)**

Run: `cd obsidian-paperize && npm run gate`
Expected: `typecheck && test && check:pure && build` alle grün — `check:pure` bestätigt, dass
`src/core` keinen `activeDocument`-Zugriff mehr direkt enthält (der Zugriff lebt jetzt
ausschließlich in `src/obsidian/main.ts` über `createEl`).

- [ ] **Step 10: Commit**

```bash
cd obsidian-paperize
git add -A
git commit -m "chore(vendor): dom-to-ir/code-blocks/image aus obsidian-kit@0.17.0 vendoren; PROF-OBS-04-Fix (createEl statt activeDocument)"
```

---

### Task 7: Registry/KIT-MATRIX nachziehen (Dach)

**Files:**
- Modify: `obsidian-plugins/REGISTRY.md`
- Modify: `obsidian-plugins/KIT-MATRIX.md`

**Interfaces:** keine (reine Dokumentation).

- [ ] **Step 1: `REGISTRY.md` — DOM→IR-Kandidat als erledigt markieren**

Suche den bestehenden Registry-Eintrag zum DOM→IR-Hard-Dupe (letterhead↔paperize) —
`grep -n "dom-to-ir\|DOM→IR\|domToIr" REGISTRY.md`. Aktualisiere ihn auf: Kit-Modul
`obsidian-kit/pure/pdf` (`domToIrSync`/`resolveImages`, `extractCodeBlocks`/
`codePlaceholder`/`parseCodePlaceholder`, `imageToJpeg`), im Kit seit `0.17.0`, vendored in
letterhead + paperize.

- [ ] **Step 2: `KIT-MATRIX.md` regenerieren oder manuell nachziehen**

Falls ein Regenerierungs-Tool existiert (`grep -rn "KIT-MATRIX" tools/` prüfen), dieses
laufen lassen. Sonst manuell: letterhead- und paperize-Zeilen auf Kit-Version `0.17.0` mit den
drei neuen Modulen ergänzen.

- [ ] **Step 3: Verifikation**

Run (falls vorhanden): `cd obsidian-plugins && ./tools/pin_audit.py` oder äquivalentes
Audit-Skript — bestätigt, dass keine Versions-Drift zwischen VENDOR.json und KIT-MATRIX.md
mehr besteht.

- [ ] **Step 4: Commit**

```bash
cd obsidian-plugins
git add REGISTRY.md KIT-MATRIX.md
git commit -m "docs(registry): DOM→IR-Hard-Dupe aufgelöst — Kit 0.17.0 (dom-to-ir/code-blocks/image)"
```

---

## Self-Review Notes

- **Spec-Abdeckung:** Alle sechs Umsetzungs-Abschnitte des Specs (Kit-Module, Tests,
  letterhead-Migration, paperize-Migration, Verifikation, Registry) sind je einem Task
  zugeordnet (Task 1–3 = Spec-Abschnitt 1+2, Task 4 = Versionierung, Task 5/6 = Spec-Abschnitt
  3/4, Task 7 = Spec-Abschnitt 6). Spec-Abschnitt 5 (Verifikation) ist in jeden Task als
  eigener Step eingebettet, kein separater Task nötig.
- **Platzhalter-Scan:** Keine TBD/TODO-Marker; alle Code-Blöcke sind vollständig ausgeschrieben
  (kein "wie oben").
- **Typ-Konsistenz geprüft:** `resolvePlaceholder`-Signatur `(text: string) => number | null`
  ist in Task 2 (Implementierung), Task 5/6 (Call-Sites) identisch. `ExtractedCode`-Typ wird
  nur in Task 2 als `import type` konsumiert, nicht dupliziert. Parameter-Reihenfolge
  `codePlaceholder(prefix, i)` vs. `extractCodeBlocks(md, prefix)`/
  `parseCodePlaceholder(text, prefix)` (prefix zuletzt) ist zwischen Task 1 (Implementierung),
  Task 2 (Test-Aufrufe) und Task 5/6 (Call-Sites) konsistent verwendet.

## Execution Handoff

Plan complete and saved to `obsidian-kit/docs/superpowers/plans/2026-07-28-dom-to-ir-extraction.md`.
