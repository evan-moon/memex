'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const stripKo = (path: string): string => {
  if (path === '/ko') return '/';
  if (path.startsWith('/ko/')) return path.replace(/\/ko\//, '/en/');
  return path;
};

const targetKo = (path: string): string => {
  if (path === '/') return '/ko';
  return path.replace(/\/en\//, '/ko/');
};

export default function LangToggle() {
  const pathname = usePathname() || '/';
  const onKo = pathname === '/ko' || pathname.startsWith('/ko/');

  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <Link
        href={stripKo(pathname)}
        className={`lang-toggle-link${!onKo ? ' active' : ''}`}
        aria-current={!onKo ? 'page' : undefined}
      >
        EN
      </Link>
      <span className="lang-toggle-sep">·</span>
      <Link
        href={targetKo(pathname)}
        className={`lang-toggle-link${onKo ? ' active' : ''}`}
        aria-current={onKo ? 'page' : undefined}
      >
        한국어
      </Link>
    </div>
  );
}
