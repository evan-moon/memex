// What the window asks on the way out. The main process holds the close until
// this answers, so the answer has to be true only when the last thing typed is
// somewhere other than this tab.
export type Closer = {
  flush: () => Promise<unknown>;
  safeToClose: () => boolean;
};

const open = new Set<Closer>();

export const whileEditing = (closer: Closer) => {
  open.add(closer);
  return () => {
    open.delete(closer);
  };
};

export const readyToClose = async (): Promise<boolean> => {
  await Promise.all([...open].map((closer) => closer.flush().catch(() => undefined)));
  return [...open].every((closer) => closer.safeToClose());
};

declare global {
  interface Window {
    memexReadyToClose?: () => Promise<boolean>;
  }
}

export const answerTheWindow = () => {
  window.memexReadyToClose = readyToClose;
};
