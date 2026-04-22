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
  cashTarget: 110000,   // preferred
  cashMax: 135000,      // can stretch if returns justify
  depositPct: 0.10,
  lmiPct: 0.02,
  legalBP: 5000,
  interestRate: 0.062,
  managementPct: 0.08,
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
      const reasons = [];
      const warnings = [];
      const price = l.priceNumeric || 0;
      const state = l._state || 'WA';

      const subName = (l._suburb || '').split(' (')[0].toLowerCase();
      const subData = suburbLookup[subName] || null;
      const risk = subData?.riskFilter || {};
      const fwd = subData?.forward || {};
      const compositeScore = subData?.compositeScore || 0;

      // Forward growth — weighted average of bear/base/bull
      const baseGrowth = fwd.bear != null ? ((fwd.bear + fwd.base * 2 + fwd.bull) / 4) : 20;

      // Supply/cycle risk adjustment to growth (REAL-WORLD penalty)
      const supplyRisk = risk.supplyRisk?.rating || '';
      const cycleRisk = risk.cycleRisk?.rating || '';
      let adjustedGrowth = baseGrowth;
      if (supplyRisk === 'HIGH') adjustedGrowth *= 0.6;  // growth capped
      else if (supplyRisk === 'MEDIUM') adjustedGrowth *= 0.85;
      if (cycleRisk === 'HIGH') adjustedGrowth *= 0.8;
      else if (cycleRisk === 'MEDIUM') adjustedGrowth *= 0.92;

      if (supplyRisk === 'LOW') reasons.push('LOW supply risk');
      else if (supplyRisk === 'HIGH') warnings.push(`Growth capped by HIGH supply risk`);
      else if (supplyRisk === 'MEDIUM') warnings.push('Growth capped by MEDIUM supply risk');

      // ═══ SCENARIO MODEL ═══
      let totalCost = null, monthlyHoldCost = null, fiveYrEquity = null;
      let cashFits = false, cashStretchFits = false;
      let fiveYrCapGain = null, fiveYrTotalCashOut = null, roci = null;
      let weeklyCashflow = null;

      if (price > 0) {
        const deposit = price * INVESTOR.depositPct;
        const loan = price - deposit;
        const lmi = loan * INVESTOR.lmiPct;
        const stampFn = STAMP_DUTY[state] || STAMP_DUTY.WA;
        const stamp = stampFn(price);
        totalCost = Math.round(deposit + stamp + lmi + INVESTOR.legalBP);
        cashFits = totalCost <= INVESTOR.cashTarget;
        cashStretchFits = totalCost <= INVESTOR.cashMax;

        // Rent and cashflow
        const yMatch = (l.yieldEst || '').match(/([\d.]+)/);
        const yieldPct = yMatch ? parseFloat(yMatch[1]) : 4.5;
        const annualRent = price * yieldPct / 100;
        const weeklyRent = annualRent / 52;
        const weeklyMortgage = loan * INVESTOR.interestRate / 52;
        const weeklyMgmt = weeklyRent * INVESTOR.managementPct;
        const weeklyInsRates = (INVESTOR.insuranceYr + INVESTOR.ratesYr) / 52;
        weeklyCashflow = weeklyRent - weeklyMortgage - weeklyMgmt - weeklyInsRates;
        monthlyHoldCost = Math.round(-weeklyCashflow * 4.33);

        // 5yr equity = future property value - loan remaining
        const growthRate = adjustedGrowth / 100;
        const futureValue = price * (1 + growthRate);
        fiveYrEquity = Math.round(futureValue - loan);
        fiveYrCapGain = Math.round(futureValue - price);

        // Total cash deployed over 5yr = upfront + negative cashflow
        const fiveYrNegCashflow = Math.max(0, -weeklyCashflow) * 52 * 5;
        fiveYrTotalCashOut = Math.round(totalCost + fiveYrNegCashflow);

        // Return on Cash Invested (ROCI) = cap gain / total cash deployed
        if (fiveYrTotalCashOut > 0) {
          roci = Math.round(fiveYrCapGain / fiveYrTotalCashOut * 100);
        }
      }

      // ═══ SCORE = ROCI-based ═══
      let score = roci || 0;

      // Bonuses that matter for growth confidence
      if (supplyRisk === 'LOW') score += 15;
      if (compositeScore >= 85) score += 20;
      else if (compositeScore >= 75) score += 10;
      if (cashFits) score += 10;
      else if (!cashStretchFits) score -= 50;

      const va = (l.valueAdd || '').toLowerCase();
      if (va.includes('r40') || va.includes('r30') || va.includes('r60')) { score += 15; reasons.push('Subdivision zoning'); }
      if (va.includes('granny flat')) { score += 10; }
      if (va.includes('corner')) { score += 5; }
      const landMatch = (l.land || '').match(/(\d+)/);
      const landSqm = landMatch ? parseInt(landMatch[1]) : 0;
      if (landSqm >= 800 && supplyRisk !== 'HIGH') { score += 10; reasons.push(`${landSqm}sqm block`); }

      // Reasons/warnings
      if (roci >= 150) reasons.push(`ROCI ${roci}% (excellent)`);
      else if (roci >= 100) reasons.push(`ROCI ${roci}%`);
      else if (roci && roci < 50) warnings.push(`Low ROCI ${roci}%`);
      if (!cashFits && cashStretchFits) warnings.push(`Stretch cash $${Math.round(totalCost/1000)}k (over $110k target)`);
      else if (!cashStretchFits) warnings.push(`TOO EXPENSIVE — $${Math.round(totalCost/1000)}k`);
      if (adjustedGrowth < baseGrowth) {
        reasons.push(`Growth adjusted ${Math.round(baseGrowth)}%→${Math.round(adjustedGrowth)}% for risks`);
      }
      if (monthlyHoldCost > 1000) warnings.push(`High hold cost $${monthlyHoldCost}/mo`);

      return { ...l, _score: score, _reasons: reasons, _warnings: warnings,
               _totalCost: totalCost, _monthlyHold: monthlyHoldCost,
               _fiveYrEquity: fiveYrEquity, _cashFits: cashFits, _cashStretch: cashStretchFits,
               _baseGrowth: baseGrowth, _adjustedGrowth: adjustedGrowth,
               _compositeScore: compositeScore, _supplyRisk: supplyRisk,
               _roci: roci, _fiveYrCapGain: fiveYrCapGain,
               _fiveYrCashOut: fiveYrTotalCashOut, _weeklyCashflow: weeklyCashflow };
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
              <strong>Ranked by ROCI (Return on Cash Invested over 5 years).</strong> Calculation: 5yr capital gain ÷ (upfront cash + 5yr negative cashflow). Growth rate is risk-adjusted: HIGH supply risk cuts growth 40%, MEDIUM cuts 15%. Cash target $110k preferred but stretch to $135k if ROCI justifies it. Returns speak.
            </div>

            {/* Summary chips */}
            <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
              {Object.entries(top10.reduce((a, l) => { a[l._state || '?'] = (a[l._state || '?'] || 0) + 1; return a; }, {})).map(([s, n]) => (
                <div key={s} className="header__chip"><b>{s}</b>: {n}</div>
              ))}
              <div className="header__chip" style={{ borderColor: 'var(--green)' }}>
                {top10.filter(l => l._cashFits).length}/10 fit $110k
              </div>
              <div className="header__chip" style={{ borderColor: 'var(--amber)' }}>
                {top10.filter(l => !l._cashFits && l._cashStretch).length}/10 stretch to $135k
              </div>
              <div className="header__chip" style={{ borderColor: 'var(--blue)' }}>
                avg ROCI: {Math.round(top10.reduce((a,l)=>a+(l._roci||0),0)/top10.length)}%
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, padding: '10px 16px 10px 28px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  <div className="metric" style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)' }}>
                    <div className="metric__label">ROCI 5YR</div>
                    <div className="metric__value" style={{ fontSize: 16, color: l._roci >= 150 ? 'var(--green)' : l._roci >= 100 ? 'var(--amber)' : 'var(--red)' }}>{l._roci != null ? `${l._roci}%` : '—'}</div>
                    <div className="metric__sub">return on cash invested</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Cap Gain 5yr</div>
                    <div className="metric__value" style={{ fontSize: 14, color: 'var(--green)' }}>{l._fiveYrCapGain ? `$${Math.round(l._fiveYrCapGain/1000)}k` : '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Growth (adj)</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._adjustedGrowth >= 30 ? 'var(--green)' : l._adjustedGrowth >= 20 ? 'var(--amber)' : 'var(--red)' }}>+{Math.round(l._adjustedGrowth || 0)}%</div>
                    <div className="metric__sub">was {Math.round(l._baseGrowth || 0)}%</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Upfront Cash</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._cashFits ? 'var(--green)' : l._cashStretch ? 'var(--amber)' : 'var(--red)' }}>{l._totalCost ? `$${Math.round(l._totalCost/1000)}k` : '—'}</div>
                    <div className="metric__sub">{l._cashFits ? '✓ under $110k' : l._cashStretch ? '△ stretch $135k' : '✗ over $135k'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Hold Cost</div>
                    <div className="metric__value" style={{ fontSize: 14 }}>{l._monthlyHold != null ? `$${l._monthlyHold}/mo` : '—'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Supply Risk</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._supplyRisk === 'LOW' ? 'var(--green)' : l._supplyRisk === 'HIGH' ? 'var(--red)' : 'var(--amber)' }}>{l._supplyRisk || '?'}</div>
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
