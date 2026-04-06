import { useStageRunner } from '../../hooks/useStageRunner';
import { buildStage2Prompt } from '../../prompts/stage2-region-scan';
import { StageShell } from '../layout/StageShell';
import { LoadingAgent } from '../common/LoadingAgent';
import { VerdictBadge } from '../common/VerdictBadge';
import { ErrorBoundary } from '../common/ErrorBoundary';

function RegionResults({ data, selections, onSelect }) {
  if (!data?.regions) return null;

  const sorted = [...data.regions].sort((a, b) => (b.score || 0) - (a.score || 0));

  const toggle = (region) => {
    const name = region.region;
    if (selections.includes(name)) {
      onSelect(selections.filter(s => s !== name));
    } else {
      onSelect([...selections, name]);
    }
  };

  return (
    <div>
      {data.summary && (
        <div className="info-box info-box--amber mb-16">
          <strong>Summary: </strong>{data.summary}
        </div>
      )}

      {data.topPicks?.length > 0 && (
        <div className="info-box info-box--green mb-16">
          <strong>Top Picks: </strong>{data.topPicks.join(' · ')}
        </div>
      )}

      <div className="section-label">
        Select regions for suburb deep dive ({selections.length} selected)
      </div>

      <table className="data-table mb-16">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>#</th>
            <th>Region</th>
            <th>Score</th>
            <th>Budget</th>
            <th>Verdict</th>
            <th>Risk</th>
            <th>Key Detail</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const pf = r.priceFilter || '';
            const pfPass = pf.toLowerCase().startsWith('pass');
            const pfFail = pf.toLowerCase().startsWith('fail');
            const isSelected = selections.includes(r.region);

            return (
              <tr key={i} style={{ opacity: pfFail ? 0.4 : 1 }}>
                <td>
                  <input
                    type="checkbox"
                    className="data-table__checkbox"
                    checked={isSelected}
                    onChange={() => toggle(r)}
                    disabled={pfFail}
                  />
                </td>
                <td className="mono text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600, color: 'var(--text-heading)', maxWidth: 200 }}>{r.region}</td>
                <td className="mono fw-600">{r.score}</td>
                <td>
                  <span className="mono text-xs" style={{ color: pfPass ? 'var(--green)' : pfFail ? 'var(--red)' : 'var(--amber)' }}>
                    {pf.split('—')[0]?.trim() || '—'}
                  </span>
                </td>
                <td><VerdictBadge verdict={r.verdict} /></td>
                <td>
                  <span className="mono text-xs" style={{
                    color: r.riskRating === 'LOW' ? 'var(--green)' : r.riskRating === 'HIGH' ? 'var(--red)' : 'var(--amber)'
                  }}>
                    {r.riskRating}
                  </span>
                </td>
                <td className="text-muted" style={{ fontSize: 11, maxWidth: 300 }}>
                  {r.note?.substring(0, 120)}{r.note?.length > 120 ? '...' : ''}
                  {r.keyRisk && <div className="text-xs" style={{ color: 'var(--amber)', marginTop: 2 }}>Risk: {r.keyRisk}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {data.avoids?.length > 0 && (
        <div className="info-box info-box--red">
          <strong>Avoid: </strong>{data.avoids.join(' · ')}
        </div>
      )}
    </div>
  );
}

export function Stage2RegionScan() {
  const stage = useStageRunner('regions', buildStage2Prompt);

  return (
    <StageShell
      title="Region Scan"
      description="Score and rank 30+ Australian regions within budget"
      status={stage.status}
      error={stage.error}
      timestamp={stage.timestamp}
      isUnlocked={stage.isUnlocked}
      isRunning={stage.isRunning}
      hasSelections={stage.selections.length > 0}
      onRun={stage.run}
      onReset={stage.reset}
      onApprove={stage.approve}
      onAbort={stage.abort}
    >
      <ErrorBoundary label="Region Scan">
        {stage.isRunning && (
          <LoadingAgent
            title="Scanning Australian regions..."
            phase={`Searching growth data, vacancy rates, medians — turn ${stage.turn + 1}`}
            steps={[
              { label: 'Search data', status: stage.turn >= 1 ? 'done' : 'active' },
              { label: 'Score regions', status: stage.turn >= 2 ? 'done' : stage.turn >= 1 ? 'active' : 'pending' },
              { label: 'Rank & filter', status: stage.turn >= 2 ? 'active' : 'pending' },
            ]}
          />
        )}
        {stage.data && (
          <RegionResults
            data={stage.data}
            selections={stage.selections}
            onSelect={stage.select}
          />
        )}
        {stage.status === 'idle' && !stage.data && (
          <div className="loading-agent">
            <div className="loading-agent__icon">🗺</div>
            <div className="loading-agent__title">Ready to scan regions</div>
            <div className="loading-agent__phase">
              Requires Macro Environment (Stage 1) to be completed first.<br />
              Agent will search and score 30+ regions across Australia.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
