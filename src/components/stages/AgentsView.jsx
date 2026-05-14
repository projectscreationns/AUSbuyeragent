import { useEffect, useState } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';

const AGENTS = [
  { id: 1, name: 'Macro Scanner', role: 'Searches RBA/ABS/SQM/CoreLogic. Writes macro.json.', icon: '📊', color: 'var(--blue)' },
  { id: 2, name: 'Region Ranker', role: 'Scores 30+ regions across all states. Writes regions.json.', icon: '🗺', color: 'var(--blue)' },
  { id: 3, name: 'Suburb Analyst', role: 'Deep quant + qual analysis per suburb. Writes suburbs.json.', icon: '🏘', color: 'var(--blue)' },
  { id: 4, name: 'Risk Auditor', role: 'Reviews Suburb Analyst. CORRECTS verdicts where supply risk is high.', icon: '⚠', color: 'var(--amber)' },
  { id: 5, name: 'Listing Scout', role: 'Scrapes REIWA + Ray White for real listings. Writes listings.json.', icon: '🔍', color: 'var(--blue)' },
  { id: 6, name: 'Quality Inspector', role: 'Reads every listing description. REJECTS mould/asbestos/termites/sold-as-is.', icon: '🛡', color: 'var(--red)' },
  { id: 7, name: 'Learning Module', role: 'Records corrections + rejections. Updates scoring rules for future runs.', icon: '🧠', color: 'var(--green)' },
];

