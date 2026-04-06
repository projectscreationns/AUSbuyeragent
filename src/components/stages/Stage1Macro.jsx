import { useStageRunner } from '../../hooks/useStageRunner';
import { buildStage1Prompt } from '../../prompts/stage1-macro';
import { StageShell } from '../layout/StageShell';
import { LoadingAgent } from '../common/LoadingAgent';
import { TrafficLight } from '../common/TrafficLight';
import { ErrorBoundary } from '../common/ErrorBoundary';

function MacroResults({ data }) {
  if (!data) return null;

  const metricCards = [
    { label: 'RBA Rate', value: data.rba?.cashRate, signal: data.rba?.signal, sub: data.rba?.lastDecision?.change ? `${data.rba.lastDecision.change} on ${data.rba.lastDecision.date}` : '' },
    { label: 'Unemployment', value: data.employment?.unemployment?.value, signal: data.employment?.signal, sub: `Trend: ${data.employment?.unemployment?.trend || '?'}` },
    { label: 'Inflation', value: data.inflation?.headline?.value, signal: data.inflation?.signal, sub: `Trimmed: ${data.inflation?.trimmedMean?.value || '?'}` },
    { label: 'Wages', value: data.wages?.wpiAnnual?.value, signal: data.wages?.signal, sub: data.wages?.wpiAnnual?.quarter || '' },
    { label: 'Migration (NOM)', value: data.migration?.nom?.value, signal: data.migration?.signal, sub: `Pop growth: ${data.migration?.annualPopGrowth?.value || '?'}` },
    { label: 'Vacancy', value: data.vacancy?.national?.value, signal: data.vacancy?.signal, sub: 'National (SQM)' },
    { label: 'Approvals', value: data.approvals?.monthly?.value, signal: data.approvals?.signal, sub: data.approvals?.vsTarget || '' },
    { label: 'Lending Rate', value: data.lending?.investorVariable?.value, signal: data.lending?.signal, sub: `Assessment: ${data.lending?.assessmentRate?.value || '?'}` },
  ];

  const trafficLights = [
    data.rba && { signal: data.rba.signal, label: 'Monetary Policy', note: data.rba?.note || `Rate: ${data.rba.cashRate}` },
    data.lending && { signal: data.lending.signal, label: 'Credit (Investor)', note: data.lending?.note || '' },
    data.migration && { signal: data.migration.signal, label: 'Migration', note: data.migration?.note || '' },
    data.approvals && { signal: data.approvals.signal, label: 'Supply', note: data.approvals?.note || '' },
    data.vacancy && { signal: data.vacancy.signal, label: 'Rental', note: data.vacancy?.note || '' },
    data.employment && { signal: data.employment.signal, label: 'Employment', note: data.employment?.note || '' },
  ].filter(Boolean);

  return (
    <div>
      {data.summary && (
        <div className="info-box info-box--amber mb-16">
          <strong>Summary: </strong>{data.summary}
        </div>
      )}

      <div className="section-label">Key Statistics — {data.asOf || 'Latest'}</div>
      <div className="metric-grid mb-16">
        {metricCards.map((m, i) => (
          <div key={i} className="metric">
            <div className="metric__label">{m.label}</div>
            <div className="metric__value">{m.value || '—'}</div>
            <div className="metric__sub">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Traffic Lights</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginBottom: 16 }}>
        {trafficLights.map((tl, i) => (
          <TrafficLight key={i} signal={tl.signal} label={tl.label} note={tl.note} />
        ))}
      </div>

      {data.medians?.cities?.length > 0 && (
        <>
          <div className="section-label">Capital City House Medians</div>
          <table className="data-table mb-16">
            <thead>
              <tr><th>City</th><th>Median</th></tr>
            </thead>
            <tbody>
              {data.medians.cities.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{c.city}</td>
                  <td className="mono">${(c.median || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data.clearanceRates?.cities?.length > 0 && (
        <>
          <div className="section-label">Auction Clearance Rates</div>
          <table className="data-table mb-16">
            <thead>
              <tr><th>City</th><th>Rate</th><th>Trend</th></tr>
            </thead>
            <tbody>
              {data.clearanceRates.cities.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{c.city}</td>
                  <td className="mono">{c.rate}</td>
                  <td className="text-muted">{c.trend || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data.risks?.length > 0 && (
        <>
          <div className="section-label">Key Macro Risks</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {data.risks.map((r, i) => (
              <div key={i} className="card" style={{ borderLeft: `3px solid ${r.probability === 'HIGH' ? 'var(--red)' : r.probability === 'MEDIUM' ? 'var(--amber)' : 'var(--green)'}` }}>
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>{r.risk}</span>
                  <span className="mono text-xs" style={{ color: r.probability === 'HIGH' ? 'var(--red)' : 'var(--amber)' }}>{r.probability}</span>
                </div>
                {r.impact && <div className="text-sm text-muted mt-4">{r.impact}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {data.warnings?.length > 0 && (
        <div className="info-box info-box--red">
          {data.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11 }}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stage1Macro() {
  const stage = useStageRunner('macro', buildStage1Prompt);

  return (
    <StageShell
      title="Macro Environment"
      description="National property market conditions — RBA, ABS, SQM, CoreLogic"
      status={stage.status}
      error={stage.error}
      timestamp={stage.timestamp}
      isUnlocked={stage.isUnlocked}
      isRunning={stage.isRunning}
      onRun={stage.run}
      onReset={stage.reset}
      onApprove={stage.approve}
      onAbort={stage.abort}
    >
      <ErrorBoundary label="Macro Results">
        {stage.isRunning && (
          <LoadingAgent
            title="Scanning macro environment..."
            phase={`Agent searching — turn ${stage.turn + 1}`}
            steps={[
              { label: 'RBA + ABS', status: stage.turn >= 1 ? 'done' : 'active' },
              { label: 'SQM + CoreLogic', status: stage.turn >= 2 ? 'done' : stage.turn >= 1 ? 'active' : 'pending' },
              { label: 'Synthesize', status: stage.turn >= 3 ? 'active' : 'pending' },
            ]}
          />
        )}
        {stage.data && <MacroResults data={stage.data} />}
        {stage.status === 'idle' && !stage.data && (
          <div className="loading-agent">
            <div className="loading-agent__icon">📊</div>
            <div className="loading-agent__title">Ready to scan</div>
            <div className="loading-agent__phase">
              Click "Run Analysis" to search for current macro data.<br />
              Agent will search RBA, ABS, SQM, CoreLogic, and more.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
