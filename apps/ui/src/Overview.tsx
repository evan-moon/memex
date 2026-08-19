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
import { Spark } from './Spark.tsx';

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-card border border-line bg-surface p-4">
    <div className="text-xs text-muted">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
    {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
  </div>
);

export const Overview = ({ data }: { data: Data }) => {
  const written = data.activity.reduce((a, d) => a + d.notes, 0);
  const active = data.activity.filter((d) => d.notes > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted">볼트에 무엇이 쌓였고, 그중 얼마가 낡았는지</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="노트" value={data.notes.toLocaleString()} hint={`${data.chunks.toLocaleString()} 패시지`} />
        <Stat
          label="연결"
          value={(data.links.wiki + data.links.amends).toLocaleString()}
          hint={`위키 ${data.links.wiki} · 정정 ${data.links.amends}`}
        />
        <Stat label="주제" value={String(data.topics)} hint="20회 이상 쓰인 태그" />
        <Stat label="낡은 노트" value={data.outdated.toLocaleString()} hint="뒤집혔거나 확인 필요" />
      </div>

      <section className="mt-6 rounded-card border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">쓰는 빈도</h2>
          <span className="text-xs text-muted">
            최근 90일 · {written}개 저장 · {active}일 활동
          </span>
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
                formatter={(v) => [`${String(v)}개`, '저장'] as [string, string]}
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
        <h2 className="text-sm font-semibold">태그별 낡은 정도</h2>
        <p className="mt-1 text-xs text-muted">
          선은 최근 1년 주간 활동 — 모든 태그가 같은 축이라 오른쪽이 평평하면 손을 뗀 지 오래됐다는 뜻
        </p>
        <div className="mt-3 divide-y divide-line">
          {data.staleness.map((s) => (
            <Link
              key={s.tag}
              to={`/topic/${encodeURIComponent(s.tag)}`}
              className="flex items-center gap-4 py-2.5 hover:bg-surface-muted"
            >
              <span className="w-28 shrink-0 truncate text-sm font-medium">{s.tag}</span>
              <span className="hidden w-16 shrink-0 text-[11px] tabular-nums text-muted sm:block">
                {s.count}개
              </span>
              <div className="min-w-0 flex-1">
                <Spark values={s.spark} width={220} height={26} fill />
              </div>
              <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {ago(s.lastAt)}
              </span>
              <span
                className="w-16 shrink-0 text-right text-xs tabular-nums"
                style={{ color: 'var(--caution)' }}
              >
                {Math.round(s.share * 100)}% 낡음
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
