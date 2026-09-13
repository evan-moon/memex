import { Link } from 'react-router-dom';
import type { RecoverableDraft } from './draft-recovery.ts';
import { useT } from './i18n.ts';
import { ago } from './time.ts';

export const DraftRecovery = ({
  drafts,
  onDiscard,
}: {
  drafts: RecoverableDraft[];
  onDiscard: (draftKey: string) => void;
}) => {
  const t = useT();
  if (drafts.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xs font-medium text-muted">{t.home.unsavedDrafts}</h2>
      <ul className="mt-2 divide-y divide-glass-line border-glass-line border-y">
        {drafts.map((draft) => (
          <li key={draft.draftKey} className="group flex items-center gap-3 py-3">
            <Link to={draft.path} className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">
                {draft.title || t.home.untitled}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">{draft.snippet}</span>
              <span className="mt-1 block text-[11px] text-primary">{t.home.resumeDraft}</span>
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{ago(t, draft.at)}</span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted opacity-0 hover:bg-surface group-hover:opacity-100 focus:opacity-100"
              onClick={() => onDiscard(draft.draftKey)}
            >
              {t.home.discardDraft}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
