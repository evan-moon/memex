import { readFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { type Reply, route, type UiDeps } from '@evan-moon/memex/host';

export const SCHEME = 'memex';

// `standard` is what makes relative URLs resolve, so the page can go on asking
// for `/api/search` the way it did over HTTP. `secure` keeps it a secure
// context. CSP is not bypassed: the page gets the same rules a site would.
export const PRIVILEGES = [
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const typeOf = (path: string) =>
  TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';

const asResponse = ({ status, headers, body }: Reply) => new Response(body, { status, headers });

// The URL arrives from the page, so it decides which file is read. Resolving it
// and then checking that the result is still under the root is what keeps
// `/../../.ssh/id_rsa` from being a request this answers.
const fileUnder = (root: string, pathname: string) => {
  const resolved = normalize(join(root, decodeURIComponent(pathname)));
  if (resolved !== root && !resolved.startsWith(root + sep)) return null;
  try {
    return readFileSync(resolved);
  } catch {
    return null;
  }
};

const payloadOf = async (request: Request) => {
  if (request.method === 'GET') return null;
  return request.json().catch(() => null);
};

// In development the page comes from Vite instead of from disk, so a component
// can be swapped without restarting the app. `/api` still goes through here,
// which is what keeps the two halves on one origin the way they were.
const fromDevServer = (devServer: string, url: URL) =>
  fetch(new URL(`${url.pathname}${url.search}`, devServer)).catch(
    (error: unknown) =>
      // A dev server that is not up yet, or has been restarted, otherwise
      // rejects here and takes the whole window down with ERR_UNEXPECTED. Saying
      // which server did not answer beats a blank window with a code in it.
      new Response(`memex: ${devServer} did not answer.\n\n${String(error)}`, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
  );

export type Shell = {
  devServer?: string;
  // The window's material follows the OS appearance, not the page's theme, so
  // the page has to say which one it is showing or a light theme sits on a dark
  // pane of glass. Injected rather than imported: `serve` stays free of Electron
  // and therefore testable without a window.
  onAppearance?: (theme: 'light' | 'dark') => void;
};

export const serve = (deps: UiDeps, rendererRoot: string, shell: Shell = {}) => {
  const { devServer, onAppearance } = shell;
  const index = () => {
    const html = fileUnder(rendererRoot, '/index.html');
    return html === null
      ? new Response('renderer is missing', { status: 500 })
      : new Response(html, { headers: { 'content-type': TYPES['.html'] as string } });
  };

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // A window concern, not a vault one: `route()` answers for the notes and
    // knows nothing about the glass they are drawn on.
    if (url.pathname === '/api/appearance' && request.method === 'POST') {
      const asked = await payloadOf(request);
      const theme = (asked as { theme?: unknown } | null)?.theme;
      if (theme !== 'light' && theme !== 'dark') {
        return new Response('{"error":"unknown-theme"}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      onAppearance?.(theme);
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname.startsWith('/api/')) {
      return asResponse(await route(deps, request.method, url, await payloadOf(request)));
    }

    if (devServer !== undefined) return fromDevServer(devServer, url);

    const file = fileUnder(rendererRoot, url.pathname);
    // Anything that is not a file is a route the page knows about: /note/1694
    // has to survive a reload the same way it did when a server answered.
    return file === null
      ? index()
      : new Response(file, { headers: { 'content-type': typeOf(url.pathname) } });
  };
};
