export default function ProgressBar({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clampedValue}
      aria-valuetext={`${clampedValue}%`}
      className="learning-progress-track"
      role="progressbar"
    >
      <span style={{ transform: `scaleX(${clampedValue / 100})` }} />
    </div>
  );
}
