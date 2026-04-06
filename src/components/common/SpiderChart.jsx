import { scoreColor } from '../../lib/scoring';

const CX = 90;
const CY = 90;
const R = 65;

function polarPoint(index, total, value, radius) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: CX + (value / 100) * radius * Math.cos(angle),
    y: CY + (value / 100) * radius * Math.sin(angle),
  };
}

export function SpiderChart({ metrics, avgScore }) {
  // metrics: { label: string, score: number | null }[]
  const valid = metrics.filter(m => m.score != null);
  const N = valid.length;

  if (N < 3) return null;

  const color = scoreColor(avgScore);
  const pts = valid.map((m, i) => polarPoint(i, N, m.score, R));

  return (
    <svg width={180} height={180} style={{ display: 'block' }}>
      {/* Grid rings */}
      {[25, 50, 75, 100].map(p => (
        <polygon
          key={p}
          points={valid.map((_, i) => {
            const pt = polarPoint(i, N, p, R);
            return `${pt.x},${pt.y}`;
          }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
        />
      ))}

      {/* Axes */}
      {valid.map((_, i) => {
        const outer = polarPoint(i, N, 100, R);
        return (
          <line
            key={i}
            x1={CX} y1={CY}
            x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.08)"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={pts.map(p => `${p.x},${p.y}`).join(' ')}
        fill={color + '30'}
        stroke={color}
        strokeWidth={1.5}
      />

      {/* Data points */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}

      {/* Labels */}
      {valid.map((m, i) => {
        const lp = polarPoint(i, N, 130, R);
        return (
          <text
            key={i}
            x={lp.x} y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={7}
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {m.label.toUpperCase()}
          </text>
        );
      })}

      {/* Center score */}
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize={16} fontWeight="700" fill={color} fontFamily="var(--font-mono)">
        {avgScore ?? '—'}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" fontSize={7} fill="var(--text-muted)">
        composite
      </text>
    </svg>
  );
}
