export type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string };

// Longest common subsequence over lines. A note is a few hundred lines at most,
// so the quadratic table is cheaper than pulling in a diff library.
export const diffLines = (before: string, after: string): DiffLine[] => {
  const a = before.split('\n');
  const b = after.split('\n');

  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'remove', text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: 'remove', text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: 'add', text: b[j] });
    j += 1;
  }
  return out;
};

const CONTEXT = 2;

// A draft that changes three lines in a long note should show three lines, not
// the note. Keep changed lines and a little around them, collapse the rest.
export const collapseUnchanged = (
  lines: DiffLine[],
): (DiffLine | { kind: 'skip'; count: number })[] => {
  const keep = lines.map(
    (l, i) =>
      l.kind !== 'same' ||
      lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((n) => n.kind !== 'same'),
  );

  return lines.reduce<(DiffLine | { kind: 'skip'; count: number })[]>((acc, line, i) => {
    if (keep[i]) return [...acc, line];
    const last = acc.at(-1);
    if (last && last.kind === 'skip') {
      return [...acc.slice(0, -1), { kind: 'skip', count: last.count + 1 }];
    }
    return [...acc, { kind: 'skip', count: 1 }];
  }, []);
};
