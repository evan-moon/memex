import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type MemoryPage, type MemoryView } from './api.ts';
import { Button, Page } from './bits.tsx';
import { useT } from './i18n.ts';
import { Pending } from './screens.tsx';
import { useAsync } from './useAsync.ts';

// The correction happens here, in the same place the memory is read. A screen
// that could only say "this is wrong" and then sent somebody somewhere else to
// say what is right is the gap this closes.
const Correct = ({ item, onDone }: { item: MemoryView; onDone: () => void }) => {
  const t = useT();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const send = async (replacement?: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await api.correctMemory({
        target: item.id,
        expectedStatement: item.statement,
        replacement,
        mutationId: crypto.randomUUID(),
      });
      onDone();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause));
    }
    setBusy(false);
  };

  return (
    <div className="mt-2 rounded-md border border-glass-line p-2.5">
      <p className="text-[11px] text-muted">{t.memory.wasSaying(item.statement)}</p>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t.memory.newValue}
        className="mt-2 w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          disabled={busy || value.trim() === ''}
          onClick={() => send(value.trim())}
        >
          {t.memory.apply}
        </Button>
        {/* Not knowing the new value must not stop somebody saying the old one
            is wrong. */}
        <Button disabled={busy} onClick={() => send(undefined)}>
          {t.memory.retire}
        </Button>
      </div>
      {failed === null ? null : <p className="mt-2 text-xs text-danger">{failed}</p>}
    </div>
  );
};

const Item = ({ item, onDone }: { item: MemoryView; onDone: () => void }) => {
  const t = useT();
  const [correcting, setCorrecting] = useState(false);

  return (
    <li className="border-glass-line border-b py-3">
      <p className="text-sm">{item.statement}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
        <span>{t.memory.status[item.status]}</span>
        {item.evidenceState === 'current' ? null : (
          <span style={{ color: 'var(--caution)' }}>{t.memory.evidence[item.evidenceState]}</span>
        )}
        {item.evidence.map((source) =>
          source.title === null ? null : (
            <Link
              key={source.documentId}
              to={`/note/${source.documentId}`}
              className="text-primary"
            >
              {source.title}
            </Link>
          ),
        )}
        {item.status === 'retired' ? null : (
          <button
            type="button"
            onClick={() => setCorrecting(!correcting)}
            className="ml-auto text-primary"
          >
            {t.memory.wrong}
          </button>
        )}
      </p>
      {correcting ? (
        <Correct
          item={item}
          onDone={() => {
            setCorrecting(false);
            onDone();
          }}
        />
      ) : null}
    </li>
  );
};

export const MemoryScreen = () => {
  const t = useT();
  const { subject } = useParams();
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync<MemoryPage>(
    () => (subject === undefined ? api.memory() : api.memoryFor(subject)),
    `${subject ?? 'all'}-${round}`,
  );

  if (!data) return <Pending failure={failure} needs="/api/memory" />;

  return (
    <Page>
      <h1 className="text-lg font-semibold">
        {subject === undefined ? t.memory.title : `${t.memory.title} / ${subject}`}
      </h1>

      {data.subjects.length === 0 ? null : (
        <div className="mt-3 flex flex-wrap gap-1">
          {data.subjects.map((row) => (
            <Link
              key={row.subject}
              to={`/memory/${encodeURIComponent(row.subject)}`}
              className={`rounded-full px-3 py-1 text-xs ${
                row.subject === subject
                  ? 'bg-accent-soft text-foreground'
                  : 'text-muted hover:bg-surface'
              }`}
            >
              {row.subject}
            </Link>
          ))}
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t.memory.empty}</p>
      ) : (
        <ul className="mt-4">
          {data.items.map((item) => (
            <Item key={item.id} item={item} onDone={() => setRound((n) => n + 1)} />
          ))}
        </ul>
      )}
    </Page>
  );
};
