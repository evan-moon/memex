'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const toLocale = (path: string, locale: 'en' | 'ko'): string => {
  const other = locale === 'en' ? 'ko' : 'en';
  if (path === `/${other}`) return `/${locale}`;
  if (path.startsWith(`/${other}/`)) return path.replace(`/${other}/`, `/${locale}/`);
  if (locale === 'ko') return `/ko${path === '/' ? '' : path}`;
  return path;
};

export default function LangToggle() {
  const pathname = usePathname() || '/';
  const onKo = pathname === '/ko' || pathname.startsWith('/ko/');

  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <Link
        href={toLocale(pathname, 'en')}
        className={`lang-toggle-link${!onKo ? ' active' : ''}`}
        aria-current={!onKo ? 'page' : undefined}
      >
        EN
      </Link>
      <span className="lang-toggle-sep">·</span>
      <Link
        href={toLocale(pathname, 'ko')}
        className={`lang-toggle-link${onKo ? ' active' : ''}`}
        aria-current={onKo ? 'page' : undefined}
      >
        한국어
      </Link>
    </div>
  );
}