export function AgentsView() {
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/feedback.json?t=${Date.now()}`);
      if (!r.ok) throw new Error('No feedback.json yet — run /run-full first');
      setFeedback(await r.json());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const lastRun = feedback?.runHistory?.[feedback.runHistory.length - 1];
  const runs = feedback?.runHistory || [];

  return (
    <div>
      <div className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">Multi-Agent System</h2>
          <p className="stage-shell__desc">The 7 specialized agents that analyze Australian property</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={load}>Reload</button>
      </div>

      <ErrorBoundary label="Agents View">
        {err && <div className="error-display mb-16"><div className="error-display__title">No data yet</div><div className="error-display__message">{err}</div></div>}

        {/* Agent Hierarchy */}
        <div className="section-label">The Hierarchy</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 20 }}>
          {AGENTS.map(agent => {
            const corrections = lastRun?.corrections?.filter(c => c.agent === agent.name)?.length || 0;
            const rejections = lastRun?.rejections?.filter(r => r.agent === agent.name)?.length || 0;
            const isActive = corrections > 0 || rejections > 0;
            return (
              <div key={agent.id} className="card" style={{ borderLeft: `4px solid ${agent.color}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 26 }}>{agent.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="text-heading fw-700" style={{ fontSize: 13 }}>
                      Agent {agent.id}: {agent.name}
                    </div>
                    <div className="text-sm text-muted mt-4">{agent.role}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {corrections > 0 && (
                    <span className="verdict" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.3)' }}>
                      {corrections} corrections
                    </span>
                  )}
                  {rejections > 0 && (
                    <span className="verdict" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)' }}>
                      {rejections} rejections
                    </span>
                  )}
                  {!isActive && lastRun && (
                    <span className="text-xs text-muted">Idle this run</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Flow Diagram */}
        <div className="section-label">Data Flow</div>
        <div className="card mb-16" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          <div>You: <span style={{ color: 'var(--amber)' }}>"/run-full"</span></div>
          <div>│</div>
          <div>├─ <span style={{ color: 'var(--blue)' }}>Agent 1: Macro Scanner</span> → writes <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>macro.json</code></div>
          <div>│   └─ WebSearches RBA, ABS, SQM, CoreLogic</div>
          <div>├─ <span style={{ color: 'var(--blue)' }}>Agent 2: Region Ranker</span> → writes <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>regions.json</code></div>
          <div>│   └─ Reads macro.json, scores 30+ regions</div>
          <div>├─ <span style={{ color: 'var(--blue)' }}>Agent 3: Suburb Analyst</span> → writes <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>suburbs.json</code></div>
          <div>│   └─ Deep quant + qual per suburb</div>
          <div>├─ <span style={{ color: 'var(--amber)' }}>Agent 4: Risk Auditor</span> <span style={{ color: 'var(--red)' }}>← CORRECTS Agent 3</span></div>
          <div>│   └─ Downgrades verdicts where supply/cycle risk is high</div>
          <div>├─ <span style={{ color: 'var(--blue)' }}>Agent 5: Listing Scout</span> → writes <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>listings.json</code></div>
          <div>│   └─ Scrapes REIWA (WA) + Ray White (QLD/SA/VIC)</div>
          <div>├─ <span style={{ color: 'var(--red)' }}>Agent 6: Quality Inspector</span> <span style={{ color: 'var(--red)' }}>← REJECTS Agent 5</span></div>
          <div>│   └─ Reads every description, flags mould/asbestos/termites/sold-as-is</div>
          <div>└─ <span style={{ color: 'var(--green)' }}>Agent 7: Learning Module</span> → updates <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>feedback.json</code></div>
          <div>    └─ Stores corrections/rejections as permanent scoring rules</div>
        </div>

        {/* Last Run: Corrections */}
        {lastRun?.corrections?.length > 0 && (
          <>
            <div className="section-label">Latest Run — Corrections ({lastRun.corrections.length})</div>
            <div className="mb-16">
              {lastRun.corrections.map((c, i) => (
                <div key={i} className="dd-flag dd-flag--yellow">
                  <div className="dd-flag__issue">
                    <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{c.agent}</span>
                    {' corrected '}
                    <span style={{ color: 'var(--blue)' }}>{c.corrected}</span>
                  </div>
                  <div className="dd-flag__impact">
                    <strong>{c.suburb}</strong>: {c.from} → <span className="text-amber fw-700">{c.to}</span>
                  </div>
                  <div className="dd-flag__action">→ {c.reason}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Last Run: Rejections */}
        {lastRun?.rejections?.length > 0 && (
          <>
            <div className="section-label">Latest Run — Rejections ({lastRun.rejections.length})</div>
            <div className="mb-16">
              {lastRun.rejections.map((r, i) => (
                <div key={i} className="dd-flag dd-flag--red">
                  <div className="dd-flag__issue">
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>{r.agent}</span>
                    {' rejected '}
                    <span style={{ color: 'var(--blue)' }}>{r.rejected}</span>
                  </div>
                  <div className="dd-flag__impact">{r.address}</div>
                  <div className="dd-flag__action">→ {r.reason}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Known Traps */}
        {feedback?.knownTraps?.length > 0 && (
          <>
            <div className="section-label">Known Traps — Learned Over Time ({feedback.knownTraps.length})</div>
            <div className="mb-16">
              {feedback.knownTraps.map((t, i) => (
                <div key={i} className="card" style={{ borderLeft: '3px solid var(--red)', marginBottom: 6 }}>
                  <div className="flex justify-between items-center">
                    <span className="fw-600 text-heading">{t.suburb}</span>
                    <span className="mono text-xs text-muted">flagged {t.flaggedDate}</span>
                  </div>
                  <div className="text-sm text-muted mt-4">{t.reason}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Scoring Rules */}
        {feedback?.scoringAdjustments?.length > 0 && (
          <>
            <div className="section-label">Scoring Rules — Learned From Mistakes ({feedback.scoringAdjustments.length})</div>
            <div className="mb-16">
              {feedback.scoringAdjustments.map((r, i) => (
                <div key={i} className="info-box info-box--blue" style={{ marginBottom: 6 }}>
                  <span className="mono text-xs text-muted">{r.addedDate}</span>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{r.rule}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Run History */}
        {runs.length > 0 && (
          <>
            <div className="section-label">Run History ({runs.length} runs)</div>
            <div className="mb-16">
              {runs.slice().reverse().map((run, i) => (
                <div key={i} className="card mb-8">
                  <div className="flex justify-between">
                    <span className="fw-700 text-heading">{run.date}</span>
                    <span className="mono text-xs text-muted">
                      {run.corrections?.length || 0} corrections · {run.rejections?.length || 0} rejections
                    </span>
                  </div>
                  {run.topPicks && (
                    <div className="mt-8 text-sm">
                      <span className="text-muted">Top picks: </span>
                      {run.topPicks.join(' · ')}
                    </div>
                  )}
                  {run.lessonsLearned && run.lessonsLearned.length > 0 && (
                    <div className="mt-8">
                      <div className="text-xs text-muted fw-700 mb-4">LESSONS LEARNED</div>
                      {run.lessonsLearned.map((l, j) => (
                        <div key={j} className="text-xs" style={{ padding: '2px 0', color: 'var(--text-secondary)' }}>
                          · {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {loading && !feedback && (
          <div className="loading-agent">
            <div className="loading-agent__icon">🧠</div>
            <div className="loading-agent__title">Loading agent activity...</div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
