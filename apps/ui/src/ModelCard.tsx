import { useEffect, useState } from 'react';
import { api, type ModelState, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const POLL_MS = 1000;

const Bar = ({ loaded, total }: { loaded: number; total: number }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
    <div
      className="h-full rounded-full bg-primary transition-[width] duration-300"
      style={{ width: `${total === 0 ? 4 : Math.min(100, (loaded / total) * 100)}%` }}
    />
  </div>
);

export const ModelCard = () => {
  const t = useT();
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync(() => api.model(), String(round));
  const [live, setLive] = useState<ModelState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = live ?? data;
  const downloading = state?.kind === 'downloading';

  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => {
      api
        .model()
        .then(setLive)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [downloading]);

  if (state === null || failure) return null;

  if (state.kind === 'ready')
    return (
      <p className="text-[11px] text-muted">
        <span className="text-primary">✓</span> {t.model.ready}
      </p>
    );

  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{t.model.title}</h3>

      {state.kind === 'downloading' ? (
        <div className="space-y-1.5">
          <Bar loaded={state.loaded} total={state.total} />
          <p className="text-[11px] text-muted">
            {state.total === 0
              ? t.model.starting
              : t.model.progress(
                  Math.round(state.loaded / 1_000_000),
                  Math.round(state.total / 1_000_000),
                )}
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted">
            {state.kind === 'failed' ? state.error : t.model.detail}
          </p>
          <Button
            tone="primary"
            onClick={() => {
              setError(null);
              api
                .downloadModel()
                .then((next) => {
                  setLive(next);
                  setRound((n) => n + 1);
                })
                .catch((cause: unknown) => setError(t.error(toFailure(cause))));
            }}
          >
            {state.kind === 'failed' ? t.model.retry : t.model.download}
          </Button>
        </>
      )}

      {error !== null && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-muted">{t.model.meanwhile}</p>
    </Card>
  );
};
