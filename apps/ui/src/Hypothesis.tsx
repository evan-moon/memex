import { Lightbulb, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type ApiFailure, type InferenceDetail, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { day } from './time.ts';
import { useT } from './i18n.ts';
import { Markdown } from './Markdown.tsx';
import { useAsync } from './useAsync.ts';

type Ref = { id: number; title: string; status: string };

// The line a note or a topic carries: a hypothesis is reached through what it
// was read out of, never through a list of all of them.
export const HypothesisLinks = ({
  heading,
  hint,
  refs,
}: {
  heading: string;
  hint: string;
  refs: Ref[];
}) => {
  const t = useT();
  if (refs.length === 0) return null;

  return (
    <Card className="mt-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb size={13} style={{ color: 'var(--brand)' }} />
        {heading}
      </h2>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {refs.map((ref) => (
          <li key={ref.id} className="flex items-baseline gap-2 text-xs">
            <Link
              to={`/inference/${ref.id}`}
              className="min-w-0 truncate text-primary hover:underline"
            >
              {ref.title}
            </Link>
            {ref.status === 'stale' ? (
              <span className="shrink-0" style={{ color: 'var(--caution)' }}>
                {t.hypothesis.stale}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
};

const Sources = ({ evidence }: { evidence: InferenceDetail['evidence'] }) => {
  const t = useT();
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {evidence.map((edge) => (
        <li key={edge.noteId} className="flex flex-wrap items-baseline gap-2 text-xs">
          {edge.changed || edge.missing ? (
            <TriangleAlert size={12} className="shrink-0" style={{ color: 'var(--caution)' }} />
          ) : null}
          <Link to={`/note/${edge.noteId}`} className="truncate text-primary hover:underline">
            {edge.title ?? `#${edge.noteId}`}
          </Link>
          {edge.changed ? (
            <span style={{ color: 'var(--caution)' }}>{t.hypothesis.changed}</span>
          ) : null}
          {edge.missing ? (
            <span style={{ color: 'var(--negative)' }}>{t.hypothesis.missing}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

export const HypothesisBody = ({
  detail,
  onChanged,
}: {
  detail: InferenceDetail;
  onChanged: (next: InferenceDetail | null) => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(false);
  const [proposal, setProposal] = useState<{ title: string; summary: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const { inference, evidence } = detail;
  const shaken = evidence.some((edge) => edge.changed || edge.missing);

  const run = (work: Promise<unknown>, after: () => void) => {
    setBusy(true);
    setFailure(null);
    work
      .then(after)
      .catch((cause: unknown) => setFailure(toFailure(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7">
      <p className="text-xs text-muted">{t.hypothesis.heading}</p>
      <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight">{inference.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
        <span className="tabular-nums">{day(inference.createdAt)}</span>
        {inference.confidence === null ? null : (
          <span>{t.hypothesis.confidence(inference.confidence)}</span>
        )}
        {inference.modelId ? <span>{t.hypothesis.by(inference.modelId)}</span> : null}
      </div>

      <article className="mt-6">
        <Markdown>{inference.summary}</Markdown>
      </article>

      <Card className="mt-8">
        <h2 className="text-sm font-semibold">{t.hypothesis.builtFrom}</h2>
        <Sources evidence={evidence} />
        <p className="mt-3 text-xs text-muted">
          {shaken ? t.hypothesis.shaken : t.hypothesis.holds}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            tone="primary"
            onClick={() => run(api.promoteInference(inference.id), () => navigate('/'))}
            disabled={busy}
          >
            {t.hypothesis.promote}
          </Button>
          {shaken ? (
            <Button
              onClick={() => run(api.keepInference(inference.id), () => undefined)}
              disabled={busy}
            >
              {t.hypothesis.keep}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setReading(true);
              api
                .redraftInference(inference.id)
                .then(setProposal)
                .catch((cause: unknown) => setFailure(toFailure(cause)))
                .finally(() => setReading(false));
            }}
            disabled={busy || reading}
          >
            {reading ? t.hypothesis.redrafting : t.hypothesis.redraft}
          </Button>
          <Button
            onClick={() => run(api.archiveInference(inference.id), () => onChanged(null))}
            disabled={busy}
          >
            {t.hypothesis.archive}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {reading ? t.hypothesis.redraftHint : t.hypothesis.promoteHint}
        </p>

        {proposal ? (
          <div className="mt-4 rounded-card border border-line bg-background p-3">
            <div className="text-xs font-semibold text-muted">{t.hypothesis.proposed}</div>
            <h3 className="mt-2 text-sm font-semibold">{proposal.title}</h3>
            <div className="mt-2 text-xs leading-6">
              <Markdown>{proposal.summary}</Markdown>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                tone="primary"
                onClick={() =>
                  run(api.rewriteInference(inference.id, proposal), () => setProposal(null))
                }
                disabled={busy}
              >
                {t.hypothesis.save}
              </Button>
              <Button onClick={() => setProposal(null)} disabled={busy}>
                {t.hypothesis.discardDraft}
              </Button>
            </div>
          </div>
        ) : null}

        {failure ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
            {t.error(failure)}
          </p>
        ) : null}
      </Card>

      {inference.promptText ? (
        <Card className="mt-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{t.hypothesis.bundle}</h2>
            <span className="ml-auto">
              <Button onClick={() => setBundle(!bundle)}>
                {bundle ? t.hypothesis.hideBundle : t.hypothesis.showBundle}
              </Button>
            </span>
          </div>
          {bundle ? (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-card border border-line bg-background p-3 font-mono text-[11px] leading-5">
              {inference.promptText}
            </pre>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
};

export const HypothesisScreen = () => {
  const t = useT();
  const { id = '' } = useParams();
  const { data, failure } = useAsync<InferenceDetail>(() => api.inference(Number(id)), id);
  const [discarded, setDiscarded] = useState(false);

  if (discarded) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">{t.hypothesis.gone}</div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">
        {failure ? t.error(failure) : t.common.loading}
      </div>
    );
  }
  return <HypothesisBody detail={data} onChanged={(next) => setDiscarded(next === null)} />;
};
