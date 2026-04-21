import { useEffect, useState, useMemo } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { VerdictBadge } from '../common/VerdictBadge';

export function Top10View() {
  const [listings, setListings] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const r = await fetch(`/data/listings.json?t=${Date.now()}`);
      if (!r.ok) throw new Error('No listings yet — run listing scout first');
      setListings(await r.json());
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  const top10 = useMemo(() => {
    if (!listings) return [];

    // Collect all INVESTIGATE listings
    const all = [];
    for (const [suburbKey, data] of Object.entries(listings)) {
      for (const item of (data.items || [])) {
        if (item.verdict === 'INVESTIGATE') {
          all.push({ ...item, _suburb: suburbKey, _state: data.state });
        }
      }
    }

    // Ranking algorithm — Agent 8 logic
    const scored = all.map(l => {
      let score = 0;
      const reasons = [];

      // Land size (biggest signal — subdivision potential)
      const landMatch = (l.land || '').match(/(\d+)/);
      const landSqm = landMatch ? parseInt(landMatch[1]) : 0;
      if (landSqm >= 1000) { score += 120; reasons.push(`${landSqm}sqm mega-block`); }
      else if (landSqm >= 800) { score += 80; reasons.push(`${landSqm}sqm large block`); }
      else if (landSqm >= 650) { score += 40; reasons.push(`${landSqm}sqm decent block`); }

      // Subdivision zoning / value-add
      const va = (l.valueAdd || '').toLowerCase();
      if (va.includes('r40') || va.includes('r30') || va.includes('r60')) { score += 100; reasons.push('R30/R40/R60 zoning'); }
      if (va.includes('subdivision') || va.includes('subdivide')) { score += 80; reasons.push('Subdivision potential'); }
      if (va.includes('granny flat')) { score += 40; reasons.push('Granny flat upside'); }
      if (va.includes('corner')) { score += 30; reasons.push('Corner block'); }
      if (va.includes('duplex')) { score += 50; reasons.push('Duplex potential'); }

      // Motivation signals
      const ms = (l.motivationSignal || '').toLowerCase();
      if (l.motivation === 'HIGH') { score += 40; }
      if (ms.includes('new price') || ms.includes('price reduced') || ms.includes('reduced')) {
        score += 30; reasons.push('Price reduced');
      }
      if (ms.includes('motivated') || ms.includes('must sell')) { score += 40; reasons.push('Motivated vendor'); }
      if (ms.includes('deceased') || ms.includes('mortgagee')) { score += 35; reasons.push('Distress signal'); }

      // Yield
      const yMatch = (l.yieldEst || '').match(/([\d.]+)/);
      const yieldVal = yMatch ? parseFloat(yMatch[1]) : 0;
      if (yieldVal >= 5.5) { score += 40; reasons.push(`${yieldVal}% yield`); }
      else if (yieldVal >= 5.0) { score += 25; reasons.push(`${yieldVal}% yield`); }

      // Price under budget sweet spot
      const price = l.priceNumeric || 0;
      if (price && price < 650000) { score += 25; reasons.push('Sub-$650k entry'); }
      else if (price && price < 750000) { score += 10; }

      // State diversification bonus (QLD/SA gets +15 to balance WA)
      if (l._state === 'QLD') { score += 15; reasons.push('QLD diversification'); }
      if (l._state === 'SA') { score += 10; reasons.push('SA diversification'); }

      return { ...l, _score: score, _reasons: reasons };
    });

    scored.sort((a, b) => b._score - a._score);

    // Apply state diversification: ensure no more than 7 from WA in top 10
    const picked = [];
    const stateCount = {};
    for (const item of scored) {
      const s = item._state || '?';
      if (picked.length >= 10) break;
      if (s === 'WA' && (stateCount.WA || 0) >= 7) continue;
      picked.push(item);
      stateCount[s] = (stateCount[s] || 0) + 1;
    }

    // If we didn't reach 10, fill with remaining WA
    if (picked.length < 10) {
      for (const item of scored) {
        if (picked.length >= 10) break;
        if (!picked.includes(item)) picked.push(item);
      }
    }

    return picked;
  }, [listings]);

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">🏆 Top 10 — Agent 8 Final Ranking</h2>
          <p className="stage-shell__desc">AI-curated best picks across all INVESTIGATE listings, ranked by investment value</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={load}>Reload</button>
      </div>

      <ErrorBoundary label="Top10">
        {err && <div className="error-display"><div className="error-display__title">No data</div><div className="error-display__message">{err}</div></div>}

        {top10.length > 0 && (
          <>
            <div className="info-box info-box--blue mb-16">
              <strong>Agent 8: Final Ranker</strong> reviewed {Object.values(listings || {}).reduce((n, d) => n + (d.items?.filter(i => i.verdict === 'INVESTIGATE').length || 0), 0)} INVESTIGATE candidates and ranked them by: subdivision zoning (+100), large block (+80-120), motivation signals (+30-40), yield (+25-40), price headroom (+10-25), state diversification (+10-15).
            </div>

            <div className="section-label">State Distribution</div>
            <div className="mb-16" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(top10.reduce((acc, l) => { acc[l._state || '?'] = (acc[l._state || '?'] || 0) + 1; return acc; }, {})).map(([s, n]) => (
                <div key={s} className="header__chip">
                  <b>{s}</b>: {n}
                </div>
              ))}
            </div>

            <div className="section-label">The Top 10</div>
            {top10.map((l, i) => (
              <div key={i} className="listing-card listing-card--investigate" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, left: -14, width: 34, height: 34, borderRadius: '50%',
                  background: i < 3 ? 'var(--green)' : 'var(--blue)', color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)', zIndex: 2 }}>
                  {i + 1}
                </div>
                <div className="listing-card__header" style={{ paddingLeft: 28 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="listing-card__addr">{l.addr}</div>
                    <div className="listing-card__specs">
                      {l.beds != null && <span>{l.beds} bed</span>}
                      {l.baths != null && <span>{l.baths} bath</span>}
                      {l.car != null && <span>{l.car} car</span>}
                      {l.land && <span>{l.land}</span>}
                      <span className="mono" style={{ color: 'var(--amber)' }}>score: {l._score}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="listing-card__price">{l.price || 'POA'}</div>
                    <div className="text-xs text-muted">{l._state}</div>
                  </div>
                </div>

                <div className="listing-card__signal-bar" style={{ paddingLeft: 28 }}>
                  {l._reasons.slice(0, 4).map((r, j) => (
                    <span key={j} className="verdict" style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                      {r}
                    </span>
                  ))}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {l.yieldEst && l.yieldEst !== 'N/A' && (
                      <span className="mono text-xs" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 3 }}>
                        yield {l.yieldEst}
                      </span>
                    )}
                    {l.cashflowEst && l.cashflowEst !== 'N/A' && (
                      <span className="mono text-xs" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 3 }}>
                        {l.cashflowEst}
                      </span>
                    )}
                  </span>
                </div>

                <div className="listing-card__body" style={{ paddingLeft: 28 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>{l.reason}</div>
                </div>

                {l.url && (
                  <div className="listing-card__footer" style={{ paddingLeft: 28 }}>
                    <span className="mono text-xs text-muted">→ Call agent, request contract, book B&P inspection</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
                      View listing ↗
                    </a>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {!listings && !err && (
          <div className="loading-agent"><div className="loading-agent__icon">🏆</div><div className="loading-agent__title">Loading top 10...</div></div>
        )}
      </ErrorBoundary>
    </div>
  );
}
