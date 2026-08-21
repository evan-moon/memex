import { ChevronDown, ChevronRight, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Chores as Data } from './api.ts';
import { Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const Chore = ({
  label,
  count,
  hint,
  children,
}: {
  label: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-surface-muted"
      >
        <Chevron size={13} className="shrink-0 text-muted" />
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
        <span className="ml-auto text-sm font-semibold tabular-nums">{count}</span>
      </button>
      {open ? <div className="mb-2 ml-6 mt-1">{children}</div> : null}
    </li>
  );
};

const Rows = ({ children }: { children: React.ReactNode }) => (
  <ul className="flex flex-col gap-1 text-xs">{children}</ul>
);

export const ChoresList = ({ data }: { data: Data }) => {
  const t = useT();
  const total =
    data.hypotheses.total +
    data.undeclared.total +
    data.staleNotes.total +
    data.deadLinks.total +
    data.tagMerges.total +
    data.looseTags.total;

  if (total === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <CircleCheck size={14} style={{ color: 'var(--positive)' }} />
        {t.chores.allClear}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      <Chore label={t.chores.hypotheses} count={data.hypotheses.total}>
        <Rows>
          {data.hypotheses.top.map((hypothesis) => (
            <li key={hypothesis.id} className="truncate">
              <Link to={`/inference/${hypothesis.id}`} className="text-primary hover:underline">
                {hypothesis.title}
              </Link>
            </li>
          ))}
        </Rows>
      </Chore>

      <Chore
        label={t.chores.undeclared}
        count={data.undeclared.total}
        hint={t.chores.undeclaredHint(data.undeclared.top.filter((n) => n.candidates > 0).length)}
      >
        <Rows>
          {data.undeclared.top.map((note) => (
            <li key={note.id} className="truncate">
              <Link to={`/note/${note.id}`} className="text-primary hover:underline">
                {note.title}
              </Link>
            </li>
          ))}
        </Rows>
      </Chore>

      <Chore label={t.chores.staleNotes} count={data.staleNotes.total}>
        <Rows>
          {data.staleNotes.top.map((note) => (
            <li key={note.id} className="truncate">
              <Link to={`/note/${note.id}`} className="text-primary hover:underline">
                {note.title}
              </Link>
              <span className="ml-2 text-muted">{t.chores.staleNotesHint(note.count)}</span>
            </li>
          ))}
        </Rows>
      </Chore>

      <Chore
        label={t.chores.deadLinks}
        count={data.deadLinks.total}
        hint={t.chores.deadLinksHint(data.deadLinks.notes)}
      >
        <Rows>
          {data.deadLinks.top.map((note) => (
            <li key={note.id}>
              <Link to={`/note/${note.id}`} className="text-primary hover:underline">
                {note.title}
              </Link>
              <span className="ml-2 text-muted">{note.targets.map((x) => `[[${x}]]`).join(' ')}</span>
            </li>
          ))}
        </Rows>
      </Chore>

      <Chore label={t.chores.tagMerges} count={data.tagMerges.total}>
        <Rows>
          {data.tagMerges.top.map((pair) => (
            <li key={pair.keep} className="text-muted">
              <span className="line-through">{pair.drop.join(', ')}</span> → {pair.keep}
            </li>
          ))}
          <li className="mt-1">
            <Link to="/tags" className="text-primary hover:underline">
              {t.chores.openTags}
            </Link>
          </li>
        </Rows>
      </Chore>

      <Chore
        label={t.chores.looseTags}
        count={data.looseTags.total}
        hint={t.chores.looseTagsHint(data.looseTags.all)}
      >
        <Rows>
          <li className="text-muted">{data.looseTags.top.join(', ')}…</li>
          <li className="mt-1">
            <Link to="/tags" className="text-primary hover:underline">
              {t.chores.openTags}
            </Link>
          </li>
        </Rows>
      </Chore>
    </ul>
  );
};

export const Chores = () => {
  const t = useT();
  const { data, failure } = useAsync<Data>(() => api.chores(), 'chores');

  return (
    <Card className="mt-5">
      <h2 className="text-sm font-semibold">{t.chores.title}</h2>
      <div className="mt-2">
        {data ? (
          <ChoresList data={data} />
        ) : (
          <p className="text-xs text-muted">{failure ? t.error(failure) : t.common.loading}</p>
        )}
      </div>
    </Card>
  );
};
