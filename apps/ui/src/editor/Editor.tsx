import { autocompletion, type CompletionSource } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { useEffect, useRef } from 'react';
import { livePreview } from './preview.ts';
import { Tag, WikiLink } from './syntax.ts';
import { editorHighlight, editorTheme } from './theme.ts';

// `[[` offers what the vault already has. Titles are the link, so this is the
// one place a writer needs to know what exists without leaving the line.
const wikiCompletion =
  (titles: () => string[]): CompletionSource =>
  (context) => {
    const opened = context.matchBefore(/\[\[[^\]]*/);
    if (opened === null) return null;
    const typed = opened.text.slice(2);
    if (typed === '' && !context.explicit) return null;
    return {
      from: opened.from + 2,
      options: titles()
        .filter((title) => title.toLowerCase().includes(typed.toLowerCase()))
        .slice(0, 20)
        .map((title) => ({ label: title, type: 'text' })),
    };
  };

export const MarkdownEditor = ({
  value,
  onChange,
  titles,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  titles?: () => string[];
  placeholder?: string;
  autoFocus?: boolean;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the view is built once and fed by transactions, not rebuilt per render
  useEffect(() => {
    if (host.current === null) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          search({ top: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, extensions: [GFM, WikiLink, Tag] }),
          EditorView.lineWrapping,
          editorTheme,
          editorHighlight,
          livePreview,
          ...(titles ? [autocompletion({ override: [wikiCompletion(titles)] })] : []),
          ...(placeholder === undefined ? [] : [placeholderExt(placeholder)]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  // Only when the note underneath changed. Writing every keystroke back would
  // fight the caret, which is the classic way a controlled editor loses the
  // cursor mid-word.
  useEffect(() => {
    const editor = view.current;
    if (editor === null || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="memex-editor" />;
};
