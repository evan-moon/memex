'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/app/_components/LocaleContext';
import type { Locale } from '@/app/_components/locale';

const DOCS_ROUTES: { slug: string; localized: Locale[]; group: string }[] = [
  { slug: 'getting-started', group: 'Get Started', localized: ['en', 'ko'] },
  { slug: 'mcp-tools',       group: 'Get Started', localized: ['en', 'ko'] },
  { slug: 'layers',          group: 'Concepts',    localized: ['en', 'ko'] },
  { slug: 'flashback',       group: 'Concepts',    localized: ['en', 'ko'] },
  { slug: 'inference-engine',group: 'Concepts',    localized: ['en', 'ko'] },
  { slug: 'cli',             group: 'Reference',   localized: ['en', 'ko'] },
  { slug: 'search',          group: 'Reference',   localized: ['en', 'ko'] },
  { slug: 'backlinks-digest',group: 'Reference',   localized: ['en', 'ko'] },
  { slug: 'ecosystem',       group: 'Ecosystem',   localized: ['en', 'ko'] },
];

const LABELS: Record<Locale, Record<string, string>> = {
  en: {
    'Get Started': 'Get Started',
    'Concepts':    'Concepts',
    'Reference':   'Reference',
    'getting-started':  'Installation',
    'mcp-tools':        'MCP Tools',
    'layers':           'Note Layers',
    'flashback':        'Flashback',
    'inference-engine': 'Inference Engine',
    'cli':              'CLI Reference',
    'search':           'Semantic Search',
    'backlinks-digest': 'Backlinks & Digest',
    'Ecosystem':        'Ecosystem',
    'ecosystem':        'The Herald Family',
  },
  ko: {
    'Get Started': 'Get Started',
    'Concepts':    'Concepts',
    'Reference':   'Reference',
    'getting-started':  '설치 및 시작',
    'mcp-tools':        'MCP 툴',
    'layers':           '노트 레이어',
    'flashback':        '플래시백',
    'inference-engine': '추론 엔진',
    'cli':              'CLI 레퍼런스',
    'search':           '시맨틱 검색',
    'backlinks-digest': '백링크 & 다이제스트',
    'Ecosystem':        'Ecosystem',
    'ecosystem':        'Herald 패밀리',
  },
};

export default function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useLocale();
  const pathname = usePathname() ?? '';
  const labels = LABELS[locale];

  const groups = DOCS_ROUTES.reduce<Map<string, typeof DOCS_ROUTES>>((acc, route) => {
    const list = acc.get(route.group) ?? [];
    list.push(route);
    acc.set(route.group, list);
    return acc;
  }, new Map());

  return (
    <nav className="docs-sidebar">
      {[...groups.entries()].map(([groupLabel, routes]) => (
        <div key={groupLabel} className="docs-nav-group">
          <p className="docs-nav-title">{labels[groupLabel] ?? groupLabel}</p>
          {routes.map(({ slug, localized }) => {
            const href = `/${locale}/docs/${slug}`;
            const translated = localized.includes(locale);
            return (
              <Link
                key={slug}
                href={href}
                className={`docs-nav-link${pathname === href ? ' active' : ''}`}
                onClick={onNavigate}
              >
                {labels[slug] ?? slug}
                {!translated && <span className="docs-nav-en-tag">EN</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
