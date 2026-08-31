// A pipe hands over chunks that do not respect line boundaries, so a reader
// that split each chunk on its own would drop every event that straddled two.
export const createLineReader = (onLine: (line: string) => void) => {
  const held = { rest: '' };

  return (chunk: string) => {
    const parts = (held.rest + chunk).split('\n');
    held.rest = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim() !== '') onLine(line);
    }
  };
};
