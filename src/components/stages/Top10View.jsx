import { useEffect, useState, useMemo } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';

// Stamp duty estimates by state (investor, approximate)
const STAMP_DUTY = {
  WA: (p) => p <= 500000 ? p * 0.04 : 20000 + (p - 500000) * 0.055,
  SA: (p) => p * 0.045 + 1000,
  QLD: (p) => p <= 540000 ? p * 0.035 : 18900 + (p - 540000) * 0.045,
  VIC: (p) => p * 0.055 + p * 0.015, // includes investor surcharge ~1.5%
};

const INVESTOR = {
  budget: 800000,
  cash: 110000,
  depositPct: 0.10,
  lmiPct: 0.02, // ~2% of loan at 90% LVR
  legalBP: 5000,
  interestRate: 0.062, // investor variable ~6.2%
  managementPct: 0.08, // 8% of rent
  insuranceYr: 1800,
  ratesYr: 2200,
};

export function Top10View() {
  const [listings, setListings] = useState(null);
  const [suburbs, setSuburbs] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [lr, sr] = await Promise.all([
        fetch(`/data/listings.json?t=${Date.now()}`),
        fetch(`/data/suburbs.json?t=${Date.now()}`),
      ]);
      if (!lr.ok) throw new Error('No listings yet');
      setListings(await lr.json());
      if (sr.ok) setSuburbs(await sr.json());
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  // Build suburb lookup
  const suburbLookup = useMemo(() => {
    if (!suburbs?.suburbs) return {};
    const m = {};
    for (const s of suburbs.suburbs) {
      m[s.name.toLowerCase()] = s;
    }
    return m;
  }, [suburbs]);

  const top10 = useMemo(() => {
    if (!listings) return [];

    const all = [];
    for (const [suburbKey, data] of Object.entries(listings)) {
      for (const item of (data.items || [])) {
        if (item.verdict === 'INVESTIGATE') {
          all.push({ ...item, _suburb: suburbKey, _state: data.state });
        }
      }
    }

    const scored = all.map(l => {
      let score = 0;
      const reasons = [];
      const warnings = [];
      const price = l.priceNumeric || 0;
      const state = l._state || 'WA';

      // ═══ FIND SUBURB DATA ═══
      const subName = (l._suburb || '').split(' (')[0].toLowerCase();
      const subData = suburbLookup[subName] || null;
      const risk = subData?.riskFilter || {};
      const fwd = subData?.forward || {};
      const compositeScore = subData?.compositeScore || 0;

      // ═══ 1. FORWARD GROWTH (biggest weight) ═══
      const baseGrowth = fwd.bear ? ((fwd.bear + fwd.base * 2 + fwd.bull) / 4) : 20; // weighted avg
      if (baseGrowth >= 35) { score += 80; reasons.push(`${Math.round(baseGrowth)}% 5yr growth (strong)`); }
      else if (baseGrowth >= 25) { score += 50; reasons.push(`${Math.round(baseGrowth)}% 5yr growth`); }
      else if (baseGrowth >= 15) { score += 25; }
      else { score += 5; warnings.push(`Only ${Math.round(baseGrowth)}% 5yr growth forecast`); }

      // ═══ 2. SUPPLY RISK PENALTY (empty land = bad) ═══
      const supplyRisk = risk.supplyRisk?.rating || '';
      if (supplyRisk === 'HIGH') { score -= 60; warnings.push('HIGH supply risk — greenfield/new builds nearby'); }
      else if (supplyRisk === 'MEDIUM') { score -= 25; warnings.push('MEDIUM supply risk'); }
      else if (supplyRisk === 'LOW') { score += 20; reasons.push('LOW supply risk — established suburb'); }

      // Cycle risk
      const cycleRisk = risk.cycleRisk?.rating || '';
      if (cycleRisk === 'HIGH') { score -= 30; warnings.push('Post-spike correction risk'); }
      else if (cycleRisk === 'MEDIUM') { score -= 10; }

      // ═══ 3. DSR COMPOSITE (our own data) ═══
      if (compositeScore >= 85) { score += 50; reasons.push(`DSR ${compositeScore}/100`); }
      else if (compositeScore >= 75) { score += 30; reasons.push(`DSR ${compositeScore}/100`); }
      else if (compositeScore >= 65) { score += 15; }
      else if (compositeScore > 0) { score += 5; warnings.push(`DSR only ${compositeScore}/100`); }

      // ═══ 4. YOUR SCENARIO — does it fit $110k cash? ═══
      let totalCost = null;
      let monthlyHoldCost = null;
      let fiveYrEquity = null;
      let cashFits = false;

      if (price > 0) {
        const deposit = price * INVESTOR.depositPct;
        const loan = price - deposit;
        const lmi = loan * INVESTOR.lmiPct;
        const stampFn = STAMP_DUTY[state] || STAMP_DUTY.WA;
        const stamp = stampFn(price);
        totalCost = Math.round(deposit + stamp + lmi + INVESTOR.legalBP);
        cashFits = totalCost <= INVESTOR.cash;

        if (cashFits) {
          score += 30;
          reasons.push(`Fits $110k cash ($${Math.round(totalCost/1000)}k total)`);
        } else {
          score -= 40;
          warnings.push(`OVER cash ($${Math.round(totalCost/1000)}k vs $110k)`);
        }

        // Monthly hold cost
        const weeklyMortgage = loan * INVESTOR.interestRate / 52;
        const yMatch = (l.yieldEst || '').match(/([\d.]+)/);
        const estRentWeekly = yMatch ? (price * parseFloat(yMatch[1]) / 100 / 52) : 0;
        const weeklyMgmt = estRentWeekly * INVESTOR.managementPct;
        const weeklyInsRates = (INVESTOR.insuranceYr + INVESTOR.ratesYr) / 52;
        const weeklyHoldCost = weeklyMortgage + weeklyMgmt + weeklyInsRates - estRentWeekly;
        monthlyHoldCost = Math.round(weeklyHoldCost * 4.33);

        if (monthlyHoldCost < 400) { score += 15; }
        else if (monthlyHoldCost < 800) { score += 5; }
        else { warnings.push(`$${monthlyHoldCost}/mo hold cost`); }

        // 5yr equity position
        const growthRate = baseGrowth / 100;
        const futureValue = price * (1 + growthRate);
        const principalPaid = loan * 0.05; // ~5% principal in 5yr on interest-only approx
        fiveYrEquity = Math.round(futureValue - loan + principalPaid);

        if (fiveYrEquity > 300000) { score += 30; reasons.push(`$${Math.round(fiveYrEquity/1000)}k equity in 5yr`); }
        else if (fiveYrEquity > 200000) { score += 15; reasons.push(`$${Math.round(fiveYrEquity/1000)}k equity in 5yr`); }
      }

      // ═══ 5. VALUE-ADD (subdivision still matters but less dominant) ═══
      const va = (l.valueAdd || '').toLowerCase();
      if (va.includes('r40') || va.includes('r30') || va.includes('r60')) { score += 30; reasons.push('Subdivision zoning'); }
      else if (va.includes('subdivision') || va.includes('subdivide')) { score += 20; reasons.push('Subdivision potential'); }
      if (va.includes('granny flat')) { score += 15; reasons.push('Granny flat'); }
      if (va.includes('corner')) { score += 10; reasons.push('Corner block'); }

      // ═══ 6. LAND (only matters if established suburb) ═══
      const landMatch = (l.land || '').match(/(\d+)/);
      const landSqm = landMatch ? parseInt(landMatch[1]) : 0;
      if (landSqm >= 800 && supplyRisk !== 'HIGH') { score += 20; reasons.push(`${landSqm}sqm block`); }
      else if (landSqm >= 650 && supplyRisk !== 'HIGH') { score += 10; }

      // ═══ 7. MOTIVATION ═══
      const ms = (l.motivationSignal || '').toLowerCase();
      if (ms.includes('motivated') || ms.includes('must sell')) { score += 15; reasons.push('Motivated seller'); }
      if (ms.includes('new price') || ms.includes('reduced')) { score += 10; reasons.push('Price reduced'); }

      // ═══ 8. STATE DIVERSIFICATION ═══
      if (state === 'QLD') { score += 10; reasons.push('QLD diversification'); }
      if (state === 'SA') { score += 5; }

      return { ...l, _score: score, _reasons: reasons, _warnings: warnings,
               _totalCost: totalCost, _monthlyHold: monthlyHoldCost,
               _fiveYrEquity: fiveYrEquity, _cashFits: cashFits,
               _baseGrowth: baseGrowth, _compositeScore: compositeScore,
               _supplyRisk: supplyRisk };
    });

    scored.sort((a, b) => b._score - a._score);

    // Diversification: max 7 WA
    const picked = [];
    const stateCount = {};
    for (const item of scored) {
      const s = item._state || '?';
      if (picked.length >= 10) break;
      if (s === 'WA' && (stateCount.WA || 0) >= 7) continue;
      picked.push(item);
      stateCount[s] = (stateCount[s] || 0) + 1;
    }
    if (picked.length < 10) {
      for (const item of scored) {
        if (picked.length >= 10) break;
        if (!picked.includes(item)) picked.push(item);
      }
    }
    return picked;
  }, [listings, suburbLookup]);

  const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : '—';

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">Agent 8: Final Ranking</h2>
          <p className="stage-shell__desc">Forward-looking investment model — growth-adjusted, risk-filtered, scenario-modelled for your $800k / $110k / 5yr profile</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={load}>Reload</button>
      </div>

      <ErrorBoundary label="Top10">
        {err && <div className="error-display"><div className="error-display__title">No data</div><div className="error-display__message">{err}</div></div>}

        {top10.length > 0 && (
          <>
            <div className="info-box info-box--blue mb-16" style={{ fontSize: 11, lineHeight: 1.7 }}>
              <strong>Scoring model:</strong> 5yr forward growth (weighted avg of bear/base/bull) · Supply risk penalty (HIGH -60, MEDIUM -25, LOW +20) · DSR composite from suburb data · Cash fit check ($110k) · Monthly hold cost · 5yr equity projection · Value-add bonus (subdivision/granny flat) · State diversification (max 7 WA) · Motivation signals
            </div>

            {/* Summary chips */}
            <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
              {Object.entries(top10.reduce((a, l) => { a[l._state || '?'] = (a[l._state || '?'] || 0) + 1; return a; }, {})).map(([s, n]) => (
                <div key={s} className="header__chip"><b>{s}</b>: {n}</div>
              ))}
              <div className="header__chip" style={{ borderColor: 'var(--green)' }}>
                {top10.filter(l => l._cashFits).length} fit $110k cash
              </div>
            </div>

            {top10.map((l, i) => (
              <div key={i} className="listing-card listing-card--investigate" style={{ position: 'relative', marginBottom: 14 }}>
                {/* Rank badge */}
                <div style={{ position: 'absolute', top: 14, left: -16, width: 36, height: 36, borderRadius: '50%',
                  background: i < 3 ? 'var(--green)' : 'var(--blue)', color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-mono)', zIndex: 2 }}>
                  {i + 1}
                </div>

                {/* Header */}
                <div className="listing-card__header" style={{ paddingLeft: 28 }}>
                  <div style={{ flex: 1 }}>
                    <div className="listing-card__addr">{l.addr}</div>
                    <div className="listing-card__specs">
                      {l.beds && <span>{l.beds} bed</span>}
                      {l.baths && <span>{l.baths} bath</span>}
                      {l.car && <span>{l.car} car</span>}
                      {l.land && <span>{l.land}</span>}
                      <span className="mono" style={{ color: 'var(--amber)' }}>score {l._score}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="listing-card__price">{l.price || 'POA'}</div>
                    <div className="text-xs text-muted">{l._state}</div>
                  </div>
                </div>

                {/* Scenario model */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, padding: '8px 16px 8px 28px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  <div className="metric">
                    <div className="metric__label">5yr Growth</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._baseGrowth >= 30 ? 'var(--green)' : l._baseGrowth >= 20 ? 'var(--amber)' : 'var(--red)' }}>+{Math.round(l._baseGrowth)}%</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Total Cost</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._cashFits ? 'var(--green)' : 'var(--red)' }}>{l._totalCost ? `$${Math.round(l._totalCost/1000)}k` : '—'}</div>
                    <div className="metric__sub">{l._cashFits ? '✓ fits $110k' : '✗ over $110k'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Hold Cost</div>
                    <div className="metric__value" style={{ fontSize: 14 }}>{l._monthlyHold != null ? `$${l._monthlyHold}/mo` : '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">5yr Equity</div>
                    <div className="metric__value" style={{ fontSize: 14, color: 'var(--green)' }}>{l._fiveYrEquity ? `$${Math.round(l._fiveYrEquity/1000)}k` : '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Supply Risk</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._supplyRisk === 'LOW' ? 'var(--green)' : l._supplyRisk === 'HIGH' ? 'var(--red)' : 'var(--amber)' }}>{l._supplyRisk || '?'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">DSR Score</div>
                    <div className="metric__value" style={{ fontSize: 14 }}>{l._compositeScore || '—'}</div>
                  </div>
                </div>

                {/* Reasons + warnings */}
                <div className="listing-card__body" style={{ paddingLeft: 28 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {l._reasons.slice(0, 5).map((r, j) => (
                      <span key={j} className="verdict" style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>{r}</span>
                    ))}
                  </div>
                  {l._warnings.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {l._warnings.map((w, j) => (
                        <span key={j} className="verdict" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)' }}>{w}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-muted mt-4">{l.valueAdd}</div>
                </div>

                {/* Action */}
                {l.url && (
                  <div className="listing-card__footer" style={{ paddingLeft: 28 }}>
                    <span className="mono text-xs text-muted">→ Call agent, request contract, book B&P ($400-600)</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">View listing</a>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {!listings && !err && (
          <div className="loading-agent"><div className="loading-agent__icon">🏆</div><div className="loading-agent__title">Loading...</div></div>
        )}
      </ErrorBoundary>
    </div>
  );
}
