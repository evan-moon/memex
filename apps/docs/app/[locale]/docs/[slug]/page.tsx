import { readdirSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale } from '@/app/_components/locale';
import { mdxComponents } from '@/app/_components/mdx-components';
import { loadDoc } from '@/lib/mdx';

export function generateStaticParams() {
  const contentDir = join(process.cwd(), 'content', 'docs');
  const files = readdirSync(contentDir);
  const slugs = new Set<string>();
  for (const file of files) {
    const match = file.match(/^(.+)\.(en|ko)\.mdx$/);
    if (match) slugs.add(match[1]);
  }
  return ['en', 'ko'].flatMap((locale) => [...slugs].map((slug) => ({ locale, slug })));
}

type RouteParams = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const doc = await loadDoc(slug, locale);
  if (!doc) return {};
  const suffix = locale === 'ko' ? 'memex 문서' : 'memex Docs';
  return {
    title: `${doc.frontmatter.title} · ${suffix}`,
    description: doc.frontmatter.description,
  };
}

export default async function DocsArticlePage({ params }: { params: Promise<RouteParams> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const doc = await loadDoc(slug, locale);
  if (!doc) notFound();

  const { Content } = doc;

  return (
    <article className="docs-article">
      <div className="docs-hero">
        <h1 className="docs-h1">{doc.frontmatter.title}</h1>
        {doc.frontmatter.description && <p className="docs-desc">{doc.frontmatter.description}</p>}
      </div>
      <Content components={mdxComponents} />
      <footer className="docs-footer">
        <span>
          MIT License ·{' '}
          <a href="https://github.com/evan-moon/memex" className="docs-link">
            GitHub
          </a>
        </span>
      </footer>
    </article>
  );
}
