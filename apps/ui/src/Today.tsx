import { ChevronDown, ChevronRight, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Buried, type Today as Data, type TodayItem } from './api.ts';
import { Card } from './bits.tsx';
import { type Strings, useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const WHEN: Record<TodayItem['kind'], 'now' | 'soon'> = {
  'evidence-moved': 'now',
  'typo-link': 'now',
  undeclared: 'soon',
};

const hrefOf = (item: TodayItem) =>
  item.kind === 'evidence-moved' ? `/inference/${item.id}` : `/note/${item.id}`;

const labelOf = (item: TodayItem, t: Strings) =>
  item.kind === 'evidence-moved'
    ? t.today.evidenceMoved
    : item.kind === 'typo-link'
      ? t.today.typoLink
      : t.today.undeclared;

const hintOf = (item: TodayItem, t: Strings) =>
  item.kind === 'typo-link'
    ? t.today.typoHint(item.target, item.nearest)
    : item.kind === 'undeclared'
      ? t.today.undeclaredHint(item.candidates)
      : null;

const Row = ({ item }: { item: TodayItem }) => {
  const t = useT();
  const when = WHEN[item.kind];
  return (
    <li>
      <Link
        to={hrefOf(item)}
        className="flex items-baseline gap-2 rounded-md px-2 py-2 hover:bg-surface-muted"
      >
        <span
          className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 ${
            when === 'now' ? 'border-line-strong text-foreground' : 'border-line text-muted'
          }`}
        >
          {when === 'now' ? t.today.now : t.today.soon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm">{labelOf(item, t)}</span>
          <span className="ml-2 text-xs text-muted">{item.title}</span>
        </span>
        {hintOf(item, t) ? (
          <span className="shrink-0 text-[11px] text-muted">{hintOf(item, t)}</span>
        ) : null}
      </Link>
    </li>
  );
};

const buriedLines = (buried: Buried, t: Strings) =>
  [
    buried.undeclared > 0 ? t.today.buriedUndeclared(buried.undeclared) : null,
    buried.staleNotes > 0 ? t.today.buriedStale(buried.staleNotes) : null,
    buried.forwardLinks > 0 ? t.today.buriedForward(buried.forwardLinks) : null,
    buried.placeholders > 0 ? t.today.buriedPlaceholders(buried.placeholders) : null,
    buried.tagMerges > 0 ? t.today.buriedTagMerges(buried.tagMerges) : null,
    buried.looseTags > 0 ? t.today.buriedLooseTags(buried.looseTags) : null,
  ].filter((line): line is string => line !== null);

export const TodayCard = ({ data }: { data: Data }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const lines = buriedLines(data.buried, t);

  return (
    <Card className="mt-5">
      {data.items.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <CircleCheck size={15} className="shrink-0 text-muted" />
          <span className="text-sm">{t.today.empty}</span>
          <span className="text-xs text-muted">{t.today.emptyLead}</span>
        </div>
      ) : (
        <>
          <h2 className="text-base font-semibold">{t.today.title(data.items.length)}</h2>
          <p className="mt-1 text-sm text-muted">{t.today.lead}</p>
          <ul className="mt-3 flex flex-col">
            {data.items.map((item) => (
              <Row key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
          <Link
            to="/repair/evidence"
            className="mt-3 inline-block rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            {t.today.start}
          </Link>
        </>
      )}

      {lines.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs text-muted hover:bg-surface-muted"
          >
            <Chevron size={13} className="shrink-0" />
            {t.today.buried}
          </button>
          {open ? (
            <p className="mt-2 px-1 text-xs leading-6 text-muted">{lines.join(' · ')}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
};

export const Today = () => {
  const { data } = useAsync<Data>(() => api.today(), 'today');
  return data ? <TodayCard data={data} /> : null;
};
