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
