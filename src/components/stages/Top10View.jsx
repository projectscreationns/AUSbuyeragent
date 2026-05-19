import { useEffect, useState } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';

const VERDICT_STYLE = {
  INVESTIGATE: { bg: '#1a3a1a', border: '#2d8a2d', color: '#6fdc6f' },
  MONITOR: { bg: '#1a2a3a', border: '#2d6a8a', color: '#6fbcdc' },
  AVOID: { bg: '#3a1a1a', border: '#8a2d2d', color: '#dc6f6f' },
};

const CRIME_COLOR = {
  LOW: '#6fdc6f', 'LOW-MEDIUM': '#b8dc6f', MEDIUM: '#dcb86f', HIGH: '#dc6f6f', SEVERE: '#ff3333',
};

export function Top10View() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('suburbs');

  const load = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/top10.json?t=${Date.now()}`);
      if (!r.ok) throw new Error('top10.json not found');
      setData(await r.json());
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  if (err) return (
    <div className="error-display">
      <div className="error-display__title">No data</div>
      <div className="error-display__message">{err}</div>
    </div>
  );
  if (!data) return <div className="loading-spinner"><span className="loading-spinner__dot" /><span className="loading-spinner__dot" /><span className="loading-spinner__dot" /></div>;

  const { investorProfile: ip, marketContext: mc, suburbRankings: suburbs, topListings: listings, cashAnalysis: ca, recommendation } = data;

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">Top 10 Suburbs — All States</h2>
          <p className="stage-shell__desc">Ranked by growth potential × risk × cash fit × yield</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={load}>Reload</button>
      </div>

      <ErrorBoundary label="Top10">
        {/* Recommendation banner */}
        <div className="info-box info-box--green mb-16" style={{ fontSize: 12, lineHeight: 1.8 }}>
          <strong>Recommendation:</strong> {recommendation}
        </div>

        {/* Market context */}
        <div className="card mb-16" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-bright)' }}>Market Context — May 2026</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, fontSize: 11 }}>
            {mc.strategy && <div><span style={{ color: 'var(--text-dim)' }}>Strategy:</span> <strong>{mc.strategy}</strong></div>}
            {mc.perthMedian && <div><span style={{ color: 'var(--text-dim)' }}>Perth:</span> <strong>{mc.perthMedian}</strong></div>}
            {mc.townsvilleGrowth && <div><span style={{ color: 'var(--text-dim)' }}>Townsville:</span> <strong style={{ color: '#6fdc6f' }}>{mc.townsvilleGrowth}</strong></div>}
            {mc.adelaideGrowth && <div><span style={{ color: 'var(--text-dim)' }}>Adelaide:</span> <strong style={{ color: '#6fdc6f' }}>{mc.adelaideGrowth}</strong></div>}
            {mc.waForecast && <div><span style={{ color: 'var(--text-dim)' }}>WA outlook:</span> <strong style={{ color: '#dcb86f' }}>{mc.waForecast}</strong></div>}
            {mc.interestRate && <div><span style={{ color: 'var(--text-dim)' }}>Interest rate:</span> <strong>{mc.interestRate}</strong></div>}
            {mc.adelaideMedian && <div><span style={{ color: 'var(--text-dim)' }}>Adelaide median:</span> <strong>{mc.adelaideMedian}</strong></div>}
            {mc.vacancyRate && <div><span style={{ color: 'var(--text-dim)' }}>Vacancy:</span> <strong style={{ color: '#dc6f6f' }}>{mc.vacancyRate}</strong></div>}
            {mc.bankForecasts && <div><span style={{ color: 'var(--text-dim)' }}>Forecasts:</span> <strong>{mc.bankForecasts}</strong></div>}
          </div>
        </div>

        {/* Investor profile chips */}
        <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap', fontSize: 11 }}>
          <div className="header__chip">Budget: ${(ip.budget/1000).toFixed(0)}k</div>
          <div className="header__chip">Cash: ${(ip.cashAvailable/1000).toFixed(0)}k</div>
          {ip.strategy && <div className="header__chip" style={{ borderColor: 'var(--green)' }}>{ip.strategy}</div>}
          {ip.stampDutyByState && <div className="header__chip">{ip.stampDutyByState}</div>}
          {ip.ngRelevance && <div className="header__chip" style={{ borderColor: 'var(--green)' }}>NG: {ip.ngRelevance}</div>}
          {ip.absenteeSurcharge && <div className="header__chip" style={{ borderColor: 'var(--green)' }}>Surcharge: {ip.absenteeSurcharge}</div>}
          {ip.taxStatus && <div className="header__chip">Tax: {ip.taxStatus}</div>}
        </div>

        {/* Tab selector */}
        <div className="flex gap-8 mb-16">
          <button className={`btn btn--sm ${tab === 'suburbs' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab('suburbs')}>
            Suburb Rankings ({suburbs?.length || 0})
          </button>
          <button className={`btn btn--sm ${tab === 'listings' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab('listings')}>
            Top Listings ({listings?.length || 0})
          </button>
          <button className={`btn btn--sm ${tab === 'cash' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab('cash')}>
            Cash Analysis
          </button>
        </div>

        {/* SUBURBS TAB */}
        {tab === 'suburbs' && suburbs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suburbs.map((s, i) => (
              <div key={i} className="card" style={{ padding: 16, borderLeft: `4px solid ${i < 3 ? '#6fdc6f' : i < 6 ? '#dcb86f' : '#6fbcdc'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-bright)', marginRight: 8 }}>#{s.rank}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-bright)' }}>{s.suburb}</span>
                    {s.state && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: s.state === 'QLD' ? '#1a3a2a' : s.state === 'WA' ? '#1a2a3a' : s.state === 'SA' ? '#2a1a3a' : s.state === 'VIC' ? '#1a1a3a' : '#3a2a1a', color: s.state === 'QLD' ? '#6fdc6f' : s.state === 'WA' ? '#6fbcdc' : s.state === 'SA' ? '#bc6fdc' : s.state === 'VIC' ? '#6f8adc' : '#dcb86f' }}>{s.state}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{s.postcode}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)' }}>${(s.median/1000).toFixed(0)}k</div>
                    <div style={{ fontSize: 11, color: '#6fdc6f' }}>+{s.annualGrowth} growth</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, fontSize: 11, marginBottom: 8 }}>
                  <div>Yield: <strong>{s.rentalYield}</strong></div>
                  <div>Rent: <strong>${s.medianRent}/wk</strong></div>
                  <div>DOM: <strong>{s.dom}d</strong></div>
                  <div>Vacancy: <strong>{s.vacancyRate}</strong></div>
                  <div>Crime: <strong style={{ color: CRIME_COLOR[s.crimeRating] || '#fff' }}>{s.crimeRating}</strong></div>
                  <div>Supply risk: <strong>{s.supplyRisk}</strong></div>
                  <div>Catalyst: <strong style={{ color: '#dcb86f' }}>{s.primaryCatalyst || s.aukusProximity || 'N/A'}</strong></div>
                  <div>Listings: <strong>{s.listings}</strong> ({s.investigate} INV)</div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-bright)', marginBottom: 6 }}>{s.whyTop}</div>
                <div style={{ fontSize: 11, color: '#dcb86f' }}>⚠ {s.riskNote}</div>
              </div>
            ))}
          </div>
        )}

        {/* LISTINGS TAB */}
        {tab === 'listings' && listings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {listings.map((l, i) => {
              const vs = VERDICT_STYLE.INVESTIGATE;
              return (
                <div key={i} className="card" style={{ padding: 16, borderLeft: `4px solid ${i < 3 ? '#6fdc6f' : i < 6 ? '#dcb86f' : '#6fbcdc'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', marginRight: 8 }}>#{l.rank}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>{l.addr}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: l.priceNumeric <= 700000 ? '#6fdc6f' : '#dcb86f' }}>{l.price}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.suburb}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, fontSize: 11, marginBottom: 8 }}>
                    <div>Beds: <strong>{l.beds || '?'}</strong></div>
                    <div>Baths: <strong>{l.baths || '?'}</strong></div>
                    <div>Car: <strong>{l.car || '?'}</strong></div>
                    <div>Land: <strong>{l.land || '?'}</strong></div>
                    <div>Yield: <strong style={{ color: parseFloat(l.yieldEst) >= 5 ? '#6fdc6f' : '#fff' }}>{l.yieldEst}</strong></div>
                    <div>Cashflow: <strong style={{ color: l.cashflowEst?.includes('+') ? '#6fdc6f' : '#dc8a6f' }}>{l.cashflowEst}</strong></div>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-bright)', marginBottom: 6 }}>{l.reason}</div>
                  <div style={{ fontSize: 12, color: '#6fdc6f', fontWeight: 600, marginBottom: 6 }}>→ {l.action}</div>

                  {l.riskFlags?.length > 0 && (
                    <div style={{ fontSize: 11, color: '#dcb86f', marginBottom: 6 }}>
                      {l.riskFlags.map((rf, j) => <div key={j}>⚠ {rf}</div>)}
                    </div>
                  )}

                  {l.url && (
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="btn btn--primary btn--sm" style={{ fontSize: 11 }}>
                      View Listing →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CASH TAB */}
        {tab === 'cash' && ca && (
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-bright)' }}>Cash Position Analysis</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
              <div>
                <h4 style={{ margin: '0 0 8px', color: '#6fbcdc' }}>Stamp Duty by State</h4>
                <div style={{ lineHeight: 2 }}>
                  {ca.stampDutyWA && <div>WA: <strong style={{ color: '#6fdc6f' }}>{ca.stampDutyWA}</strong></div>}
                  {ca.stampDutyQLD && <div>QLD: <strong>{ca.stampDutyQLD}</strong></div>}
                  {ca.stampDutySA && <div>SA: <strong>{ca.stampDutySA}</strong></div>}
                  {ca.stampDutyNSW && <div>NSW: <strong>{ca.stampDutyNSW}</strong></div>}
                  {ca.stampDutyVIC && <div>VIC: <strong style={{ color: '#dc6f6f' }}>{ca.stampDutyVIC}</strong></div>}
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px', color: '#6fbcdc' }}>Cash Fit</h4>
                <div style={{ lineHeight: 2 }}>
                  {ca.bestCashFit && <div>Best: <strong style={{ color: '#6fdc6f' }}>{ca.bestCashFit}</strong></div>}
                  {ca.worstCashFit && <div>Worst: <strong style={{ color: '#dcb86f' }}>{ca.worstCashFit}</strong></div>}
                  {ca.cashFitSummary && <div style={{ marginTop: 8, color: 'var(--text-bright)' }}>{ca.cashFitSummary}</div>}
                  {ca.cashFits && <div style={{ marginTop: 8, color: 'var(--text-bright)' }}>{ca.cashFits}</div>}
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px', color: '#6fbcdc' }}>Other Costs</h4>
                <div style={{ lineHeight: 2 }}>
                  {ca.deposit10pct && <div>Deposit (10%): <strong>{ca.deposit10pct}</strong></div>}
                  {ca.lmi90lvr && <div>LMI (90% LVR): <strong>{ca.lmi90lvr}</strong></div>}
                  {ca.legalBP && <div>Legal + B&P: <strong>{ca.legalBP}</strong></div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
