/**
 * Accessible SVG ring showing a 0..1 coverage value. Server-renderable (no
 * client JS needed). Uses the "have" semantic color.
 */
export function CircularProgress({
  value,
  label,
  size = 120,
  stroke = 10,
}: {
  value: number; // 0..1
  label: string;
  size?: number;
  stroke?: number;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const pct = Math.round(clamped * 100);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${pct}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--have)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-2xl font-bold tabular-nums">{pct}%</span>
    </div>
  );
}
