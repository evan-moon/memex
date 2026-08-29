import { join } from 'node:path';
import { createUiDeps } from '@evan-moon/memex/host';
import { app, BrowserWindow, protocol, shell } from 'electron';
import { PRIVILEGES, SCHEME, serve } from './serve.ts';

const WINDOW = { width: 1200, height: 820, minWidth: 720, minHeight: 520 };

const HOME = `${SCHEME}://app/`;

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
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
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
  protocol.handle(SCHEME, serve(deps, join(app.getAppPath(), 'dist/renderer')));
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
