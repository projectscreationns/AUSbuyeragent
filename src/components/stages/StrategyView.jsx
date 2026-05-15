import { useMemo, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════
// INVESTOR PROFILE — YOUR SPECIFIC SITUATION
// ═══════════════════════════════════════════════════════════════════════
const INVESTOR = {
  budget: 800000,
  cashTarget: 110000,
  cashMax: 135000,
  depositPct: 0.10,
  lmiPct: 0.02,
  legalBP: 5000,
  investorRate: 0.0642,
  managementPct: 0.08,
  insuranceYr: 1800,
  ratesYr: 2200,
  marginalTaxRate: 0.37,
  existingQld: true,
  existingQldLandValue: 350000,
};

const STAMP_DUTY = {
  WA: (p) => p <= 500000 ? p * 0.04 : 20000 + (p - 500000) * 0.055,
  SA: (p) => p * 0.045 + 1000,
  QLD: (p) => p <= 540000 ? p * 0.035 : 18900 + (p - 540000) * 0.045,
  VIC: (p) => p * 0.055 + p * 0.015,
};

// ═══════════════════════════════════════════════════════════════════════
// FIVE INVESTMENT PATHS
// ═══════════════════════════════════════════════════════════════════════
const PATHS = [
  {
    id: 'A', label: 'Adelaide Established', subtitle: 'AUKUS Catchment — Para Hills / Ingle Farm',
    state: 'SA', isNewBuild: false,
    price: 620000, priceRange: '$550k – $700k',
    weeklyRent: 500, grossYield: 4.2,
    growth: { bear: 15, base: 28, bull: 42 },
    extraCostsYr: 0,
    risks: {
      concentration: { score: 1, label: 'LOW', note: 'New state — full diversification' },
      macro: { score: 2, label: 'MEDIUM', note: 'Rate sensitive like all leveraged plays' },
      structural: { score: 1, label: 'LOW', note: 'AUKUS Osborne 5,500 jobs, 30yr program' },
      supply: { score: 1, label: 'LOW', note: 'Established suburb, land-constrained' },
      liquidity: { score: 1, label: 'LOW', note: 'Adelaide tight market, 0.5% vacancy' },
      policy: { score: 2, label: 'MEDIUM', note: 'NG quarantined — losses carried forward only' },
      climate: { score: 1, label: 'LOW', note: 'No cyclone/flood exposure' },
    },
    drivers: ['AUKUS Osborne $368B / 5,500 jobs', 'RAAF Edinburgh P-8 base', 'N-S Corridor completion 2031', '0.5% vacancy = tightest in AU', 'Adelaide +12.2% annual growth'],
    warnings: ['NG quarantined (new rules)', 'Crime pockets in Salisbury Downs/Davoren Park — avoid', 'SA economy narrow base outside defence'],
    color: '#22c55e',
  },
  {
    id: 'B', label: 'Perth South Established', subtitle: 'HMAS Stirling — Wellard / Baldivis',
    state: 'WA', isNewBuild: false,
    price: 720000, priceRange: '$690k – $750k',
    weeklyRent: 600, grossYield: 4.3,
    growth: { bear: 10, base: 22, bull: 38 },
    extraCostsYr: 0,
    risks: {
      concentration: { score: 1, label: 'LOW', note: 'New state — diversification' },
      macro: { score: 2, label: 'MEDIUM', note: 'Rate sensitive' },
      structural: { score: 1, label: 'LOW', note: 'HMAS Stirling $8B + Henderson 3,000 jobs' },
      supply: { score: 2, label: 'MEDIUM', note: 'Baldivis has new estate supply' },
      liquidity: { score: 1, label: 'LOW', note: 'Deep market, 0.6% vacancy' },
      policy: { score: 2, label: 'MEDIUM', note: 'NG quarantined' },
      climate: { score: 1, label: 'LOW', note: 'No cyclone exposure' },
    },
    drivers: ['HMAS Stirling AUKUS submarine base', 'Henderson shipyard 3,000 jobs', 'Perth +26% annual (strongest AU)', 'Population growth #1 state', 'METRONET rail expansion'],
    warnings: ['NG quarantined (new rules)', 'Late cycle — Perth already run hard (+26%)', 'Higher entry = more cash needed ($~98k upfront)', 'Baldivis outer estate supply pipeline'],
    color: '#3b82f6',
  },
  {
    id: 'C', label: 'Townsville Established', subtitle: 'Cash Flow Positive — Kirwan / Condon',
    state: 'QLD', isNewBuild: false,
    price: 550000, priceRange: '$480k – $600k',
    weeklyRent: 500, grossYield: 4.7,
    growth: { bear: 8, base: 20, bull: 35 },
    extraCostsYr: 1000,
    risks: {
      concentration: { score: 3, label: 'HIGH', note: '2nd QLD property — portfolio concentrated' },
      macro: { score: 1, label: 'LOW', note: 'Cash flow positive = rate resistant' },
      structural: { score: 1, label: 'LOW', note: 'Lavarack Army + CopperString + RAAF' },
      supply: { score: 1, label: 'LOW', note: 'Established suburb, limited new builds' },
      liquidity: { score: 2, label: 'MEDIUM', note: 'Smaller market — slower to exit' },
      policy: { score: 1, label: 'LOW', note: 'Cash flow positive = NG irrelevant' },
      climate: { score: 3, label: 'HIGH', note: 'Cyclone zone — insurance +$2k/yr and rising 20-30%/yr' },
    },
    drivers: ['Cash flow positive from day 1', 'Lavarack Barracks 10k defence personnel', 'CopperString $5B + critical minerals', 'Propertyology #1 growth pick', 'Lowest entry price of all paths'],
    warnings: ['QLD CONCENTRATION: already own Murrumba Downs', 'QLD land tax ~$500-1,500/yr on 2nd property', 'Cyclone insurance premiums rising 20-30%/yr', 'Smaller market — harder to sell', 'Must clearly outperform to justify concentration'],
    color: '#f59e0b',
  },
  {
    id: 'D', label: 'New Build H&L', subtitle: 'Keeps Full NG — Wellard WA / Munno Para SA',
    state: 'WA', isNewBuild: true,
    price: 690000, priceRange: '$620k – $750k',
    weeklyRent: 560, grossYield: 4.2,
    growth: { bear: 5, base: 15, bull: 28 },
    extraCostsYr: 0,
    depreciationYr: 12000,
    risks: {
      concentration: { score: 1, label: 'LOW', note: 'WA or SA = diversification' },
      macro: { score: 2, label: 'MEDIUM', note: 'Rate sensitive but NG offsets' },
      structural: { score: 2, label: 'MEDIUM', note: 'Location dependent — no specific anchor' },
      supply: { score: 3, label: 'HIGH', note: 'New estates = hundreds of identical homes' },
      liquidity: { score: 2, label: 'MEDIUM', note: 'Cookie-cutter = slower premium resale' },
      policy: { score: 1, label: 'LOW', note: 'Govt structurally favours new builds' },
      climate: { score: 1, label: 'LOW', note: 'Depends on location' },
    },
    drivers: ['FULL negative gearing preserved', 'CGT 50% discount CHOICE preserved', 'Depreciation ~$12k/yr tax deduction', 'Brand new = no maintenance 5yrs', 'Govt favours new builds in all policy'],
    warnings: ['Supply risk — 100s of identical homes in estate', 'Build risk: delays, defects, builder insolvency', 'Growth typically lags established (pay premium at purchase)', 'No location-specific defence anchor', 'Land value may be 40-50% of package = less growth leverage'],
    color: '#8b5cf6',
  },
  {
    id: 'E', label: 'Wait 12 Months', subtitle: 'Park cash, reassess Q2 2027',
    state: null, isNewBuild: false,
    price: 0, priceRange: 'N/A',
    weeklyRent: 0, grossYield: 0,
    growth: { bear: 0, base: 0, bull: 0 },
    extraCostsYr: 0,
    risks: {
      concentration: { score: 0, label: 'N/A', note: 'No purchase' },
      macro: { score: 0, label: 'N/A', note: 'Cash is king in rate-hike environment' },
      structural: { score: 0, label: 'N/A', note: '' },
      supply: { score: 0, label: 'N/A', note: '' },
      liquidity: { score: 0, label: 'N/A', note: 'Cash is perfectly liquid' },
      policy: { score: 0, label: 'N/A', note: 'More clarity in 12 months' },
      climate: { score: 0, label: 'N/A', note: '' },
    },
    drivers: ['$110k earns ~$5k in HYSA at 4.5%', 'Market adjusts to NG/CGT changes — potential softening', 'More clarity on rate path + policy', 'No commitment risk'],
    warnings: ['Perth +26%/yr — window closes every month', 'Opportunity cost: 12mo no leverage on growth', 'Rents rising 9% = costs of waiting', 'Everyone else also waiting = crowded re-entry'],
    color: '#64748b',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// FINANCIAL MODEL
// ═══════════════════════════════════════════════════════════════════════
function modelPath(path) {
  if (!path.price) return {
    isWait: true,
    hysaReturn: Math.round(INVESTOR.cashTarget * 0.045),
    opportunityCost: null,
  };

  const price = path.price;
  const deposit = price * INVESTOR.depositPct;
  const loan = price - deposit;
  const lmi = loan * INVESTOR.lmiPct;
  const stampFn = STAMP_DUTY[path.state] || STAMP_DUTY.WA;
  const stamp = Math.round(stampFn(price));
  const totalUpfront = Math.round(deposit + stamp + lmi + INVESTOR.legalBP);
  const cashFitsTarget = totalUpfront <= INVESTOR.cashTarget;
  const cashFitsStretch = totalUpfront <= INVESTOR.cashMax;

  const weeklyRent = path.weeklyRent;
  const weeklyMortgage = loan * INVESTOR.investorRate / 52;
  const weeklyMgmt = weeklyRent * INVESTOR.managementPct;
  const weeklyInsRates = (INVESTOR.insuranceYr + INVESTOR.ratesYr) / 52;
  const weeklyCashflow = weeklyRent - weeklyMortgage - weeklyMgmt - weeklyInsRates;
  const annualCashflow = weeklyCashflow * 52;
  const annualExtraCosts = path.extraCostsYr || 0;

  // Tax under OLD rules (pre-12 May 2026)
  const annualLoss = Math.min(0, annualCashflow - annualExtraCosts);
  const oldNgBenefit = Math.round(Math.abs(annualLoss) * INVESTOR.marginalTaxRate);
  const oldAfterTaxAnnual = Math.round(annualCashflow - annualExtraCosts + oldNgBenefit);

  // Tax under NEW rules
  let newNgBenefit = 0;
  let depreciationBenefit = 0;
  if (path.isNewBuild) {
    newNgBenefit = oldNgBenefit;
    depreciationBenefit = Math.round((path.depreciationYr || 0) * INVESTOR.marginalTaxRate);
  }
  const newAfterTaxAnnual = Math.round(annualCashflow - annualExtraCosts + newNgBenefit + depreciationBenefit);
  const ngPenaltyYr = oldNgBenefit - newNgBenefit;

  // QLD land tax
  let qldLandTax = 0;
  if (path.state === 'QLD' && INVESTOR.existingQld) {
    const newLandValue = price * 0.6;
    const totalLand = INVESTOR.existingQldLandValue + newLandValue;
    if (totalLand > 600000) {
      qldLandTax = Math.round((totalLand - 600000) * 0.017);
    }
  }

  // 5yr scenarios
  const scenarios = {};
  for (const [key, growthPct] of Object.entries(path.growth)) {
    const growthRate = growthPct / 100;
    const futureValue = Math.round(price * (1 + growthRate));
    const capGain = futureValue - price;

    // CGT old rules: 50% discount
    const cgtOld = Math.round(capGain * 0.5 * INVESTOR.marginalTaxRate);
    // CGT new rules: min 30% on indexed gain (3% CPI p.a. over 5yr)
    const indexedCostBase = Math.round(price * Math.pow(1.03, 5));
    const indexedGain = Math.max(0, futureValue - indexedCostBase);
    const cgtNewCalc = Math.round(Math.max(indexedGain * INVESTOR.marginalTaxRate, capGain * 0.30));
    const cgtNew = path.isNewBuild ? Math.min(cgtOld, cgtNewCalc) : cgtNewCalc;

    const netGainOld = capGain - cgtOld;
    const netGainNew = capGain - cgtNew;

    // Total cash invested over 5yr (old rules)
    const fiveYrNegOld = Math.max(0, -oldAfterTaxAnnual) * 5;
    const totalCashOld = totalUpfront + fiveYrNegOld + (qldLandTax * 5);
    const rociOld = totalCashOld > 0 ? Math.round(netGainOld / totalCashOld * 100) : 0;

    // Total cash invested over 5yr (new rules)
    const fiveYrNegNew = Math.max(0, -newAfterTaxAnnual) * 5;
    const totalCashNew = totalUpfront + fiveYrNegNew + (qldLandTax * 5);
    const rociNew = totalCashNew > 0 ? Math.round(netGainNew / totalCashNew * 100) : 0;

    scenarios[key] = {
      growthPct, futureValue, capGain,
      cgtOld, cgtNew, netGainOld, netGainNew,
      totalCashOld, totalCashNew, rociOld, rociNew,
    };
  }

  // Risk composite
  const riskTotal = Object.values(path.risks).reduce((s, r) => s + r.score, 0);
  const riskMax = Object.keys(path.risks).length * 3;
  const riskPct = Math.round(riskTotal / riskMax * 100);

  return {
    isWait: false,
    deposit: Math.round(deposit), loan, lmi: Math.round(lmi), stamp, totalUpfront,
    cashFitsTarget, cashFitsStretch,
    weeklyRent, weeklyMortgage: Math.round(weeklyMortgage),
    weeklyMgmt: Math.round(weeklyMgmt), weeklyInsRates: Math.round(weeklyInsRates),
    weeklyCashflow: Math.round(weeklyCashflow),
    annualCashflow: Math.round(annualCashflow),
    oldNgBenefit, oldAfterTaxAnnual,
    newNgBenefit, depreciationBenefit, newAfterTaxAnnual,
    ngPenaltyYr,
    qldLandTax,
    scenarios,
    riskPct,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

const fmt = (n) => n != null ? `$${Math.abs(n).toLocaleString()}` : '—';
const fmtK = (n) => n != null ? `$${Math.round(n / 1000)}k` : '—';
const riskColor = (label) => label === 'LOW' ? 'var(--green)' : label === 'MEDIUM' ? 'var(--amber)' : label === 'HIGH' ? 'var(--red)' : 'var(--text-muted)';

function PolicyBanner() {
  return (
    <div className="info-box info-box--red mb-16" style={{ lineHeight: 1.8 }}>
      <strong>🚨 REGIME CHANGE — 12 May 2026 Federal Budget</strong><br/>
      Negative gearing <b>REMOVED</b> for established properties acquired after 7:30pm 12 May 2026. CGT 50% discount <b>REMOVED</b> from 1 July 2027.<br/>
      <b>New builds exempt from both changes.</b> Your existing Murrumba Downs QLD is <b>fully grandfathered</b>.
    </div>
  );
}

function PathCard({ path, model, rank, isRecommended }) {
  const [expanded, setExpanded] = useState(false);
  if (model.isWait) {
    return (
      <div className="card" style={{ borderLeft: `4px solid ${path.color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: path.color, color: '#000', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)' }}>{path.id}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{path.label}</span>
            </div>
            <div className="text-xs text-muted mt-4">{path.subtitle}</div>
          </div>
        </div>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="metric"><div className="metric__label">HYSA Return (12mo)</div><div className="metric__value" style={{ color: 'var(--green)' }}>+{fmt(model.hysaReturn)}</div></div>
          <div className="metric"><div className="metric__label">Property Growth Missed</div><div className="metric__value" style={{ color: 'var(--red)' }}>$?</div><div className="metric__sub">Perth +26%/yr</div></div>
        </div>
        <div style={{ marginTop: 10 }}>
          {path.drivers.map((d, i) => <div key={i} className="text-xs" style={{ color: 'var(--green)', marginBottom: 2 }}>✓ {d}</div>)}
          {path.warnings.map((w, i) => <div key={i} className="text-xs" style={{ color: 'var(--red)', marginBottom: 2 }}>⚠ {w}</div>)}
        </div>
      </div>
    );
  }

  const base = model.scenarios.base;
  return (
    <div className="card" style={{ borderLeft: `4px solid ${path.color}`, position: 'relative', border: isRecommended ? `2px solid var(--green)` : undefined }}>
      {isRecommended && <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--green)', color: '#000', padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>RECOMMENDED</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: path.color, color: '#000', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)' }}>{path.id}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>{path.label}</span>
            <span className="header__chip"><b>{path.state}</b></span>
            {path.isNewBuild && <span className="verdict" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,.3)' }}>NEW BUILD</span>}
          </div>
          <div className="text-xs text-muted mt-4">{path.subtitle}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 300, fontFamily: 'var(--font-mono)', color: 'var(--text-heading)' }}>{fmtK(path.price)}</div>
          <div className="text-xs text-muted">{path.priceRange}</div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', marginBottom: 10 }}>
        <div className="metric">
          <div className="metric__label">Upfront Cash</div>
          <div className="metric__value" style={{ fontSize: 16, color: model.cashFitsTarget ? 'var(--green)' : model.cashFitsStretch ? 'var(--amber)' : 'var(--red)' }}>{fmtK(model.totalUpfront)}</div>
          <div className="metric__sub">{model.cashFitsTarget ? '✓ under $110k' : model.cashFitsStretch ? '△ stretch $135k' : '✗ over $135k'}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Weekly Cashflow</div>
          <div className="metric__value" style={{ fontSize: 16, color: model.weeklyCashflow >= 0 ? 'var(--green)' : 'var(--red)' }}>{model.weeklyCashflow >= 0 ? '+' : '-'}{fmt(Math.abs(model.weeklyCashflow))}/w</div>
          <div className="metric__sub">{model.weeklyCashflow >= 0 ? 'Cash flow positive' : `${fmt(Math.abs(model.weeklyCashflow * 52))}/yr out of pocket`}</div>
        </div>
        <div className="metric">
          <div className="metric__label">NG Penalty/yr</div>
          <div className="metric__value" style={{ fontSize: 16, color: model.ngPenaltyYr > 0 ? 'var(--red)' : 'var(--green)' }}>{model.ngPenaltyYr > 0 ? `-${fmt(model.ngPenaltyYr)}` : fmt(0)}</div>
          <div className="metric__sub">{path.isNewBuild ? 'NG preserved + depreciation' : model.ngPenaltyYr > 0 ? 'Lost vs old rules' : 'Cash flow positive = irrelevant'}</div>
        </div>
        <div className="metric" style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)' }}>
          <div className="metric__label">ROCI 5yr (NEW RULES)</div>
          <div className="metric__value" style={{ fontSize: 18, color: base.rociNew >= 100 ? 'var(--green)' : base.rociNew >= 60 ? 'var(--amber)' : 'var(--red)' }}>{base.rociNew}%</div>
          <div className="metric__sub">Return on cash invested (base case)</div>
        </div>
        <div className="metric">
          <div className="metric__label">Risk Score</div>
          <div className="metric__value" style={{ fontSize: 16, color: model.riskPct <= 30 ? 'var(--green)' : model.riskPct <= 50 ? 'var(--amber)' : 'var(--red)' }}>{model.riskPct}%</div>
          <div className="metric__sub">{model.riskPct <= 30 ? 'Low risk' : model.riskPct <= 50 ? 'Moderate risk' : 'Higher risk'}</div>
        </div>
      </div>

      {/* Growth scenarios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {['bear', 'base', 'bull'].map(s => {
          const sc = model.scenarios[s];
          return (
            <div key={s} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '8px 10px', textAlign: 'center' }}>
              <div className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>{s}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: sc.rociNew >= 100 ? 'var(--green)' : sc.rociNew >= 50 ? 'var(--amber)' : 'var(--red)' }}>{sc.rociNew}%</div>
              <div className="text-xs text-muted">+{fmtK(sc.capGain)} gain</div>
            </div>
          );
        })}
      </div>

      {/* QLD land tax warning */}
      {model.qldLandTax > 0 && (
        <div className="info-box info-box--amber mb-8" style={{ fontSize: 10 }}>
          <strong>⚠ QLD Land Tax:</strong> ${model.qldLandTax.toLocaleString()}/yr (2nd QLD property — aggregated with Murrumba Downs)
        </div>
      )}

      {/* Expand for details */}
      <div style={{ cursor: 'pointer', padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: 6, textAlign: 'center' }} onClick={() => setExpanded(!expanded)}>
        <span className="text-xs text-muted">{expanded ? '▲ Less detail' : '▼ More detail'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {/* Cost breakdown */}
          <div className="section-label">Cost Breakdown</div>
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', marginBottom: 12 }}>
            <div className="metric"><div className="metric__label">Deposit (10%)</div><div className="metric__value" style={{ fontSize: 13 }}>{fmtK(model.deposit)}</div></div>
            <div className="metric"><div className="metric__label">Stamp Duty</div><div className="metric__value" style={{ fontSize: 13 }}>{fmtK(model.stamp)}</div></div>
            <div className="metric"><div className="metric__label">LMI</div><div className="metric__value" style={{ fontSize: 13 }}>{fmtK(model.lmi)}</div></div>
            <div className="metric"><div className="metric__label">Legal/B&P</div><div className="metric__value" style={{ fontSize: 13 }}>{fmt(INVESTOR.legalBP)}</div></div>
          </div>

          {/* Weekly breakdown */}
          <div className="section-label">Weekly Cash Flow</div>
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', marginBottom: 12 }}>
            <div className="metric"><div className="metric__label">Rent</div><div className="metric__value" style={{ fontSize: 13, color: 'var(--green)' }}>+${model.weeklyRent}</div></div>
            <div className="metric"><div className="metric__label">Mortgage</div><div className="metric__value" style={{ fontSize: 13, color: 'var(--red)' }}>-${model.weeklyMortgage}</div></div>
            <div className="metric"><div className="metric__label">Management</div><div className="metric__value" style={{ fontSize: 13, color: 'var(--red)' }}>-${model.weeklyMgmt}</div></div>
            <div className="metric"><div className="metric__label">Ins + Rates</div><div className="metric__value" style={{ fontSize: 13, color: 'var(--red)' }}>-${model.weeklyInsRates}</div></div>
          </div>

          {/* Tax comparison */}
          <div className="section-label">Tax Impact: Old vs New Rules</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: 10 }}>
              <div className="text-xs text-muted">OLD RULES</div>
              <div className="text-sm mt-4">NG refund: <b style={{ color: 'var(--green)' }}>+{fmt(model.oldNgBenefit)}/yr</b></div>
              <div className="text-sm">After-tax cashflow: <b>{fmt(model.oldAfterTaxAnnual)}/yr</b></div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: 10 }}>
              <div className="text-xs text-muted">NEW RULES (your purchase)</div>
              <div className="text-sm mt-4">NG refund: <b style={{ color: path.isNewBuild ? 'var(--green)' : 'var(--red)' }}>{path.isNewBuild ? `+${fmt(model.newNgBenefit)}/yr` : '$0 (quarantined)'}</b></div>
              {model.depreciationBenefit > 0 && <div className="text-sm">Depreciation: <b style={{ color: 'var(--green)' }}>+{fmt(model.depreciationBenefit)}/yr</b></div>}
              <div className="text-sm">After-tax cashflow: <b>{fmt(model.newAfterTaxAnnual)}/yr</b></div>
            </div>
          </div>

          {/* Drivers & warnings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div className="section-label">Drivers</div>
              {path.drivers.map((d, i) => <div key={i} className="text-xs" style={{ color: 'var(--green)', marginBottom: 3 }}>✓ {d}</div>)}
            </div>
            <div>
              <div className="section-label">Risks</div>
              {path.warnings.map((w, i) => <div key={i} className="text-xs" style={{ color: 'var(--red)', marginBottom: 3 }}>⚠ {w}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskMatrix({ paths }) {
  const categories = ['concentration', 'macro', 'structural', 'supply', 'liquidity', 'policy', 'climate'];
  const labels = { concentration: 'Concentration', macro: 'Rate Sensitivity', structural: 'Jobs Anchor', supply: 'Supply Risk', liquidity: 'Liquidity', policy: 'Policy Risk', climate: 'Climate' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ minWidth: 600 }}>
        <thead>
          <tr>
            <th>Risk</th>
            {paths.map(p => <th key={p.id} style={{ textAlign: 'center' }}><span style={{ color: p.color }}>{p.id}</span> {p.label.split(' ')[0]}</th>)}
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => (
            <tr key={cat}>
              <td style={{ fontWeight: 600 }}>{labels[cat]}</td>
              {paths.map(p => {
                const r = p.risks[cat];
                return (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', background: r.label === 'LOW' ? 'var(--green-dim)' : r.label === 'MEDIUM' ? 'var(--amber-dim)' : r.label === 'HIGH' ? 'var(--red-dim)' : 'transparent', color: riskColor(r.label) }}>
                      {r.label}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionPanel({ ranked }) {
  const best = ranked[0];
  if (!best) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--green)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>RECOMMENDATION: Path {best.path.id} — {best.path.label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
        {best.path.id === 'A' && 'Adelaide north (AUKUS catchment) offers the best risk-adjusted return under new rules. Diversifies away from QLD, low upfront cash, 30-year structural demand from AUKUS, and 0.5% vacancy locks in rental income. NG quarantine is manageable — the ~$2-4k/yr tax penalty is offset by the +12% annual growth and defence-driven demand floor.'}
        {best.path.id === 'B' && 'Perth south (HMAS Stirling) combines defence anchoring with Australia\'s strongest growth (+26%). Higher entry price stretches cash but ROCI compensates. Late-cycle risk is the main caveat — consider timing carefully.'}
        {best.path.id === 'C' && 'Townsville offers the best raw numbers (lowest entry, highest yield, cash flow positive) but the QLD concentration risk and cyclone insurance loading make it hard to justify over Adelaide or Perth for portfolio construction.'}
        {best.path.id === 'D' && 'New build H&L preserves full NG + depreciation benefits, making the tax math best. But supply risk in new estates and growth lag vs established suburbs reduce real returns.'}
      </div>

      <div className="section-label">Full Ranking</div>
      {ranked.map((r, i) => (
        <div key={r.path.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? 'var(--green)' : 'var(--bg-secondary)', color: i === 0 ? '#000' : 'var(--text-muted)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
          <span style={{ color: r.path.color, fontWeight: 700, fontSize: 13 }}>{r.path.id}: {r.path.label}</span>
          <span className="mono text-xs" style={{ marginLeft: 'auto', color: r.model.scenarios.base.rociNew >= 100 ? 'var(--green)' : 'var(--amber)' }}>ROCI {r.model.scenarios.base.rociNew}%</span>
          <span className="text-xs text-muted">Risk {r.model.riskPct}%</span>
        </div>
      ))}

      <div className="info-box info-box--blue mt-16" style={{ fontSize: 11 }}>
        <strong>Portfolio view:</strong> You already own Murrumba Downs QLD (grandfathered). Next purchase should diversify to SA or WA. If QLD is chosen, it must clearly outperform to justify the concentration + land tax cost. All models assume 5yr hold, interest-only at 6.42%, 10% deposit + LMI.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN VIEW
// ═══════════════════════════════════════════════════════════════════════
export function StrategyView() {
  const models = useMemo(() => PATHS.map(p => ({ path: p, model: modelPath(p) })), []);

  const ranked = useMemo(() => {
    return [...models]
      .filter(m => !m.model.isWait)
      .sort((a, b) => {
        const aScore = a.model.scenarios.base.rociNew * (1 - a.model.riskPct / 200);
        const bScore = b.model.scenarios.base.rociNew * (1 - b.model.riskPct / 200);
        return bScore - aScore;
      });
  }, [models]);

  const bestId = ranked[0]?.path.id;

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">📊 Strategy Analysis</h2>
          <p className="stage-shell__desc">Side-by-side investment path comparison under post-12 May 2026 tax rules. Modeled for YOUR situation.</p>
        </div>
      </div>

      <PolicyBanner />

      <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
        <div className="header__chip"><b>Budget:</b> $800k</div>
        <div className="header__chip"><b>Cash:</b> $110-135k</div>
        <div className="header__chip"><b>Existing:</b> Murrumba Downs QLD</div>
        <div className="header__chip"><b>Strategy:</b> 5yr buy-and-hold</div>
        <div className="header__chip"><b>Rate:</b> 6.42% investor</div>
        <div className="header__chip"><b>Deposit:</b> 10% + LMI</div>
      </div>

      <div className="section-label">Investment Paths</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 12, marginBottom: 20 }}>
        {models.map(({ path, model }, i) => (
          <PathCard key={path.id} path={path} model={model} rank={i + 1} isRecommended={path.id === bestId} />
        ))}
      </div>

      <div className="section-label mt-20">Risk Matrix</div>
      <RiskMatrix paths={PATHS} />

      <div className="section-label mt-20" style={{ marginTop: 20 }}>Decision</div>
      <DecisionPanel ranked={ranked} />
    </div>
  );
}
