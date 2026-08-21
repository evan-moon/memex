import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, type RenameResult, type TagRow, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { TagMerges } from './TagMerges.tsx';
import { useAsync } from './useAsync.ts';

const PAGE = 200;

const inputClass =
  'rounded-md border border-line bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary';

type Change = (result: RenameResult) => void;

export const TagRowItem = ({ row, onChanged }: { row: TagRow; onChanged: Change }) => {
  const t = useT();
  const [name, setName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = row.mine > 0;

  const run = (work: Promise<RenameResult>) => {
    setBusy(true);
    setError(null);
    work
      .then(onChanged)
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => {
        setBusy(false);
        setName(null);
        setConfirming(false);
      });
  };

  const rename = () => {
    const next = (name ?? '').trim();
    if (next.length === 0 || next === row.tag) return setName(null);
    run(api.renameTags([row.tag], next));
  };

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
      {name === null ? (
        <button
          type="button"
          onClick={() => editable && setName(row.tag)}
          disabled={!editable}
          className={`truncate text-xs ${editable ? 'hover:underline' : 'cursor-default text-muted'}`}
          title={editable ? t.tags.rename : t.tags.outsideHint}
        >
          {row.tag}
        </button>
      ) : (
        <input
          // biome-ignore lint/a11y/noAutofocus: the field replaces the name you just clicked
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename();
            if (e.key === 'Escape') setName(null);
          }}
          onBlur={() => setName(null)}
          className={inputClass}
        />
      )}

      <span className="text-[11px] tabular-nums text-muted">
        {row.mine === row.notes ? row.notes : t.tags.partly(row.mine, row.notes)}
      </span>

      {editable ? null : (
        <span className="rounded-full border border-line px-2 text-[10px] text-muted">
          {t.tags.outside}
        </span>
      )}

      {name !== null ? <span className="text-[11px] text-muted">{t.tags.renameHint}</span> : null}

      {editable ? (
        <span className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[11px]" style={{ color: 'var(--caution)' }}>
                {t.tags.confirmRemove(row.mine)}
              </span>
              <Button onClick={() => run(api.deleteTags([row.tag]))} disabled={busy}>
                {t.tags.remove}
              </Button>
              <Button onClick={() => setConfirming(false)} disabled={busy}>
                {t.edit.cancel}
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded p-1 text-muted hover:bg-surface-muted"
              aria-label={t.tags.remove}
              title={t.tags.remove}
            >
              <Trash2 size={12} />
            </button>
          )}
        </span>
      ) : null}

      {error ? (
        <span className="w-full text-xs" style={{ color: 'var(--negative)' }}>
          {error}
        </span>
      ) : null}
    </li>
  );
};

export const TagsScreen = () => {
  const t = useT();
  const [round, setRound] = useState(0);
  const [query, setQuery] = useState('');
  const [onlyOnce, setOnlyOnce] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const { data, failure } = useAsync<TagRow[]>(() => api.tags(), String(round));

  const onChanged = () => {
    setShown(PAGE);
    setRound(round + 1);
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-6 sm:px-7">
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const matching = data.filter(
    (row) =>
      (needle.length === 0 || row.tag.toLowerCase().includes(needle)) &&
      (!onlyOnce || row.notes === 1),
  );
  const rest = matching.length - shown;

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 sm:px-7">
      <h1 className="text-xl font-semibold tracking-tight">{t.tags.screenTitle}</h1>
      <p className="mt-1 text-sm text-muted">
        {t.tags.summary(data.length, data.filter((row) => row.mine > 0).length)}
        {' · '}
        {t.tags.onceHint(data.filter((row) => row.notes === 1).length)}
      </p>

      <TagMerges />

      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={t.tags.filter}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              setOnlyOnce(!onlyOnce);
              setShown(PAGE);
            }}
            className={`rounded-md px-2 py-1 text-[11px] ${
              onlyOnce ? 'bg-surface-muted text-foreground' : 'text-muted hover:bg-surface'
            }`}
          >
            {t.tags.onlyOnce}
          </button>
        </div>

        {matching.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t.tags.nothing}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {matching.slice(0, shown).map((row) => (
              <TagRowItem key={row.tag} row={row} onChanged={onChanged} />
            ))}
          </ul>
        )}

        {rest > 0 ? (
          <button
            type="button"
            onClick={() => setShown(shown + PAGE)}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-muted"
          >
            {t.tags.showMore(rest)}
          </button>
        ) : null}
      </Card>
    </div>
  );
};
