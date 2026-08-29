import { join } from 'node:path';
import { createUiDeps } from '@evan-moon/memex/host';
import { app, BrowserWindow, protocol, shell } from 'electron';
import { PRIVILEGES, SCHEME, serve } from './serve.ts';

const WINDOW = { width: 1200, height: 820, minWidth: 720, minHeight: 520 };

const HOME = `${SCHEME}://app/`;

const DEV_SERVER = process.env.MEMEX_DEV_SERVER;

// Registering the scheme has to happen before the app is ready, so it sits at
// module scope rather than inside start().
protocol.registerSchemesAsPrivileged(PRIVILEGES);

let deps: ReturnType<typeof createUiDeps> | null = null;

// The renderer gets no Node and no preload. Everything it can reach, it reaches
// by asking `memex://` for it, which is the same handler that gave it its own
// files — so the page has exactly one way in and nothing else.
const createWindow = (url: string) => {
  const window = new BrowserWindow({
    ...WINDOW,
    title: 'memex',
    titleBarStyle: 'hiddenInset',
    // The whole window is vibrant and the page paints over the part that should
    // not be. An opaque backgroundColor would sit in front of the material and
    // there would be nothing to see through.
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Whatever the page logs shows up beside the app's own output, which is the
  // only place to see it once there is no browser to open devtools in.
  if (DEV_SERVER !== undefined) {
    window.webContents.on('console-message', (_event, _level, message) => console.log(message));
  }
  window.once('ready-to-show', () => {
    window.show();
    // Started from a terminal, the window otherwise opens behind whatever was
    // in front. Only in development: a packaged app is launched by the reader,
    // and an app that pushes itself forward on its own is a rude one.
    if (DEV_SERVER !== undefined) app.focus({ steal: true });
  });
  window.loadURL(url);

  // A link to somewhere else is somewhere else: it opens in the browser rather
  // than replacing the only window the app has.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== new URL(url).origin) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  return window;
};

const start = () => {
  deps = createUiDeps();
  protocol.handle(SCHEME, serve(deps, join(app.getAppPath(), 'dist/renderer'), DEV_SERVER));
  createWindow(HOME);
};

app.whenReady().then(() => {
  try {
    start();
  } catch (error) {
    console.error('[memex] could not start:', error);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && deps !== null) createWindow(HOME);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  deps?.client.sqlite.close();
  deps = null;
});
