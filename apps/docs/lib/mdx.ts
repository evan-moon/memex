import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { evaluate, type EvaluateOptions } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import type { MDXComponents } from 'mdx/types';
import type { ReactElement } from 'react';
import type { Locale } from '@/app/_components/locale';

const CONTENT_ROOT = join(process.cwd(), 'content', 'docs');

export type DocFrontmatter = {
  title: string;
  description?: string;
};

export type DocSource = {
  slug: string;
  locale: Locale;
  frontmatter: DocFrontmatter;
  Content: (props: { components?: MDXComponents }) => ReactElement;
};

const fileFor = (slug: string, locale: Locale) =>
  join(CONTENT_ROOT, `${slug}.${locale}.mdx`);

export async function loadDoc(slug: string, locale: Locale): Promise<DocSource | null> {
  const targetPath = fileFor(slug, locale);
  const fallbackPath = fileFor(slug, 'en');

  const path = existsSync(targetPath) ? targetPath
             : existsSync(fallbackPath) ? fallbackPath
             : null;
  if (!path) return null;

  const raw = await readFile(path, 'utf-8');
  const { data, content } = matter(raw);

  const compiled = await evaluate(content, {
    ...(runtime as EvaluateOptions),
    development: process.env.NODE_ENV !== 'production',
  });

  return {
    slug,
    locale,
    frontmatter: data as DocFrontmatter,
    Content: compiled.default as DocSource['Content'],
  };
}

export const isLocalized = (slug: string, locale: Locale): boolean =>
  existsSync(fileFor(slug, locale));
