import { useState, useCallback } from 'react';
import { usePipeline, useStageData, useUpstreamData } from '../../context/PipelineContext';
import { useAnthropicAgent } from '../../hooks/useAnthropicAgent';
import { useApi } from '../../context/ApiContext';
import { extractJson } from '../../lib/response-parser';
import { buildCollectorPrompt } from '../../prompts/stage4-collector';
import { buildAnalystPrompt } from '../../prompts/stage4-analyst';
import { StageShell } from '../layout/StageShell';
import { LoadingAgent } from '../common/LoadingAgent';
import { VerdictBadge } from '../common/VerdictBadge';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { MODELS } from '../../config/constants';

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
        <span className="verdict" style={{ background: mc + '18', color: mc, border: `1px solid ${mc}30` }}>
          {listing.motivation} MOTIVATION
        </span>
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
  const { state, dispatch } = usePipeline();
  const stageData = useStageData('listings');
  const upstream = useUpstreamData('listings');
  const { apiKey } = useApi();
  const agent = useAnthropicAgent();

  const suburbsStage = upstream.suburbs;
  const selectedSuburbs = suburbsStage?.selections || [];
  const suburbs = suburbsStage?.data?.suburbs?.filter(s => selectedSuburbs.includes(s.name)) || [];

  const [results, setResults] = useState(stageData.data || {});
  const [activeSuburb, setActiveSuburb] = useState(null);
  const [phase, setPhase] = useState('');

  const prevKey = 'suburbs';
  const isUnlocked = state.stages[prevKey]?.status === 'done';

  const scanSuburb = useCallback(async (suburb) => {
    setActiveSuburb(suburb.name);
    setPhase('Agent 1 — Collecting listings');

    const collectorPrompt = buildCollectorPrompt({ suburb, budget: state.investorProfile.budget });

    const collectorResult = await agent.run({
      system: collectorPrompt.system,
      userMessage: collectorPrompt.user,
      model: collectorPrompt.model,
      maxTokens: collectorPrompt.maxTokens,
      maxSearchUses: collectorPrompt.maxSearchUses,
    });

    const rawData = extractJson(collectorResult.text);
    const collected = rawData?.collected || [];

    if (collected.length === 0) {
      return { suburb: suburb.name, items: [], collected: 0, error: null };
    }

    setPhase(`Agent 2 — Analysing ${collected.length} listings`);

    const analystPrompt = buildAnalystPrompt({
      suburb,
      listings: collected,
      budget: state.investorProfile.budget,
    });

    const analystResult = await agent.run({
      system: analystPrompt.system,
      userMessage: analystPrompt.user,
      model: analystPrompt.model,
      maxTokens: analystPrompt.maxTokens,
      maxSearchUses: analystPrompt.maxSearchUses,
    });

    const analysed = extractJson(analystResult.text) || [];
    return {
      suburb: suburb.name,
      items: Array.isArray(analysed) ? analysed : [],
      collected: collected.length,
      discarded: rawData?.discarded,
      analysedAt: new Date().toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      error: null,
    };
  }, [agent, state.investorProfile.budget]);

  const runAll = useCallback(async () => {
    dispatch({ type: 'STAGE_START', stage: 'listings' });
    const allResults = { ...results };

    for (const suburb of suburbs) {
      if (allResults[suburb.name]?.items?.length > 0) continue;
      try {
        const result = await scanSuburb(suburb);
        allResults[suburb.name] = result;
        setResults({ ...allResults });
      } catch (err) {
        allResults[suburb.name] = { suburb: suburb.name, items: [], error: err.message };
        setResults({ ...allResults });
      }
    }

    setActiveSuburb(null);
    setPhase('');
    dispatch({ type: 'STAGE_COMPLETE', stage: 'listings', data: allResults });
  }, [suburbs, results, scanSuburb, dispatch]);

  const totalInvestigate = Object.values(results).reduce((n, r) => n + (r?.items?.filter(l => l.verdict === 'INVESTIGATE').length || 0), 0);
  const totalMonitor = Object.values(results).reduce((n, r) => n + (r?.items?.filter(l => l.verdict === 'MONITOR').length || 0), 0);

  return (
    <StageShell
      title="Listing Scout"
      description="AI searches Domain + REA for live listings in selected suburbs"
      status={stageData.status}
      error={stageData.error}
      timestamp={stageData.timestamp}
      isUnlocked={isUnlocked}
      isRunning={agent.isRunning}
      onRun={runAll}
      onReset={() => {
        agent.abort();
        setResults({});
        dispatch({ type: 'STAGE_RESET', stage: 'listings' });
      }}
      onApprove={() => dispatch({ type: 'STAGE_ADVANCE', stage: 'listings' })}
      onAbort={agent.abort}
    >
      <ErrorBoundary label="Listing Scout">
        {agent.isRunning && (
          <LoadingAgent
            title={`Scanning ${activeSuburb || ''}...`}
            phase={phase}
            steps={[
              { label: 'Collect', status: phase.includes('Agent 2') ? 'done' : 'active' },
              { label: 'Analyse', status: phase.includes('Agent 2') ? 'active' : 'pending' },
            ]}
          />
        )}

        {Object.keys(results).length > 0 && (
          <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
            <div className="info-box info-box--green" style={{ display: 'inline-block' }}>
              <span className="fw-700" style={{ fontSize: 16 }}>{totalInvestigate}</span> INVESTIGATE
            </div>
            <div className="info-box info-box--amber" style={{ display: 'inline-block' }}>
              <span className="fw-700" style={{ fontSize: 16 }}>{totalMonitor}</span> MONITOR
            </div>
          </div>
        )}

        {Object.entries(results).map(([suburbName, result]) => {
          if (!result?.items?.length && !result?.error) return null;
          const inv = result.items?.filter(l => l.verdict === 'INVESTIGATE') || [];
          const mon = result.items?.filter(l => l.verdict === 'MONITOR') || [];

          return (
            <div key={suburbName} style={{ marginBottom: 20 }}>
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-heading fw-600" style={{ fontSize: 15 }}>{suburbName}</h3>
                <span className="mono text-xs text-muted">
                  {result.collected} collected · {inv.length} investigate · {mon.length} monitor
                  {result.analysedAt && ` · ${result.analysedAt}`}
                </span>
              </div>
              {result.error && (
                <div className="info-box info-box--red mb-8">{result.error}</div>
              )}
              {[...inv, ...mon].map((listing, i) => (
                <ListingCard key={i} listing={listing} />
              ))}
            </div>
          );
        })}

        {stageData.status === 'idle' && Object.keys(results).length === 0 && (
          <div className="loading-agent">
            <div className="loading-agent__icon">🔍</div>
            <div className="loading-agent__title">Ready to scout listings</div>
            <div className="loading-agent__phase">
              Requires Suburb Deep Dive (Stage 3) with selected suburbs.<br />
              Agent 1 collects from Domain/REA. Agent 2 filters to INVESTIGATE/MONITOR.
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
