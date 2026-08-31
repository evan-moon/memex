'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { startAnalytics, track } from '../../lib/analytics';

export default function AnalyticsInit() {
  const pathname = usePathname();

  useEffect(() => {
    startAnalytics();
  }, []);

  useEffect(() => {
    track({ name: 'page_view', path: pathname });
  }, [pathname]);

  return null;
}
