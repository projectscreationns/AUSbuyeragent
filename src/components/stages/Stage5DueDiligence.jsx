import { useStageLoader } from '../../hooks/useStageLoader';
import { StageShell } from '../layout/StageShell';
import { ErrorBoundary } from '../common/ErrorBoundary';

function DDReport({ report }) {
  if (!report) return null;

  return (
    <div>
      <div className="card mb-12" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="text-heading fw-700" style={{ fontSize: 16, marginBottom: 4 }}>{report.address}</div>
          <div className="text-sm text-muted">{report.summary}</div>
        </div>
        <span className="verdict" style={{
          background: report.overallRisk === 'LOW' ? 'var(--green-dim)' : report.overallRisk === 'HIGH' ? 'var(--red-dim)' : 'var(--amber-dim)',
          color: report.overallRisk === 'LOW' ? 'var(--green)' : report.overallRisk === 'HIGH' ? 'var(--red)' : 'var(--amber)',
          fontSize: 12, padding: '4px 10px',
        }}>
          {report.overallRisk} RISK
        </span>
      </div>

      {report.killDeal ? (
        <div className="info-box info-box--red mb-12" style={{ textAlign: 'center' }}>
          <div className="fw-700" style={{ fontSize: 18 }}>KILL DEAL</div>
          <div>{report.killDealReason}</div>
        </div>
      ) : (
        <div className="info-box info-box--green mb-12" style={{ textAlign: 'center' }}>
          <div className="fw-700" style={{ fontSize: 14 }}>No Kill Deal</div>
        </div>
      )}

      {report.redFlags?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Red Flags ({report.redFlags.length})</div>
          {report.redFlags.map((f, i) => (
            <div key={i} className="dd-flag dd-flag--red">
              <div className="dd-flag__issue">{f.issue}</div>
              <div className="dd-flag__impact">Impact: {f.impact}</div>
              <div className="dd-flag__action">→ {f.action}</div>
            </div>
          ))}
        </div>
      )}

      {report.yellowFlags?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Yellow Flags ({report.yellowFlags.length})</div>
          {report.yellowFlags.map((f, i) => (
            <div key={i} className="dd-flag dd-flag--yellow">
              <div className="dd-flag__issue">{f.issue}</div>
              <div className="dd-flag__impact">Impact: {f.impact}</div>
              <div className="dd-flag__action">→ {f.action}</div>
            </div>
          ))}
        </div>
      )}

      {report.negotiationLeverage?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Negotiation Leverage</div>
          {report.negotiationLeverage.map((l, i) => (
            <div key={i} className="card mb-8" style={{ borderLeft: '3px solid var(--blue)' }}>
              <div className="fw-600 text-heading text-sm">{l.item}</div>
              <div className="mono text-green text-sm">{l.estimatedValue}</div>
              <div className="text-xs text-muted">{l.howToUse}</div>
            </div>
          ))}
        </div>
      )}

      {report.holdCostEstimate && (
        <div className="card mb-12">
          <div className="section-label">Hold Cost Estimate</div>
          {Object.entries(report.holdCostEstimate).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm" style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-muted">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="mono text-heading">{v}</span>
            </div>
          ))}
        </div>
      )}

      {report.beforeExchangeChecklist?.length > 0 && (
        <div className="card mb-12">
          <div className="section-label">Before Exchange Checklist</div>
          {report.beforeExchangeChecklist.map((item, i) => (
            <div key={i} className="flex gap-8 text-sm" style={{ padding: '3px 0' }}>
              <span className="text-muted">☐</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {report.seekSolicitorAdvice?.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(59,130,246,.3)' }}>
          <div className="section-label" style={{ color: 'var(--blue)' }}>Seek Solicitor Advice</div>
          {report.seekSolicitorAdvice.map((item, i) => (
            <div key={i} className="text-sm" style={{ color: '#93c5fd', padding: '3px 0' }}>→ {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stage5DueDiligence() {
  const stage = useStageLoader('dd');

  return (
    <StageShell
      title="Due Diligence"
      description="Risk analysis from property documents"
      status={stage.status}
      error={stage.error}
      timestamp={stage.timestamp}
      isUnlocked={stage.isUnlocked}
      onLoad={stage.load}
      onReset={stage.load}
    >
      <ErrorBoundary label="Due Diligence">
        {stage.data && <DDReport report={stage.data} />}

        {stage.status === 'idle' && !stage.data && (
          <div className="loading-agent">
            <div className="loading-agent__icon">📄</div>
            <div className="loading-agent__title">No due diligence data yet</div>
            <div className="loading-agent__phase">
              Share property documents with Claude Code and ask:<br />
              "run due diligence on [address]"<br />
              Then click "Load Data" to display the report.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
