// A repository-list sparkline: one polyline over the shared 52-week window, no
// axes and no labels. It answers one question — is this still moving — and the
// shape only means anything because every topic is drawn on the same window.
export const Spark = ({
  values,
  width = 132,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) => {
  const max = Math.max(...values, 1);
  const step = width / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 3) - 1.5).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <title>주간 활동</title>
      <polyline
        points={points}
        fill="none"
        stroke="var(--positive)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
