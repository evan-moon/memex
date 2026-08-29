import { GoogleAnalytics } from '@next/third-parties/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import HeaderNav from './_components/HeaderNav';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'memex',
  description:
    'Local-first second brain with semantic search. MCP server for Claude Desktop and Claude Code.',
  openGraph: {
    title: "memex: The memory layer Claude doesn't have.",
    description:
      'Local-first second brain with semantic search. Gives Claude persistent memory across conversations. All data stays on your machine.',
    siteName: 'memex',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'memex' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "memex: The memory layer Claude doesn't have.",
    description: 'Local-first second brain · Claude MCP · Semantic search · Private by design.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ colorScheme: 'dark' }}
    >
      <body>
        <HeaderNav />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
      <GoogleAnalytics gaId="G-8XT333E1J3" />
    </html>
  );
}
