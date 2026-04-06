import { SIGNAL_COLORS } from '../../config/constants';

export function TrafficLight({ signal, label, note }) {
  const color = SIGNAL_COLORS[signal] || '#64748b';

  return (
    <div className="traffic-light">
      <div className="traffic-light__dot" style={{ background: color }} />
      <div>
        <div className="traffic-light__label">{label}</div>
        {note && <div className="traffic-light__note">{note}</div>}
      </div>
    </div>
  );
}
