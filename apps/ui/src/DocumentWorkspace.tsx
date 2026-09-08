import { useEffect, useState } from 'react';
import { api, type DocumentReference, type NoteDetail } from './api.ts';
import { useT } from './i18n.ts';
import { rememberSidePanel, type SidePanel, sidePanelShown } from './panels.ts';
import { ReferencePanel } from './ReferencePanel.tsx';

// The document, and optionally what it is being written from beside it. The
// panel is a companion to the page rather than a place of its own, which is why
// it has no route: closing it must leave the document exactly where it was.
//
// Below 960px it becomes an overlay instead of a column. The document keeps its
// state either way — the spec is explicit that a narrow window may not cost you
// your place.
export const DocumentWorkspace = ({
  note,
  children,
}: {
  note: NoteDetail;
  children: React.ReactNode;
}) => {
  const t = useT();
  const [panel, setPanel] = useState<SidePanel>(sidePanelShown);
  const [references, setReferences] = useState<DocumentReference[]>([]);

  useEffect(() => {
    api
      .references(note.id)
      .then(setReferences)
      .catch(() => setReferences([]));
  }, [note.id]);

  const show = (next: SidePanel) => {
    const settled = panel === next ? null : next;
    setPanel(settled);
    rememberSidePanel(settled);
  };

  return (
    <div className="flex min-h-0 w-full gap-0">
      <div className="min-w-0 flex-1">{children}</div>

      <div className="shrink-0 border-glass-line border-l px-2 py-3">
        <button
          type="button"
          onClick={() => show('references')}
          aria-pressed={panel === 'references'}
          className={`rounded-md px-2 py-1 text-[11px] ${
            panel === 'references' ? 'bg-accent-soft text-foreground' : 'text-muted'
          }`}
        >
          {t.references.tab(references.length)}
        </button>
      </div>

      {panel === null ? null : (
        <aside className="w-[22rem] shrink-0 overflow-y-auto border-glass-line border-l p-3">
          <ReferencePanel documentId={note.id} references={references} onChanged={setReferences} />
        </aside>
      )}
    </div>
  );
};
