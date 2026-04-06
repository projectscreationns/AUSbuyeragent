export function LoadingAgent({ title, phase, steps }) {
  return (
    <div className="loading-agent">
      <div className="loading-agent__icon">
        {phase?.includes('Analys') ? '🧠' : '🔍'}
      </div>
      <div className="loading-agent__title">{title || 'Agent working...'}</div>
      {phase && <div className="loading-agent__phase">{phase}</div>}
      {steps && (
        <div className="loading-agent__steps">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`loading-agent__step ${
                step.status === 'active' ? 'loading-agent__step--active' :
                step.status === 'done' ? 'loading-agent__step--done' : ''
              }`}
            >
              {step.status === 'done' ? '✓ ' : step.status === 'active' ? '● ' : ''}
              {step.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
