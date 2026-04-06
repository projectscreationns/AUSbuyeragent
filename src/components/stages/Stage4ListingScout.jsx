import { useStageLoader } from '../../hooks/useStageLoader';
import { StageShell } from '../layout/StageShell';
import { VerdictBadge } from '../common/VerdictBadge';
import { ErrorBoundary } from '../common/ErrorBoundary';

function ListingCard({ listing }) {
  const isInv = listing.verdict === 'INVESTIGATE';
  const mc = listing.motivation === 'HIGH' ? 'var(--red)' : listing.motivation === 'MEDIUM' ? 'var(--amber)' : 'var(--text-muted)';

  return (
    <div className={`listing-card ${isInv ? 'listing-card--investigate' : 'listing-card--monitor'}`}>
      <div className="listing-card__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="listing-card__addr">{listing.addr}</div>
          <div className="listing-card__specs">
            {listing.beds != null && <span>{listing.beds} bed</span>}
            {listing.baths != null && <span>{listing.baths} bath</span>}
            {listing.car != null && <span>{listing.car} car</span>}
            {listing.land && listing.land !== 'unknown' && <span>{listing.land}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="listing-card__price">{listing.price || '—'}</div>
        </div>
      </div>

      <div className="listing-card__signal-bar">
        <VerdictBadge verdict={listing.verdict} />
        {listing.motivation && (
          <span className="verdict" style={{ background: mc + '18', color: mc, border: `1px solid ${mc}30` }}>
            {listing.motivation} MOTIVATION
          </span>
        )}
        {listing.motivationSignal && <span className="text-sm text-muted">→ {listing.motivationSignal}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {listing.dom != null && (
            <span className="mono text-xs" style={{ color: listing.dom > 28 ? 'var(--red)' : listing.dom > 14 ? 'var(--amber)' : 'var(--green)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 3 }}>
              {listing.dom}d DOM
            </span>
          )}
          {listing.yieldEst && (
            <span className="mono text-xs" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 3 }}>
              yield {listing.yieldEst}
            </span>
          )}
        </span>
      </div>

      <div className="listing-card__body">
        {listing.valueAdd && listing.valueAdd !== 'NONE' && (
          <div className="info-box info-box--blue mb-8" style={{ display: 'inline-block', fontSize: 10 }}>
            ✦ {listing.valueAdd}
          </div>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>{listing.reason}</div>
      </div>

      {listing.url && listing.url !== 'null' && (
        <div className="listing-card__footer">
          <span className="mono text-xs text-muted">
            {isInv ? '→ Call agent, book inspection' : '→ Set price alert on Domain'}
          </span>
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn btn--secondary btn--sm">
            View listing ↗
          </a>
        </div>
      )}
    </div>
  );
}

export function Stage4ListingScout() {
  const stage = useStageLoader('listings');

  // Data can be either:
  // - { suburbName: { items: [...], collected: N } } (keyed by suburb)
  // - or a flat array of listings
  const results = stage.data || {};
  const isKeyed = !Array.isArray(results);

  const allListings = isKeyed
    ? Object.entries(results).flatMap(([suburb, r]) => (r?.items || []).map(l => ({ ...l, _suburb: suburb })))
    : results;

  const totalInvestigate = allListings.filter(l => l.verdict === 'INVESTIGATE').length;
  const totalMonitor = allListings.filter(l => l.verdict === 'MONITOR').length;

  return (
    <StageShell
      title="Listing Scout"
      description="Live listings from Domain/REA with verdicts"
      status={stage.status}
      error={stage.error}
      timestamp={stage.timestamp}
      isUnlocked={stage.isUnlocked}
      onLoad={stage.load}
      onReset={stage.load}
      onApprove={stage.approve}
    >
      <ErrorBoundary label="Listing Scout">
        {stage.data && (
          <>
            <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
              <div className="info-box info-box--green" style={{ display: 'inline-block' }}>
                <span className="fw-700" style={{ fontSize: 16 }}>{totalInvestigate}</span> INVESTIGATE
              </div>
              <div className="info-box info-box--amber" style={{ display: 'inline-block' }}>
                <span className="fw-700" style={{ fontSize: 16 }}>{totalMonitor}</span> MONITOR
              </div>
            </div>

            {isKeyed ? (
              Object.entries(results).map(([suburbName, result]) => {
                if (!result?.items?.length) return null;
                const inv = result.items.filter(l => l.verdict === 'INVESTIGATE');
                const mon = result.items.filter(l => l.verdict === 'MONITOR');

                return (
                  <div key={suburbName} style={{ marginBottom: 20 }}>
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-heading fw-600" style={{ fontSize: 15 }}>{suburbName}</h3>
                      <span className="mono text-xs text-muted">
                        {result.collected || result.items.length} collected · {inv.length} investigate · {mon.length} monitor
                      </span>
                    </div>
                    {[...inv, ...mon].map((listing, i) => (
                      <ListingCard key={i} listing={listing} />
                    ))}
                  </div>
                );
              })
            ) : (
              allListings.map((listing, i) => (
                <ListingCard key={i} listing={listing} />
              ))
            )}
          </>
        )}

        {stage.status === 'idle' && !stage.data && (
          <div className="loading-agent">
            <div className="loading-agent__icon">🔍</div>
            <div className="loading-agent__title">No listing data yet</div>
            <div className="loading-agent__phase">
              Ask Claude Code: "run listing scout"<br />
              Then click "Load Data" to display results.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
