import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// Sizes rather than colours do most of the work: a heading reads as a heading
// because it is bigger, the way it does in the note screen next door.
export const editorTheme = EditorView.theme({
  '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: '15px' },
  '.cm-content': {
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
    lineHeight: '1.75',
    padding: '0',
    caretColor: 'var(--primary)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-h1': { fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-h2': { fontSize: '1.4em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-h3': { fontSize: '1.18em', fontWeight: '650' },
  '.cm-h4': { fontSize: '1.05em', fontWeight: '650' },
  '.cm-h5': { fontWeight: '650' },
  '.cm-h6': { fontWeight: '650', color: 'var(--muted-foreground)' },
  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--muted-foreground)' },
  '.cm-code': {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
    fontSize: '0.86em',
    background: 'var(--surface-muted)',
    borderRadius: '0.35rem',
    padding: '0.1em 0.35em',
  },
  '.cm-wiki': { color: 'var(--primary)' },
  '.cm-link': { color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-tag': {
    color: 'var(--brand)',
    background: 'var(--accent-soft)',
    borderRadius: '9999px',
    padding: '0.05em 0.5em',
    fontSize: '0.88em',
  },
  '.cm-table': {
    borderCollapse: 'collapse',
    margin: '0.4em 0',
    fontSize: '0.94em',
    width: 'auto',
  },
  '.cm-table th, .cm-table td': {
    border: '1px solid var(--border)',
    padding: '0.35em 0.7em',
    textAlign: 'left',
  },
  '.cm-table th': { background: 'var(--surface-muted)', fontWeight: '650' },
  '.cm-fence': {
    background: 'var(--surface-muted)',
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
    fontSize: '0.86em',
  },
  '.cm-bullet': { color: 'var(--muted-foreground)' },
  '.cm-task': { accentColor: 'var(--primary)', marginRight: '0.15em', verticalAlign: 'middle' },
  '.cm-quote': {
    borderLeft: '2px solid var(--border)',
    paddingLeft: '0.9rem',
    color: 'var(--muted-foreground)',
  },
  '.cm-hr': {
    display: 'inline-block',
    width: '100%',
    borderTop: '1px solid var(--border)',
    verticalAlign: 'middle',
  },
  '.cm-tooltip': {
    background: 'var(--reading)',
    border: '1px solid var(--border)',
    borderRadius: '0.6rem',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--accent-soft)',
    color: 'var(--foreground)',
  },
});

// Only what the decorations do not already say. Fenced code is the one place
// the tree, not the caret, decides the colour.
export const editorHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.monospace, color: 'var(--positive)' },
    { tag: t.comment, color: 'var(--muted-foreground)' },
    { tag: t.keyword, color: 'var(--brand)' },
    { tag: t.string, color: 'var(--positive)' },
    { tag: t.number, color: 'var(--caution)' },
  ]),
);
