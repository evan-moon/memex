import { useT } from './i18n.ts';

// A repository-list sparkline: one polyline over the shared 52-week window, no
// axes and no labels. It answers one question — is this still moving — and the
// shape only means anything because every topic is drawn on the same window.
export const Spark = ({
  values,
  width = 132,
  height = 28,
  fill = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Stretch to the container instead of drawing at a fixed width. */
  fill?: boolean;
}) => {
  const t = useT();
  const max = Math.max(...values, 1);
  const step = width / Math.max(1, values.length - 1);
  const points = values
    .map(
      (v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 3) - 1.5).toFixed(1)}`,
    )
    .join(' ');

  return (
    <svg
      width={fill ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fill ? 'none' : undefined}
      aria-hidden="true"
    >
      <title>{t.spark.title}</title>
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
