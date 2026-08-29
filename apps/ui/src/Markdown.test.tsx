import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown.tsx';

const render = (md: string, links: { title: string; id: number }[] = []) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Markdown links={links}>{md}</Markdown>
    </MemoryRouter>,
  );

describe('Markdown', () => {
  it('renders headings, lists and emphasis with the doc typography', () => {
    const html = render(['## 소제목', '', '- 하나', '- **둘**', ''].join('\n'));
    expect(html).toContain('<h2 class="doc-h2">소제목</h2>');
    expect(html).toContain('<ul class="doc-ul">');
    expect(html).toContain('<li class="doc-li">하나</li>');
    expect(html).toContain('<strong>둘</strong>');
  });

  it('renders a GFM table inside a scrollable wrapper', () => {
    const html = render(['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n'));
    expect(html).toContain('<div class="doc-table-wrap">');
    expect(html).toContain('<th class="doc-th">a</th>');
    expect(html).toContain('<td class="doc-td">1</td>');
  });

  it('keeps a fenced block as code, not as prose', () => {
    const html = render(['```ts', 'const x = 1;', '```'].join('\n'));
    expect(html).toContain('<pre class="doc-pre">');
    expect(html).toContain('const x = 1;');
  });

  it('links a [[wiki link]] to the note it resolves to', () => {
    const html = render('앞 [[Memex]] 뒤', [{ title: 'Memex', id: 42 }]);
    expect(html).toContain('href="/note/42"');
    expect(html).toContain('class="doc-wiki"');
  });

  it('links a [[wiki link]] whose title has spaces, Hangul and an em dash', () => {
    const html = render('앞 [[모순 탐지 — 낡음 다음에 오는 것]] 뒤', [
      { title: '모순 탐지 — 낡음 다음에 오는 것', id: 2212 },
    ]);
    expect(html).toContain('href="/note/2212"');
    expect(html).toContain('class="doc-wiki"');
    expect(html).not.toContain('doc-wiki-dead');
  });

  it('links a [[wiki link]] whose title has a space but stays ASCII', () => {
    const html = render('[[Engine v2]]', [{ title: 'Engine v2', id: 2217 }]);
    expect(html).toContain('href="/note/2217"');
    expect(html).not.toContain('doc-wiki-dead');
  });

  it('links a [[wiki link|alias]] by its target title, not the display text', () => {
    const html = render('[[UI v2 — 부채 명세서에서 오늘의 큐로|그 문서]]', [
      { title: 'UI v2 — 부채 명세서에서 오늘의 큐로', id: 2218 },
    ]);
    expect(html).toContain('href="/note/2218"');
    expect(html).toContain('그 문서');
  });

  it('links a [[wiki link]] whose title contains a percent sign', () => {
    const html = render('[[50% 규칙]]', [{ title: '50% 규칙', id: 7 }]);
    expect(html).toContain('href="/note/7"');
    expect(html).not.toContain('doc-wiki-dead');
  });

  it('still renders a plain external link as an external link', () => {
    const html = render('[docs](https://example.com/a%20b)');
    expect(html).toContain('class="doc-link"');
    expect(html).toContain('https://example.com/a%20b');
    expect(html).not.toContain('doc-wiki');
  });

  it('marks a [[wiki link]] with no target as dead instead of linking nowhere', () => {
    const html = render('[[없는 노트]]');
    expect(html).toContain('doc-wiki-dead');
    expect(html).not.toContain('href="/note/');
  });

  it('does not linkify a [[wiki link]] written inside code', () => {
    const html = render('`[[Memex]]`', [{ title: 'Memex', id: 42 }]);
    expect(html).toContain('<code class="doc-code">[[Memex]]</code>');
    expect(html).not.toContain('href="/note/42"');
  });

  it('sends an external link out in a new tab', () => {
    const html = render('[opula](https://opula.io)');
    expect(html).toContain('class="doc-link"');
    expect(html).toContain('target="_blank"');
  });
});
