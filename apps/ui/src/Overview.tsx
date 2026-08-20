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

const TidyProposal = ({ tidy }: { tidy: Data['tidy'] }) => {
  if (tidy.pairs.length === 0) return null;

  return (
    <section className="mt-6 rounded-card border border-brand/30 bg-brand/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">이 태그들, 하나로 합칠까?</h2>
        <span className="text-xs text-muted">
          철자만 다른 {tidy.pairs.length}쌍 · 노트 {tidy.notes}개
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        같은 주제가 두 이름으로 갈려 있어서, 한쪽으로 검색하면 다른 쪽이 안 걸려.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {tidy.pairs.slice(0, 12).map((p) => (
          <li
            key={p.keep}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs"
          >
            {p.drop.map((d) => (
              <span key={d} className="text-muted line-through">
                {d}
              </span>
            ))}
            <span className="text-muted">&rarr;</span>
            <span className="font-medium">{p.keep}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        정리하려면 <code className="rounded bg-line/60 px-1 py-0.5">memex tags tidy --apply</code>
      </p>
    </section>
  );
};

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
        <Stat
          label="더 이상 맞지 않을 수 있는 노트"
          value={(data.changed + data.review).toLocaleString()}
          hint={`이미 바뀜 ${data.changed} · 다시 볼 것 ${data.review}`}
        />
      </div>

      <TidyProposal tidy={data.tidy} />

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
        <h2 className="text-sm font-semibold">주제별로 얼마나 지난 이야기인가</h2>
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
                {Math.round(s.share * 100)}% 지난 얘기
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
