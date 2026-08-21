'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import LangToggle from './LangToggle';

export default function HeaderNav() {
  const pathname = usePathname() || '/';
  const onKo = pathname === '/ko' || pathname.startsWith('/ko/');
  const homeHref = onKo ? '/ko' : '/';
  const docsHref = onKo ? '/ko/docs/getting-started' : '/en/docs/getting-started';
  const [mobileOpen, setMobileOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input — dropping it would leave the menu open across navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('main-drawer-open', mobileOpen);
    return () => {
      document.body.classList.remove('main-drawer-open');
    };
  }, [mobileOpen]);

  return (
    <header className="nav">
      <button
        type="button"
        className={`nav-mobile-toggle${mobileOpen ? ' open' : ''}`}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </button>
      <Link href={homeHref} className="nav-logo">
        memex
      </Link>
      <button
        type="button"
        className={`nav-mobile-backdrop${mobileOpen ? ' open' : ''}`}
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />
      <nav className="nav-links">
        <Link href={docsHref} className="nav-link">
          Docs
        </Link>
        <a
          href="https://github.com/evan-moon/memex"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
        >
          GitHub <span className="nav-arrow">↗</span>
        </a>
        <a
          href="https://www.npmjs.com/package/@evan-moon/memex"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
        >
          npm <span className="nav-arrow">↗</span>
        </a>
        <LangToggle />
      </nav>
      <nav className={`nav-mobile-menu${mobileOpen ? ' open' : ''}`}>
        <div className="nav-mobile-menu-links">
          <Link href={homeHref} className="nav-mobile-menu-link">
            Home
          </Link>
          <Link href={docsHref} className="nav-mobile-menu-link">
            Docs
          </Link>
          <a
            href="https://github.com/evan-moon/memex"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-mobile-menu-link"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@evan-moon/memex"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-mobile-menu-link"
          >
            npm
          </a>
        </div>
        <div className="nav-mobile-menu-lang">
          <LangToggle />
        </div>
      </nav>
    </header>
  );
}
