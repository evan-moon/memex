import { notFound } from 'next/navigation';
import Link from 'next/link';
import LangToggle from '@/app/_components/LangToggle';
import { LocaleProvider } from '@/app/_components/LocaleContext';
import { isLocale, type Locale } from '@/app/_components/locale';
import DocsSidebar from './_sidebar';
import DocsMobileControls from './_mobile-controls';

export default async function LocaleDocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <LocaleProvider locale={locale as Locale}>
      <header className="docs-topbar">
        <Link href="/" className="docs-topbar-logo">memex</Link>
        <div className="docs-topbar-right">
          <a href="https://github.com/evan-moon/memex" target="_blank" rel="noopener noreferrer" className="nav-link">
            GitHub <span className="nav-arrow">↗</span>
          </a>
          <LangToggle />
        </div>
      </header>
      <DocsMobileControls />
      <div className="docs-outer">
        <aside className="docs-sidebar-desktop">
          <DocsSidebar />
        </aside>
        <div className="docs-content">{children}</div>
      </div>
    </LocaleProvider>
  );
}
