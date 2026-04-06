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
  hasSelections,
  onLoad,
  onReset,
  onApprove,
  children,
}) {
  const isDone = status === 'done';
  const isError = status === 'error';
  const isIdle = status === 'idle';
  const isLoading = status === 'running';

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
              Loaded {timeAgo(timestamp)}
            </span>
          )}

          {isDone && onReset && (
            <button className="btn btn--secondary btn--sm" onClick={onReset}>
              Reload
            </button>
          )}

          {isDone && onApprove && (
            <button
              className="btn btn--success btn--sm"
              onClick={onApprove}
              disabled={hasSelections === false}
              title={hasSelections === false ? 'Select items before advancing' : ''}
            >
              Approve & Next
            </button>
          )}

          {(isIdle || isError) && (
            <button
              className="btn btn--primary"
              onClick={onLoad}
              disabled={!isUnlocked || isLoading}
            >
              {isLoading ? 'Loading...' : isError ? 'Retry' : 'Load Data'}
            </button>
          )}
        </div>
      </div>

      {isError && error && (
        <div className="error-display" style={{ marginBottom: 16 }}>
          <div className="error-display__title">Data not found</div>
          <div className="error-display__message">{error}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Ask Claude Code to run this analysis, then click "Load Data" to display results.
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
