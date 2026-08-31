import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { type Extension, type Range, RangeSet, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

// Live preview is one rule with two grains. A block's markers — a heading's
// hashes, a quote's angle — come back when the caret is anywhere on their line,
// because the line is the block. An inline one comes back only when the caret is
// inside that very span: putting the cursor at the end of a paragraph should not
// make every `**` in it reappear.
const caretLines = (state: EditorState): Set<number> => {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
};

const HIDE = Decoration.replace({});

// Which construct a marker belongs to. `CodeMark` is both a fence and a backtick
// depending on its parent, so the parent is what decides the grain.
const BLOCK_MARKS = new Set(['HeaderMark', 'QuoteMark', 'ListMark', 'CodeInfo']);

const isBlockMark = (name: string, parent: string | null) =>
  BLOCK_MARKS.has(name) || (name === 'CodeMark' && parent === 'FencedCode');

class Chip extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly cls: string,
  ) {
    super();
  }
  eq(other: Chip) {
    return other.text === this.text && other.cls === this.cls;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = this.cls;
    span.textContent = this.text;
    return span;
  }
}

// A table is the one construct whose shape cannot be reached with marks alone —
// columns have to line up, and pipes are not columns. It is drawn as a widget
// while the caret is elsewhere, and becomes text again the moment it enters.
class Table extends WidgetType {
  constructor(private readonly rows: string[][]) {
    super();
  }
  eq(other: Table) {
    return JSON.stringify(other.rows) === JSON.stringify(this.rows);
  }
  toDOM() {
    const table = document.createElement('table');
    table.className = 'cm-table';
    const [head, ...body] = this.rows;
    if (head !== undefined) {
      const tr = table.createTHead().insertRow();
      for (const cell of head) {
        const th = document.createElement('th');
        th.textContent = cell;
        tr.appendChild(th);
      }
    }
    const tbody = table.createTBody();
    for (const row of body) {
      const tr = tbody.insertRow();
      for (const cell of row) tr.insertCell().textContent = cell;
    }
    return table;
  }
}

const cellsOf = (line: string) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isDivider = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('-');

class Checkbox extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly at: number,
  ) {
    super();
  }
  eq(other: Checkbox) {
    return other.checked === this.checked && other.at === this.at;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-task';
    // A checkbox nobody can tick is a picture of a checkbox. The click writes
    // the character back into the document, so the file stays the truth.
    box.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({
        changes: { from: this.at, to: this.at + 1, insert: this.checked ? ' ' : 'x' },
      });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

const HEADINGS: Record<string, string> = {
  ATXHeading1: 'cm-h1',
  ATXHeading2: 'cm-h2',
  ATXHeading3: 'cm-h3',
  ATXHeading4: 'cm-h4',
  ATXHeading5: 'cm-h5',
  ATXHeading6: 'cm-h6',
};

const INLINE: Record<string, string> = {
  StrongEmphasis: 'cm-strong',
  Emphasis: 'cm-em',
  Strikethrough: 'cm-strike',
  InlineCode: 'cm-code',
  WikiLink: 'cm-wiki',
  Tag: 'cm-tag',
};

// Hidden outright once the caret leaves the line. `URL` and `CodeInfo` are here
// because a link should read as its label and a fence should not announce its
// language — showing either is showing the plumbing.
const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'WikiLinkMark',
  'QuoteMark',
  'URL',
  'CodeInfo',
]);

const decorate = (state: EditorState): DecorationSet => {
  const live = caretLines(state);
  const found: Range<Decoration>[] = [];
  const onLine = (from: number) => live.has(state.doc.lineAt(from).number);
  // Touching either end counts: a caret sitting just after `**bold**` is still
  // working on it, and hiding the markers there would move the text under the
  // cursor as it arrived.
  const touches = (from: number, to: number) =>
    state.selection.ranges.some((range) => range.to >= from && range.from <= to);

  syntaxTree(state).iterate({
    enter: (node) => {
      const line = HEADINGS[node.name];
      if (line !== undefined) {
        found.push(Decoration.line({ class: line }).range(state.doc.lineAt(node.from).from));
        return;
      }
      const inline = INLINE[node.name];
      if (inline !== undefined) {
        found.push(Decoration.mark({ class: inline }).range(node.from, node.to));
        return;
      }
      // A bare `<url>` autolink has no label, so hiding the address would leave
      // the line empty. Only a labelled link gives its address up.
      if (node.name === 'Link') {
        found.push(Decoration.mark({ class: 'cm-link' }).range(node.from, node.to));
        return;
      }
      if (node.name === 'Table' && !live.has(state.doc.lineAt(node.from).number)) {
        const last = state.doc.lineAt(node.to).number;
        const first = state.doc.lineAt(node.from).number;
        // Revealed as text whenever the caret is anywhere in the table, not just
        // on its first line: editing a cell means seeing the pipes.
        if ([...live].some((n) => n >= first && n <= last)) return;
        const rows = [];
        for (let n = first; n <= last; n += 1) {
          const text = state.doc.line(n).text;
          if (!isDivider(text)) rows.push(cellsOf(text));
        }
        found.push(
          Decoration.replace({ widget: new Table(rows), block: true }).range(node.from, node.to),
        );
        return;
      }
      if (node.name === 'FencedCode') {
        for (let at = node.from; at <= node.to; ) {
          const fenced = state.doc.lineAt(at);
          found.push(Decoration.line({ class: 'cm-fence' }).range(fenced.from));
          if (fenced.to >= node.to) break;
          at = fenced.to + 1;
        }
        return;
      }
      if (node.name === 'Blockquote') {
        for (let at = node.from; at <= node.to; ) {
          const at_line = state.doc.lineAt(at);
          found.push(Decoration.line({ class: 'cm-quote' }).range(at_line.from));
          if (at_line.to >= node.to) break;
          at = at_line.to + 1;
        }
        return;
      }
      if (node.name === 'HorizontalRule' && !onLine(node.from)) {
        found.push(Decoration.replace({ widget: new Chip('', 'cm-hr') }).range(node.from, node.to));
        return;
      }
      if (node.name === 'ListMark' && !onLine(node.from)) {
        const text = state.doc.sliceString(node.from, node.to);
        // An ordered list keeps its number; a bullet is drawn rather than typed.
        if (/^[-*+]$/.test(text)) {
          found.push(
            Decoration.replace({ widget: new Chip('•', 'cm-bullet') }).range(node.from, node.to),
          );
        }
        return;
      }
      if (node.name === 'TaskMarker') {
        const text = state.doc.sliceString(node.from, node.to);
        found.push(
          Decoration.replace({
            widget: new Checkbox(/x/i.test(text), node.from + 1),
          }).range(node.from, node.to),
        );
        return;
      }
      if (!MARKS.has(node.name)) return;
      const parent = node.node.parent;
      const revealed = isBlockMark(node.name, parent?.name ?? null)
        ? onLine(node.from)
        : touches(parent?.from ?? node.from, parent?.to ?? node.to);
      if (!revealed) found.push(HIDE.range(node.from, node.to));
    },
  });

  return RangeSet.of(found, true);
};

export const livePreview: Extension = StateField.define<DecorationSet>({
  create: decorate,
  update: (value, tr) =>
    tr.docChanged || tr.selection ? decorate(tr.state) : value.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field),
});
