import { useSyncExternalStore } from 'react';

// The vault changed under the screen: a note written, a file renamed or moved, a
// folder made or gone. What is drawn from the vault asks again when this moves.
//
// Reloading the window says the same thing and says far more besides — it throws
// away which folders were open, where the tree was scrolled, and the note being
// read — for a change that touched one row of it.
const listeners = new Set<() => void>();
const state = { at: 0 };

export const vaultChanged = () => {
  state.at += 1;
  for (const listen of listeners) listen();
};

export const useVaultRevision = () =>
  useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => {
        listeners.delete(listen);
      };
    },
    () => state.at,
  );
