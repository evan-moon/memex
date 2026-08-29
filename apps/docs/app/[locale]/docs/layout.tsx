import { notFound } from 'next/navigation';
import { LocaleProvider } from '@/app/_components/LocaleContext';
import { isLocale, type Locale } from '@/app/_components/locale';
import DocsMobileControls from './_mobile-controls';
import DocsSidebar from './_sidebar';

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
      <DocsMobileControls />
      <div className="docs-outer">
        <div className="docs-sidebar-desktop">
          <DocsSidebar />
        </div>
        <div className="docs-content">{children}</div>
      </div>
    </LocaleProvider>
  );
}
