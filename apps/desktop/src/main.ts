import { app, BrowserWindow, shell } from 'electron';
import { startMemexHost } from '@evan-moon/memex/host';

const WINDOW = { width: 1200, height: 820, minWidth: 720, minHeight: 520 };

let host: Awaited<ReturnType<typeof startMemexHost>> | null = null;

// The renderer gets no Node. It is the same page the browser loads, and the
// only reason it is in a window instead of a tab is that a person who does not
// open a terminal cannot reach a tab either.
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

const start = async () => {
  // Port 0: the OS picks a free one. A packaged app cannot ask its reader to
  // pass --port when 4321 is already taken.
  host = await startMemexHost(0);
  createWindow(host.url);
};

app.whenReady().then(() =>
  start().catch((error: unknown) => {
    console.error('[memex] could not start:', error);
    app.quit();
  }),
);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && host !== null) createWindow(host.url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  host?.client.sqlite.close();
  host = null;
});
