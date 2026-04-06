import { scoreColor } from '../../lib/scoring';

export function ScoreBar({ score, label }) {
  const color = scoreColor(score);

  return (
    <div>
      {label && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>}
      <div className="score-bar">
        <div
          className="score-bar__fill"
          style={{ width: score != null ? `${score}%` : '0%', background: color }}
        />
      </div>
    </div>
  );
}
