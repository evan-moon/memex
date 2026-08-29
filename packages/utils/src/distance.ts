// Titles are short, so the row-at-a-time matrix is cheap; the length check in
// front of it is what keeps a link from being compared against every note.
export const withinEditDistance = (a: string, b: string, max: number): boolean => {
  const from = [...a];
  const to = [...b];
  if (Math.abs(from.length - to.length) > max) return false;

  const distance = from.reduce(
    (previous, ac) =>
      to.reduce(
        (row, bc, j) => [
          ...row,
          Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (ac === bc ? 0 : 1)),
        ],
        [previous[0] + 1],
      ),
    [...to.keys(), to.length],
  );

  return distance[to.length] <= max;
};

const TRIGRAM = 3;

const trigramsOf = (value: string) => {
  const chars = [...value];
  return [
    ...new Set(
      Array.from({ length: Math.max(0, chars.length - TRIGRAM + 1) }, (_, i) =>
        chars.slice(i, i + TRIGRAM).join(''),
      ),
    ),
  ];
};

const overlap = (grams: string[], candidate: string) =>
  grams.reduce((count, gram) => (candidate.includes(gram) ? count + 1 : count), 0);

// One edit disturbs at most three trigrams, so two strings within `max` edits
// still share all but 3·max of the trigrams either is made of. Counting that
// overlap is linear where the matrix is quadratic, so it is what decides
// whether running the matrix is worth it at all — a bound, never a verdict:
// what survives it is still measured exactly.
export const findNearest = (
  target: string,
  candidates: string[],
  max: number,
): string | undefined => {
  const needle = target.toLowerCase();
  const grams = trigramsOf(needle);
  const floor = grams.length - TRIGRAM * max;

  return candidates.find((candidate) => {
    const compared = candidate.toLowerCase();
    if (compared === needle) return false;
    if (floor > 0 && overlap(grams, compared) < floor) return false;
    return withinEditDistance(compared, needle, max);
  });
};
