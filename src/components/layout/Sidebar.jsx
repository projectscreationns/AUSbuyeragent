import { usePipeline } from '../../context/PipelineContext';
import { STAGE_DEFS } from '../../config/constants';

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function Sidebar() {
  const { state, dispatch } = usePipeline();
  const stageKeys = STAGE_DEFS.map(s => s.key);

  const handleClick = (key, idx) => {
    // Can navigate to any completed stage or the current unlocked one
    const prevKey = idx > 0 ? stageKeys[idx - 1] : null;
    const isUnlocked = !prevKey || state.stages[prevKey].status === 'done';
    const isDone = state.stages[key].status === 'done';

    if (isDone || isUnlocked) {
      dispatch({ type: 'SET_CURRENT_STAGE', stage: key });
    }
  };

  return (
    <nav className="sidebar">
      <div className="sidebar__title">Pipeline</div>
      <ul className="stage-nav">
        {STAGE_DEFS.map((def, idx) => {
          const stage = state.stages[def.key];
          const isActive = state.currentStage === def.key;
          const isDone = stage.status === 'done';
          const isRunning = stage.status === 'running';
          const prevKey = idx > 0 ? stageKeys[idx - 1] : null;
          const isUnlocked = !prevKey || state.stages[prevKey].status === 'done';
          const isLocked = !isUnlocked && !isDone;

          return (
            <li
              key={def.key}
              className={`stage-nav__item ${isActive ? 'stage-nav__item--active' : ''} ${isDone ? 'stage-nav__item--done' : ''} ${isLocked ? 'stage-nav__item--locked' : ''}`}
              onClick={() => handleClick(def.key, idx)}
            >
              <div className={`stage-nav__number ${isActive ? 'stage-nav__number--active' : ''} ${isDone ? 'stage-nav__number--done' : ''}`}>
                {isDone ? '✓' : def.icon}
              </div>
              <div>
                <div className="stage-nav__label">{def.label}</div>
                <div className="stage-nav__desc">{def.description}</div>
                {isRunning && (
                  <div className="stage-nav__status text-amber">Running...</div>
                )}
                {isDone && stage.timestamp && (
                  <div className="stage-nav__status text-green">
                    Done · {timeAgo(stage.timestamp)}
                  </div>
                )}
                {stage.status === 'error' && (
                  <div className="stage-nav__status text-red">Error</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
