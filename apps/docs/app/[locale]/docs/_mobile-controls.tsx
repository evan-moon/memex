'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import DocsSidebar from './_sidebar';

export default function DocsMobileControls() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger, not an input — dropping it would leave the menu open across navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="docs-mobile-tools">
        <button
          type="button"
          className="docs-mobile-btn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          Menu
        </button>
      </div>

      <button
        type="button"
        className={`docs-mobile-backdrop${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`docs-mobile-drawer docs-mobile-menu${menuOpen ? ' open' : ''}`}>
        <DocsSidebar onNavigate={() => setMenuOpen(false)} />
      </aside>
    </>
  );
}
