import { NextResponse } from 'next/server';
import { latestDesktopRelease, RELEASES_URL } from '../../../lib/release';

// One address the page can point at for the life of the product, so a link
// shared anywhere goes on working after every release. Someone who follows it
// before the first build exists lands on the releases page rather than a 404.
export const GET = async () => {
  const release = await latestDesktopRelease();
  return NextResponse.redirect(release?.url ?? RELEASES_URL, 302);
};
