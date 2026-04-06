import { VERDICT_COLORS } from '../../config/constants';

export function VerdictBadge({ verdict }) {
  const color = VERDICT_COLORS[verdict] || '#64748b';

  return (
    <span
      className="verdict"
      style={{
        background: color + '1a',
        color: color,
        border: `1px solid ${color}44`,
      }}
    >
      {verdict}
    </span>
  );
}
