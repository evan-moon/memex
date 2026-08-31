const REPO = 'evan-moon/memex';

// The CLI and the app publish into the same list of releases, so `latest` is
// whichever of the two shipped most recently. The desktop tag is the only
// thing that separates them.
const DESKTOP_TAG = 'desktop-v';

const CACHE_SECONDS = 600;

export type DesktopRelease = {
  version: string;
  url: string;
};

type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
};

export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export const latestDesktopRelease = async (): Promise<DesktopRelease | null> => {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!response.ok) return null;

  const releases = (await response.json()) as GitHubRelease[];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    if (!release.tag_name.startsWith(DESKTOP_TAG)) continue;

    const dmg = release.assets.find((asset) => asset.name.endsWith('.dmg'));
    if (!dmg) continue;

    return { version: release.tag_name.slice(DESKTOP_TAG.length), url: dmg.browser_download_url };
  }

  return null;
};
