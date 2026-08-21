import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { api, type MergeCandidate, type RenameResult, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

type Pending = { from: string[]; to: string };

const nameOf = (candidate: MergeCandidate, swapped: boolean): Pending =>
  swapped && candidate.drop.length === 1
    ? { from: [candidate.keep], to: candidate.drop[0] }
    : { from: candidate.drop, to: candidate.keep };

export const TagMergeRow = ({
  candidate,
  onMerged,
}: {
  candidate: MergeCandidate;
  onMerged: (result: RenameResult) => void;
}) => {
  const t = useT();
  const [swapped, setSwapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = nameOf(candidate, swapped);
  const canSwap = candidate.drop.length === 1;

  const merge = () => {
    setBusy(true);
    setError(null);
    api
      .renameTags(from, to)
      .then(onMerged)
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(false));
  };

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
      <span className="text-xs text-muted line-through">{from.join(', ')}</span>
      <span className="text-xs text-muted">→</span>
      <span className="text-xs font-medium">{to}</span>
      {canSwap ? (
        <button
          type="button"
          onClick={() => setSwapped(!swapped)}
          className="rounded p-1 text-muted hover:bg-surface-muted"
          aria-label={t.tags.swap}
          title={t.tags.swap}
        >
          <ArrowLeftRight size={12} />
        </button>
      ) : null}
      <span className="text-[11px] tabular-nums text-muted">
        {candidate.overlap === undefined
          ? t.tags.affects(candidate.notes)
          : t.tags.overlapping(Math.round(candidate.overlap * 100), candidate.notes)}
      </span>
      <span className="ml-auto">
        <Button onClick={merge} disabled={busy}>
          {busy ? t.tags.merging : t.tags.merge}
        </Button>
      </span>
      {error ? (
        <span className="w-full text-xs" style={{ color: 'var(--negative)' }}>
          {error}
        </span>
      ) : null}
    </li>
  );
};

const Group = ({
  title,
  hint,
  candidates,
  onMerged,
}: {
  title: string;
  hint: string;
  candidates: MergeCandidate[];
  onMerged: (result: RenameResult) => void;
}) => {
  if (candidates.length === 0) return null;
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-xs font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <ul className="mt-1 divide-y divide-line">
        {candidates.map((candidate) => (
          <TagMergeRow
            key={`${candidate.keep}:${candidate.drop.join(',')}`}
            candidate={candidate}
            onMerged={onMerged}
          />
        ))}
      </ul>
    </section>
  );
};

export const TagMerges = () => {
  const t = useT();
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<RenameResult | null>(null);
  const { data } = useAsync<MergeCandidate[]>(() => api.tagMerges(), String(round));

  const onMerged = (next: RenameResult) => {
    setResult(next);
    setRound(round + 1);
  };

  if (!data || data.length === 0) return null;

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold">{t.tags.title}</h2>

      <div className="mt-3">
        <Group
          title={t.tags.spellingTitle}
          hint={t.tags.spellingHint}
          candidates={data.filter((c) => c.kind === 'spelling')}
          onMerged={onMerged}
        />
        <Group
          title={t.tags.overlapTitle}
          hint={t.tags.overlapHint}
          candidates={data.filter((c) => c.kind === 'overlap')}
          onMerged={onMerged}
        />
      </div>

      {result ? (
        <p className="mt-3 text-xs text-muted">
          {t.tags.merged(result.notes, result.files)}
          {result.unwritten.length > 0 ? ` · ${t.tags.unwritten(result.unwritten.length)}` : ''}
          {result.skipped > 0 ? ` · ${t.tags.skipped(result.skipped)}` : ''}
        </p>
      ) : null}
    </Card>
  );
};
