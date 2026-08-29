const KEY = 'memex-rail';

// Which of the two edges is showing. A view preference rather than a place, so
// it is remembered on the machine and not written into the URL — reopening the
// app should look the way you left it, and a link should not carry your layout.
export const railShown = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== 'hidden';
  } catch {
    return true;
  }
};

export const rememberRail = (shown: boolean) => {
  try {
    localStorage.setItem(KEY, shown ? 'shown' : 'hidden');
  } catch {
    // Storage turned off means it opens showing every time, which is a worse
    // memory rather than a broken app.
  }
};
