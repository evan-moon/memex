import { api } from './api.ts';

// The window is served by Vite and the API by a bundle built at launch, so the
// page can be newer than the process answering it. When that happens a screen
// asks for a route the server has never heard of and gets a 404, which reads as
// "there is nothing here" rather than "restart the app".
//
// Asking once, when a screen fails, is enough to tell the two apart.
export const isStaleServer = async (needs: string): Promise<boolean> => {
  const known = await api.routes().catch(() => null);
  // A build old enough not to have this route either is certainly old enough not
  // to have the one that just failed.
  if (known === null) return true;
  return !known.routes.includes(needs);
};
