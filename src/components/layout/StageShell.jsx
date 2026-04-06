function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function StageShell({
  title,
  description,
  status,
  error,
  timestamp,
  isUnlocked,
  isRunning,
  hasSelections,
  onRun,
  onReset,
  onApprove,
  onAbort,
  children,
}) {
  const isDone = status === 'done';
  const isError = status === 'error';
  const isIdle = status === 'idle';

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">{title}</h2>
          {description && <p className="stage-shell__desc">{description}</p>}
        </div>
        <div className="stage-shell__actions">
          {isDone && timestamp && (
            <span className="stage-shell__cached">
              Results from {timeAgo(timestamp)}
            </span>
          )}

          {isRunning && (
            <button className="btn btn--danger btn--sm" onClick={onAbort}>
              Cancel
            </button>
          )}

          {!isRunning && isDone && onReset && (
            <button className="btn btn--secondary btn--sm" onClick={onReset}>
              Re-run
            </button>
          )}

          {!isRunning && isDone && onApprove && (
            <button
              className="btn btn--success btn--sm"
              onClick={onApprove}
              disabled={hasSelections === false}
              title={hasSelections === false ? 'Select items before advancing' : ''}
            >
              Approve & Next
            </button>
          )}

          {!isRunning && (isIdle || isError) && (
            <button
              className="btn btn--primary"
              onClick={onRun}
              disabled={!isUnlocked}
            >
              {isError ? 'Retry' : 'Run Analysis'}
            </button>
          )}
        </div>
      </div>

      {isError && error && (
        <div className="error-display" style={{ marginBottom: 16 }}>
          <div className="error-display__title">Analysis failed</div>
          <div className="error-display__message">{error}</div>
        </div>
      )}

      {children}
    </div>
  );
}
