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
      const crimeData = subData?.qual?.crime || {};

      // ═══ CRIME REALITY CHECK ═══
      // Based on aucrimerate.com rankings (1-100 scale, lower = worse):
      // Armadale 97/100 = 97% of AU suburbs are safer, 175% higher violent crime vs WA avg
      const CRIME_OVERRIDES = {
        'armadale': 'SEVERE',        // 97/100 AU - worst case
        'gosnells': 'HIGH',
        'maddington': 'HIGH',
        'kelmscott': 'MEDIUM-HIGH',
        'seville grove': 'MEDIUM-HIGH',
        'salisbury downs': 'SEVERE', // 13,323/100k incidents
        'davoren park': 'SEVERE',
        'smithfield': 'HIGH',
        'paralowie': 'MEDIUM',
        'kirwan': 'MEDIUM',
        'condon': 'MEDIUM',
        'aitkenvale': 'MEDIUM',
        'noble park': 'MEDIUM',
        'dandenong': 'MEDIUM-HIGH',
        'baldivis': 'LOW',
        'wellard': 'LOW',
        'mandurah': 'LOW',
        'thornlie': 'LOW-MEDIUM',
        'para hills': 'MEDIUM',
        'salisbury north': 'MEDIUM-HIGH'
      };
      const crimeLevel = CRIME_OVERRIDES[subName] || crimeData.overallRating?.toUpperCase() || 'UNKNOWN';

      // Forward growth
      const baseGrowth = fwd.bear != null ? ((fwd.bear + fwd.base * 2 + fwd.bull) / 4) : 20;
      const supplyRisk = risk.supplyRisk?.rating || '';
      const cycleRisk = risk.cycleRisk?.rating || '';
      let adjustedGrowth = baseGrowth;
      if (supplyRisk === 'HIGH') adjustedGrowth *= 0.6;
      else if (supplyRisk === 'MEDIUM') adjustedGrowth *= 0.85;
      if (cycleRisk === 'HIGH') adjustedGrowth *= 0.8;
      else if (cycleRisk === 'MEDIUM') adjustedGrowth *= 0.92;

      // Crime discount on growth (rougher areas attract less premium buyers, capping growth)
      if (crimeLevel === 'SEVERE') adjustedGrowth *= 0.5;     // effectively removes from top 10
      else if (crimeLevel === 'HIGH') adjustedGrowth *= 0.75;
      else if (crimeLevel === 'MEDIUM-HIGH') adjustedGrowth *= 0.88;

      if (supplyRisk === 'LOW') reasons.push('LOW supply risk');
      else if (supplyRisk === 'HIGH') warnings.push(`Growth capped by HIGH supply risk`);
      else if (supplyRisk === 'MEDIUM') warnings.push('Growth capped by MEDIUM supply risk');

      if (crimeLevel === 'SEVERE') warnings.push('SEVERE crime (97/100 AU) — buyer pool small, growth capped');
      else if (crimeLevel === 'HIGH') warnings.push('HIGH crime area');
      else if (crimeLevel === 'MEDIUM-HIGH') warnings.push('Above-avg crime');
      else if (crimeLevel === 'LOW') reasons.push('LOW crime');

      // ═══ SUBDIVISION ECONOMICS ═══
      // Real subdivision profit: (lot value × 2) - (purchase price + subdiv costs + keeping one house)
      // Only profitable if resulting lots sell for enough premium
      const va = (l.valueAdd || '').toLowerCase();
      const landMatch = (l.land || '').match(/(\d+)/);
      const landSqm = landMatch ? parseInt(landMatch[1]) : 0;
      const hasSubdivZoning = va.includes('r40') || va.includes('r30') || va.includes('r60') || va.includes('subdivision') || va.includes('subdivide');

      // Estimated lot values by suburb tier
      const LOT_VALUES = {
        'baldivis': 320000, 'wellard': 290000, 'mandurah': 250000,
        'armadale': 260000, 'gosnells': 270000, 'maddington': 280000,
        'kelmscott': 270000, 'seville grove': 255000, 'thornlie': 320000,
        'kirwan': 180000, 'condon': 170000, 'aitkenvale': 220000,
        'para hills': 240000, 'salisbury north': 200000, 'gawler': 230000,
        'noble park': 380000, 'cranbourne west': 310000
      };
      const estLotValue = LOT_VALUES[subName] || 250000;
      const subdivCosts = 90000; // typical PERTH subdivision soft costs

      let subdivProfit = null;
      let subdivViable = false;
      if (hasSubdivZoning && landSqm >= 700 && price > 0) {
        // Scenario: keep existing house on one lot, sell rear lot
        // Revenue: 1 lot sale = $estLotValue
        // Existing house kept (not sold) = still owns but reduced land
        // Net profit = lot value - (subdiv costs + lost amenity of original block)
        subdivProfit = estLotValue - subdivCosts;
        subdivViable = subdivProfit > 50000; // needs at least $50k profit to bother
      }

      if (hasSubdivZoning) {
        if (subdivViable) reasons.push(`Subdivision ~$${Math.round(subdivProfit/1000)}k profit potential`);
        else if (landSqm >= 700) warnings.push(`Subdivision zoning but poor economics here (~$${Math.round((subdivProfit||-subdivCosts)/1000)}k)`);
        else warnings.push('Subdivision zoning but block too small');
      }

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

        const yMatch = (l.yieldEst || '').match(/([\d.]+)/);
        const yieldPct = yMatch ? parseFloat(yMatch[1]) : 4.5;
        const annualRent = price * yieldPct / 100;
        const weeklyRent = annualRent / 52;
        const weeklyMortgage = loan * INVESTOR.interestRate / 52;
        const weeklyMgmt = weeklyRent * INVESTOR.managementPct;
        const weeklyInsRates = (INVESTOR.insuranceYr + INVESTOR.ratesYr) / 52;
        weeklyCashflow = weeklyRent - weeklyMortgage - weeklyMgmt - weeklyInsRates;
        monthlyHoldCost = Math.round(-weeklyCashflow * 4.33);

        const growthRate = adjustedGrowth / 100;
        const futureValue = price * (1 + growthRate);
        fiveYrEquity = Math.round(futureValue - loan);
        fiveYrCapGain = Math.round(futureValue - price);

        const fiveYrNegCashflow = Math.max(0, -weeklyCashflow) * 52 * 5;
        fiveYrTotalCashOut = Math.round(totalCost + fiveYrNegCashflow);

        // Include subdivision profit if viable
        const totalGain = fiveYrCapGain + (subdivViable ? subdivProfit : 0);

        if (fiveYrTotalCashOut > 0) {
          roci = Math.round(totalGain / fiveYrTotalCashOut * 100);
        }
      }

      let score = roci || 0;
      if (supplyRisk === 'LOW') score += 15;
      if (crimeLevel === 'LOW') score += 10;
      if (crimeLevel === 'HIGH') score -= 20;
      if (compositeScore >= 85) score += 15;
      else if (compositeScore >= 75) score += 8;
      if (cashFits) score += 10;
      else if (!cashStretchFits) score -= 40;
      if (landSqm >= 800 && supplyRisk !== 'HIGH') { score += 5; reasons.push(`${landSqm}sqm block`); }

      if (roci >= 150) reasons.push(`ROCI ${roci}% (excellent)`);
      else if (roci >= 100) reasons.push(`ROCI ${roci}%`);
      else if (roci != null && roci < 50) warnings.push(`Low ROCI ${roci}%`);

      if (!cashFits && cashStretchFits) warnings.push(`Stretch $${Math.round(totalCost/1000)}k cash`);
      else if (!cashStretchFits && totalCost) warnings.push(`Over cash budget $${Math.round(totalCost/1000)}k`);
      if (adjustedGrowth < baseGrowth * 0.95) {
        reasons.push(`Growth adjusted ${Math.round(baseGrowth)}%→${Math.round(adjustedGrowth)}%`);
      }

      // ═══ DECISION ENGINE ═══
      // The system drives the decision. User just calls / inspects / offers.
      let decision = 'SKIP';
      let decisionReason = '';
      const isClean = !l.photoVerdict || l.photoVerdict === 'BEST' || l.photoVerdict === 'STRONG' || l.photoVerdict === 'PASS';
      const isPhotoFlagged = l.photoVerdict === 'CAUTION';

      if (crimeLevel === 'SEVERE') {
        decision = 'SKIP';
        decisionReason = 'Crime too severe — growth capped, small buyer pool';
      } else if (!cashStretchFits && totalCost) {
        decision = 'SKIP';
        decisionReason = `$${Math.round(totalCost/1000)}k total exceeds $135k max`;
      } else if (isPhotoFlagged) {
        decision = 'SKIP';
        decisionReason = 'Photo inspection flagged concerns';
      } else if (roci && roci >= 150 && isClean && (cashFits || cashStretchFits)) {
        decision = 'CALL AGENT';
        decisionReason = `ROCI ${roci}% + clean photos + cash fits. Top priority.`;
      } else if (roci && roci >= 100 && isClean && cashStretchFits) {
        decision = 'CALL AGENT';
        decisionReason = `ROCI ${roci}% — strong return, pick up phone today`;
      } else if (roci && roci >= 60 && isClean && cashStretchFits) {
        decision = 'INSPECT';
        decisionReason = `ROCI ${roci}% — worth a physical inspection`;
      } else if (l.photoVerdict === 'BEST' && cashStretchFits) {
        decision = 'INSPECT';
        decisionReason = `Move-in ready + cash fits — viable even at moderate ROCI`;
      } else if (cashStretchFits) {
        decision = 'MONITOR';
        decisionReason = 'Track for price drop or longer DOM';
      } else {
        decision = 'SKIP';
        decisionReason = 'Below investment thresholds';
      }

      return { ...l, _score: score, _reasons: reasons, _warnings: warnings,
               _totalCost: totalCost, _monthlyHold: monthlyHoldCost,
               _fiveYrEquity: fiveYrEquity, _cashFits: cashFits, _cashStretch: cashStretchFits,
               _baseGrowth: baseGrowth, _adjustedGrowth: adjustedGrowth,
               _compositeScore: compositeScore, _supplyRisk: supplyRisk,
               _roci: roci, _fiveYrCapGain: fiveYrCapGain,
               _fiveYrCashOut: fiveYrTotalCashOut, _weeklyCashflow: weeklyCashflow,
               _crimeLevel: crimeLevel, _subdivProfit: subdivProfit,
               _subdivViable: subdivViable, _hasSubdivZoning: hasSubdivZoning,
               _decision: decision, _decisionReason: decisionReason };
    });

    // Filter OUT SKIP — only show actionable picks
    const actionable = scored.filter(l => l._decision !== 'SKIP');

    // Sort by decision priority then score:
    //   CALL AGENT first, then INSPECT, then MONITOR
    const priorityRank = { 'CALL AGENT': 0, 'INSPECT': 1, 'MONITOR': 2 };
    actionable.sort((a, b) => {
      const pa = priorityRank[a._decision] ?? 99;
      const pb = priorityRank[b._decision] ?? 99;
      if (pa !== pb) return pa - pb;
      return b._score - a._score;
    });

    // Diversification: max 7 WA, cap at 10 total
    const picked = [];
    const stateCount = {};
    for (const item of actionable) {
      const s = item._state || '?';
      if (picked.length >= 10) break;
      if (s === 'WA' && (stateCount.WA || 0) >= 7) continue;
      picked.push(item);
      stateCount[s] = (stateCount[s] || 0) + 1;
    }
    if (picked.length < 10) {
      for (const item of actionable) {
        if (picked.length >= 10) break;
        if (!picked.includes(item)) picked.push(item);
      }
    }

    // Also count SKIPs so we can show "filtered out" stat
    const skipCount = scored.length - actionable.length;
    picked._skipCount = skipCount;
    picked._totalCount = scored.length;

    return picked;
  }, [listings, suburbLookup]);

  const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : '—';

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">🏆 Worth Your Time</h2>
          <p className="stage-shell__desc">Only listings the system recommends action on. SKIPs filtered out — don't waste time on them.</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={load}>Reload</button>
      </div>

      <ErrorBoundary label="Top10">
        {err && <div className="error-display"><div className="error-display__title">No data</div><div className="error-display__message">{err}</div></div>}

        {top10.length > 0 && (
          <>
            <div className="info-box info-box--blue mb-16" style={{ fontSize: 11, lineHeight: 1.7 }}>
              <strong>Decisions pre-made.</strong> {top10._skipCount ?? 0} candidates auto-SKIPPED (severe crime, over cash, photo flagged). Showing {top10.length} worth your time. Your only actions: 📞 CALL · 🔍 INSPECT · 👁 MONITOR. Pipeline: macro → region → suburb DSR + supply risk → listing scout → quality check → photo inspector → ROCI-based decision.
            </div>

            {/* Summary chips */}
            <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
              {Object.entries(top10.reduce((a, l) => { a[l._state || '?'] = (a[l._state || '?'] || 0) + 1; return a; }, {})).map(([s, n]) => (
                <div key={s} className="header__chip"><b>{s}</b>: {n}</div>
              ))}
              <div className="header__chip" style={{ borderColor: 'var(--green)' }}>
                📞 {top10.filter(l => l._decision === 'CALL AGENT').length}
              </div>
              <div className="header__chip" style={{ borderColor: 'var(--amber)' }}>
                🔍 {top10.filter(l => l._decision === 'INSPECT').length}
              </div>
              <div className="header__chip">
                👁 {top10.filter(l => l._decision === 'MONITOR').length}
              </div>
              {top10.length > 0 && (
                <div className="header__chip" style={{ borderColor: 'var(--blue)' }}>
                  avg ROCI: {Math.round(top10.reduce((a,l)=>a+(l._roci||0),0)/top10.length)}%
                </div>
              )}
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
                  <div className="metric">
                    <div className="metric__label">Crime</div>
                    <div className="metric__value" style={{ fontSize: 14, color: (l._crimeLevel === 'SEVERE' || l._crimeLevel === 'HIGH') ? 'var(--red)' : (l._crimeLevel||'').includes('MEDIUM') ? 'var(--amber)' : 'var(--green)' }}>{l._crimeLevel || '?'}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Subdiv Profit</div>
                    <div className="metric__value" style={{ fontSize: 14, color: l._subdivViable ? 'var(--green)' : l._hasSubdivZoning ? 'var(--red)' : 'var(--text-muted)' }}>{l._subdivProfit != null ? `$${Math.round(l._subdivProfit/1000)}k` : '—'}</div>
                    <div className="metric__sub">{l._subdivViable ? '✓ viable' : l._hasSubdivZoning ? '✗ weak math' : 'N/A'}</div>
                  </div>
                </div>

                {/* Reasons + warnings */}
                <div className="listing-card__body" style={{ paddingLeft: 28 }}>
                  {/* Photo inspection + reno estimate */}
                  {(l.photoVerdict || l.renoEst) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {l.photoVerdict && (
                        <span className="verdict" style={{
                          background: l.photoVerdict === 'BEST' ? 'var(--green-dim)' : l.photoVerdict === 'STRONG' ? 'var(--green-dim)' : l.photoVerdict === 'CAUTION' ? 'var(--amber-dim)' : 'var(--blue-dim)',
                          color: l.photoVerdict === 'BEST' || l.photoVerdict === 'STRONG' ? 'var(--green)' : l.photoVerdict === 'CAUTION' ? 'var(--amber)' : 'var(--blue)',
                          border: `1px solid ${l.photoVerdict === 'CAUTION' ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)'}`
                        }}>Photo: {l.photoVerdict}</span>
                      )}
                      {l.renoEst && l.renoEst !== '$0' && (
                        <span className="verdict" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)' }}>
                          Reno: {l.renoEst}
                        </span>
                      )}
                      {l.renoEst === '$0' && (
                        <span className="verdict" style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                          No reno needed
                        </span>
                      )}
                      {l.photoNotes && <span className="text-xs text-muted">{l.photoNotes}</span>}
                    </div>
                  )}
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

                {/* ─── DECISION ─── */}
                <div style={{ padding: '12px 16px 12px 28px', borderTop: '2px solid',
                              borderColor: l._decision === 'CALL AGENT' ? 'var(--green)' : l._decision === 'INSPECT' ? 'var(--amber)' : l._decision === 'SKIP' ? 'var(--red)' : 'var(--text-muted)',
                              background: l._decision === 'CALL AGENT' ? 'var(--green-dim)' : l._decision === 'INSPECT' ? 'var(--amber-dim)' : l._decision === 'SKIP' ? 'var(--red-dim)' : 'transparent',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.03em',
                                  color: l._decision === 'CALL AGENT' ? 'var(--green)' : l._decision === 'INSPECT' ? 'var(--amber)' : l._decision === 'SKIP' ? 'var(--red)' : 'var(--text-heading)' }}>
                      {l._decision === 'CALL AGENT' ? '📞 CALL AGENT' :
                       l._decision === 'INSPECT' ? '🔍 INSPECT' :
                       l._decision === 'SKIP' ? '✗ SKIP' :
                       '👁 MONITOR'}
                    </div>
                    <div className="text-xs text-muted mt-4">{l._decisionReason}</div>
                  </div>
                  {l.url && (
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                       className={`btn btn--sm ${l._decision === 'CALL AGENT' ? 'btn--primary' : 'btn--secondary'}`}>
                      {l._decision === 'SKIP' ? 'View anyway' : 'Open listing'}
                    </a>
                  )}
                </div>
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
