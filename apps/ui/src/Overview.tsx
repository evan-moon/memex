import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Overview as Data } from './api.ts';
import { ago } from './bits.tsx';
import { useT } from './i18n.ts';
import { Chores } from './Chores.tsx';
import { Spark } from './Spark.tsx';
import { ThisWeek } from './ThisWeek.tsx';

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-card border border-line bg-surface p-4">
    <div className="text-xs text-muted">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
    {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
  </div>
);

export const Overview = ({ data }: { data: Data }) => {
  const t = useT();
  const written = data.activity.reduce((a, d) => a + d.notes, 0);
  const active = data.activity.filter((d) => d.notes > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <h1 className="text-xl font-semibold tracking-tight">{t.overview.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.overview.subtitle}</p>

      <Chores />

      <ThisWeek />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t.overview.notes}
          value={data.notes.toLocaleString()}
          hint={t.overview.passages(data.chunks)}
        />
        <Stat
          label={t.overview.links}
          value={(data.links.wiki + data.links.amends).toLocaleString()}
          hint={t.overview.linkBreakdown(data.links.wiki, data.links.amends)}
        />
        <Stat
          label={t.overview.topics}
          value={String(data.topics)}
          hint={t.overview.topicsHint}
        />
        <Stat
          label={t.overview.mayNotHold}
          value={(data.changed + data.review).toLocaleString()}
          hint={t.common.staleBreakdown(data.changed, data.review)}
        />
      </div>

      <section className="mt-6 rounded-card border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">{t.overview.activityTitle}</h2>
          <span className="text-xs text-muted">{t.overview.activityRange(written, active)}</span>
        </div>
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.activity} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
                minTickGap={40}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                allowDecimals={false}
                width={44}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--foreground)',
                }}
                labelStyle={{ color: 'var(--muted-foreground)' }}
                formatter={(v) => [t.common.notes(Number(v)), t.overview.saved] as [string, string]}
              />
              <Area
                type="monotone"
                dataKey="notes"
                stroke="var(--brand)"
                strokeWidth={2}
                fill="url(#fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold">{t.overview.stalenessTitle}</h2>
        <p className="mt-1 text-xs text-muted">{t.overview.stalenessHint}</p>
        <div className="mt-3 divide-y divide-line">
          {data.staleness.map((s) => (
            <Link
              key={s.tag}
              to={`/topic/${encodeURIComponent(s.tag)}`}
              className="flex items-center gap-4 py-2.5 hover:bg-surface-muted"
            >
              <span className="w-28 shrink-0 truncate text-sm font-medium">{s.tag}</span>
              <span className="hidden w-16 shrink-0 text-[11px] tabular-nums text-muted sm:block">
                {t.common.notes(s.count)}
              </span>
              <div className="min-w-0 flex-1">
                <Spark values={s.spark} width={220} height={26} fill />
              </div>
              <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {ago(t, s.lastAt)}
              </span>
              <span
                className="w-16 shrink-0 text-right text-xs tabular-nums"
                style={{ color: 'var(--caution)' }}
              >
                {t.overview.stalenessShare(Math.round(s.share * 100))}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
