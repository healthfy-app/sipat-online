export default function AchievementMark({ animate = false }: { animate?: boolean }) {
  return <svg className={`achievement-mark${animate ? ' is-celebrating' : ''}`} viewBox="0 0 48 48" aria-hidden="true" fill="none">
    <circle className="achievement-ring" cx="24" cy="24" r="21" pathLength="1" />
    <path className="achievement-check" d="m14 24 7 7 14-15" pathLength="1" />
  </svg>;
}
