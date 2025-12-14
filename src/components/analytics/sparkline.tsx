type SparklineProps = {
  values: number[];
  className?: string;
};

export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 120;
  const height = 36;
  const padding = 2;
  const stepX = (width - padding * 2) / (values.length - 1);

  const points = values
    .map((value, index) => {
      const x = padding + index * stepX;
      const y =
        height -
        padding -
        ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Stock trend"
      className={className ?? ""}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

