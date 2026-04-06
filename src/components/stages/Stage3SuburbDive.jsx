import { useState } from 'react';
import { useStageLoader } from '../../hooks/useStageLoader';
import { StageShell } from '../layout/StageShell';
import { SpiderChart } from '../common/SpiderChart';
import { VerdictBadge } from '../common/VerdictBadge';
import { ScoreBar } from '../common/ScoreBar';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { scoreColor } from '../../lib/scoring';

function QualSection({ icon, label, rating, ratingColor, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qual-item">
      <div className="qual-item__header" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span className="qual-item__icon">{icon}</span>
        <span className="qual-item__label">{label}</span>
        {rating && (
          <span className="qual-item__rating" style={{ background: (ratingColor || 'var(--text-muted)') + '1a', color: ratingColor || 'var(--text-muted)' }}>
            {rating}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
      </div>
      {open && <div className="qual-item__detail" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

const ratingColor = (r) => {
  if (!r) return 'var(--text-muted)';
  const l = r.toLowerCase();
  if (['low', 'excellent', 'good', 'improving', 'none'].includes(l)) return 'var(--green)';
  if (['moderate', 'average', 'stable'].includes(l)) return 'var(--amber)';
  if (['high', 'below-average', 'worsening', 'above-average'].includes(l)) return 'var(--red)';
  return 'var(--text-muted)';
};

function SuburbCard({ suburb, isSelected, onToggle }) {
  const q = suburb.quant || {};
  const qual = suburb.qual || {};
  const fwd = suburb.forward || {};

  // Build spider chart metrics
  const spiderMetrics = Object.entries(q)
    .filter(([, v]) => v?.score != null)
    .map(([k, v]) => ({ label: k, score: v.score }));

  const avgScore = suburb.compositeScore;
  const color = scoreColor(avgScore);

  return (
    <div className="suburb-card" style={{ borderColor: isSelected ? 'var(--amber)' : undefined }}>
      {/* Header */}
      <div className="suburb-card__header">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            className="data-table__checkbox"
            checked={isSelected}
            onChange={onToggle}
            style={{ marginTop: 4 }}
          />
          <div>
            <div className="suburb-card__name">{suburb.name}</div>
            <div className="suburb-card__meta">{suburb.state} {suburb.postcode} · {suburb.lga}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {avgScore && (
            <div className="suburb-card__score" style={{ background: color + '18', border: `1px solid ${color}44` }}>
              <div className="suburb-card__score-value" style={{ color }}>{avgScore}</div>
              <div className="suburb-card__score-label">composite</div>
            </div>
          )}
          {suburb.verdict && <VerdictBadge verdict={suburb.verdict} />}
        </div>
      </div>

      {/* Key metrics row */}
      <div className="metric-grid mb-12">
        {[
          ['Median', `$${(suburb.medianHouse / 1000).toFixed(0)}k`],
          ['Growth', q.priceGrowth?.value != null ? `+${q.priceGrowth.value}%` : '—'],
          ['DOM', q.dom?.value != null ? `${q.dom.value}d` : '—'],
          ['Vacancy', q.vacancy?.value != null ? `${q.vacancy.value}%` : '—'],
          ['Yield', q.yield?.value != null ? `${q.yield.value}%` : '—'],
          ['Rent', suburb.medianRentWeekly ? `$${suburb.medianRentWeekly}pw` : '—'],
          ['IRSAD', qual.demographics?.irsad || '—'],
          ['Renters', q.renterPercent?.value != null ? `${q.renterPercent.value}%` : '—'],
        ].map(([label, value], i) => (
          <div key={i} className="metric">
            <div className="metric__label">{label}</div>
            <div className="metric__value" style={{ fontSize: 14 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Signals */}
      {suburb.topSignals?.length > 0 && (
        <div className="info-box info-box--green mb-8" style={{ fontSize: 10 }}>
          {suburb.topSignals.map((s, i) => <div key={i}>✓ {s}</div>)}
        </div>
      )}
      {suburb.watchPoints?.length > 0 && (
        <div className="info-box info-box--amber mb-12" style={{ fontSize: 10 }}>
          {suburb.watchPoints.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Spider chart + DSR metrics */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {spiderMetrics.length >= 3 && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
            <SpiderChart metrics={spiderMetrics} avgScore={avgScore} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
          {Object.entries(q).map(([key, val]) => {
            const sc = val?.score;
            const cl = sc != null ? scoreColor(sc) : 'var(--text-muted)';
            return (
              <div key={key} style={{ background: 'var(--bg-secondary)', border: `1px solid ${sc != null ? cl + '30' : 'var(--border)'}`, borderRadius: 6, padding: '6px 8px', opacity: sc != null ? 1 : 0.45 }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs fw-700" style={{ color: cl }}>{key.toUpperCase()}</span>
                  <div className="flex gap-8 items-center">
                    <span className="mono text-sm text-heading fw-600">{val?.value ?? '—'}</span>
                    {sc != null && (
                      <span className="mono text-xs fw-700" style={{ color: cl, background: cl + '20', padding: '1px 4px', borderRadius: 2 }}>{sc}</span>
                    )}
                  </div>
                </div>
                {sc != null && <ScoreBar score={sc} />}
                <div className="text-xs text-muted mono mt-4">{val?.source || ''}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5yr Forward Outlook */}
      {fwd.cycleStage && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="section-label">5-Year Forward Outlook</div>
          <div className="scenario-row mb-8">
            <div className="scenario-box" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="scenario-box__label">CYCLE</div>
              <div className="scenario-box__value mono" style={{
                color: fwd.cycleStage?.startsWith('LATE') ? 'var(--red)' : fwd.cycleStage?.startsWith('MID') ? 'var(--amber)' : 'var(--green)'
              }}>{fwd.cycleStage}</div>
            </div>
            {[['BEAR', fwd.bear, 'var(--red)'], ['BASE', fwd.base, 'var(--amber)'], ['BULL', fwd.bull, 'var(--green)']].map(([label, val, c]) => (
              <div key={label} className="scenario-box" style={{ background: c + '10', border: `1px solid ${c}30` }}>
                <div className="scenario-box__label">{label}</div>
                <div className="scenario-box__value" style={{ color: c }}>+{val}%</div>
              </div>
            ))}
            <div style={{ flex: 1, minWidth: 180, background: 'rgba(148,163,184,.04)', border: '1px solid rgba(148,163,184,.1)', borderRadius: 8, padding: '8px 10px' }}>
              <div className="text-xs text-muted mb-8">CONSENSUS</div>
              <div style={{ fontSize: 10, color: 'var(--text-primary)', lineHeight: 1.5 }}>{fwd.consensus}</div>
            </div>
          </div>

          <div className="grid-2 mb-8">
            <div className="info-box info-box--green">
              <div className="text-xs fw-700 text-green mb-8">STRUCTURAL DRIVERS</div>
              {fwd.drivers?.map((d, i) => <div key={i} style={{ fontSize: 10, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d}</div>)}
            </div>
            <div className="info-box info-box--red">
              <div className="text-xs fw-700 text-red mb-8">RISKS</div>
              {fwd.risks?.map((r, i) => <div key={i} style={{ fontSize: 10, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{r}</div>)}
            </div>
          </div>

          {fwd.analystViews?.length > 0 && (
            <div className="info-box info-box--blue mb-8" style={{ fontSize: 10 }}>
              <div className="text-xs fw-700 text-blue mb-8">ANALYST VIEWS</div>
              {fwd.analystViews.map((a, i) => <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{a}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Qualitative Analysis */}
      {qual && Object.keys(qual).length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
          <div className="section-label">Qualitative Analysis</div>
          <div className="qual-grid">
            {qual.infrastructure?.length > 0 && (
              <QualSection icon="🏗" label="Infrastructure" rating={`${qual.infrastructure.length} projects`} ratingColor="var(--blue)">
                {qual.infrastructure.map((p, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="fw-600 text-heading" style={{ fontSize: 11 }}>{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.type} · Status: <span style={{ color: p.status === 'under-construction' ? 'var(--amber)' : p.status === 'completed' ? 'var(--green)' : 'var(--text-muted)' }}>{p.status}</span>
                      {p.delayMonths ? ` · Delayed ${p.delayMonths}mo` : ''}
                      {p.investmentAud ? ` · $${(p.investmentAud / 1e9).toFixed(1)}B` : ''}
                    </div>
                    {p.notes && <div className="text-xs text-muted">{p.notes}</div>}
                  </div>
                ))}
              </QualSection>
            )}
            {qual.crime && (
              <QualSection icon="🛡" label="Crime & Safety" rating={qual.crime.overallRating} ratingColor={ratingColor(qual.crime.overallRating)}>
                <div>Trend: {qual.crime.trend} · vs State: {qual.crime.comparisonToState}</div>
                {qual.crime.notableTypes?.map((n, i) => <div key={i}>{n}</div>)}
              </QualSection>
            )}
            {qual.publicHousing && (
              <QualSection icon="🏠" label="Public Housing" rating={qual.publicHousing.concentration} ratingColor={ratingColor(qual.publicHousing.concentration === 'none' ? 'none' : qual.publicHousing.concentration)}>
                <div>Existing nearby: {qual.publicHousing.existingNearby ? 'Yes' : 'No'}</div>
                <div>Planned: {qual.publicHousing.plannedNearby ? 'Yes' : 'No'}</div>
                {qual.publicHousing.details && <div>{qual.publicHousing.details}</div>}
              </QualSection>
            )}
            {qual.schools && (
              <QualSection icon="🎓" label="Schools" rating={qual.schools.overallQuality} ratingColor={ratingColor(qual.schools.overallQuality)}>
                {qual.schools.primary?.map((s, i) => <div key={`p${i}`}>Primary: {s.name} ({s.distance})</div>)}
                {qual.schools.secondary?.map((s, i) => <div key={`s${i}`}>Secondary: {s.name} ({s.distance})</div>)}
              </QualSection>
            )}
            {qual.hazards && (
              <QualSection icon="⚠" label="Hazards" rating={[qual.hazards.flood?.risk, qual.hazards.bushfire?.risk].filter(r => r === 'high').length > 0 ? 'HIGH' : 'LOW'} ratingColor={[qual.hazards.flood?.risk, qual.hazards.bushfire?.risk].some(r => r === 'high') ? 'var(--red)' : 'var(--green)'}>
                <div>Flood: {qual.hazards.flood?.risk || '—'} {qual.hazards.flood?.zone ? `(${qual.hazards.flood.zone})` : ''}</div>
                <div>Bushfire: {qual.hazards.bushfire?.risk || '—'} {qual.hazards.bushfire?.zone ? `(${qual.hazards.bushfire.zone})` : ''}</div>
                <div>Coastal: {qual.hazards.coastal?.risk || 'n/a'}</div>
              </QualSection>
            )}
            {qual.zoning && (
              <QualSection icon="📋" label="Zoning" rating={qual.zoning.densificationPotential} ratingColor="var(--blue)">
                <div>Current: {qual.zoning.currentZoning || '—'}</div>
                <div>Densification: {qual.zoning.densificationPotential || '—'}</div>
                {qual.zoning.recentRezonings && <div>Recent: {qual.zoning.recentRezonings}</div>}
              </QualSection>
            )}
            {qual.connectivity && (
              <QualSection icon="🚆" label="Connectivity" rating={qual.connectivity.nbn || ''} ratingColor="var(--blue)">
                <div>NBN: {qual.connectivity.nbn || '—'}</div>
                <div>Transport: {qual.connectivity.publicTransport || '—'}</div>
                <div>CBD: {qual.connectivity.cbdDistance || '—'}</div>
              </QualSection>
            )}
            {qual.noise && (
              <QualSection icon="🔇" label="Noise" rating={qual.noise.flightPath || qual.noise.highway ? 'Issues' : 'Clear'} ratingColor={qual.noise.flightPath || qual.noise.highway ? 'var(--amber)' : 'var(--green)'}>
                <div>Flight path: {qual.noise.flightPath ? 'Yes' : 'No'}</div>
                <div>Highway: {qual.noise.highway ? 'Yes' : 'No'}</div>
                <div>Industrial: {qual.noise.industrial ? 'Yes' : 'No'}</div>
                {qual.noise.notes && <div>{qual.noise.notes}</div>}
              </QualSection>
            )}
            {qual.demographics && (
              <QualSection icon="👥" label="Demographics" rating={`IRSAD ${qual.demographics.irsad || '—'}`} ratingColor={qual.demographics.irsad >= 950 ? 'var(--green)' : qual.demographics.irsad >= 900 ? 'var(--amber)' : 'var(--red)'}>
                <div>Median age: {qual.demographics.medianAge || '—'}</div>
                <div>Trend: {qual.demographics.trend || '—'}</div>
                <div>Household: {qual.demographics.householdType || '—'}</div>
              </QualSection>
            )}
          </div>
        </div>
      )}

      {suburb.stampDutyNote && (
        <div className="info-box info-box--amber mt-12" style={{ fontSize: 10 }}>
          💰 {suburb.stampDutyNote}
        </div>
      )}
    </div>
  );
}

export function Stage3SuburbDive() {
  const stage = useStageLoader('suburbs');

  return (
    <StageShell
      title="Suburb Deep Dive"
      description="DSR metrics + qualitative analysis per suburb"
      status={stage.status}
      error={stage.error}
      timestamp={stage.timestamp}
      isUnlocked={stage.isUnlocked}
      hasSelections={stage.selections.length > 0}
      onLoad={stage.load}
      onReset={stage.load}
      onApprove={stage.approve}
    >
      <ErrorBoundary label="Suburb Deep Dive">
        {stage.data?.suburbs?.map((suburb, i) => (
          <SuburbCard
            key={i}
            suburb={suburb}
            isSelected={stage.selections.includes(suburb.name)}
            onToggle={() => {
              const name = suburb.name;
              if (stage.selections.includes(name)) {
                stage.select(stage.selections.filter(s => s !== name));
              } else {
                stage.select([...stage.selections, name]);
              }
            }}
          />
        ))}
        {stage.status === 'idle' && !stage.data && (
          <div className="loading-agent">
            <div className="loading-agent__icon">🏘</div>
            <div className="loading-agent__title">No suburb data yet</div>
            <div className="loading-agent__phase">
              Ask Claude Code: "run suburb deep dive"<br />
              Then click "Load Data" to display results.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
