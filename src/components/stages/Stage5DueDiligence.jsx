import { useState, useCallback } from 'react';
import { useAnthropicAgent } from '../../hooks/useAnthropicAgent';
import { useApi } from '../../context/ApiContext';
import { extractJson } from '../../lib/response-parser';
import { buildStage5Prompt } from '../../prompts/stage5-due-diligence';
import { StageShell } from '../layout/StageShell';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { usePipeline } from '../../context/PipelineContext';
import { API_URL, API_VERSION, MODELS } from '../../config/constants';

function DDReport({ report }) {
  if (!report) return null;

  return (
    <div>
      {/* Summary header */}
      <div className="card mb-12" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="text-heading fw-700" style={{ fontSize: 16, marginBottom: 4 }}>{report.address}</div>
          <div className="text-sm text-muted">{report.summary}</div>
        </div>
        <span className="verdict" style={{
          background: report.overallRisk === 'LOW' ? 'var(--green-dim)' : report.overallRisk === 'HIGH' ? 'var(--red-dim)' : 'var(--amber-dim)',
          color: report.overallRisk === 'LOW' ? 'var(--green)' : report.overallRisk === 'HIGH' ? 'var(--red)' : 'var(--amber)',
          fontSize: 12, padding: '4px 10px',
        }}>
          {report.overallRisk} RISK
        </span>
      </div>

      {/* Kill Deal */}
      {report.killDeal ? (
        <div className="info-box info-box--red mb-12" style={{ textAlign: 'center' }}>
          <div className="fw-700" style={{ fontSize: 18 }}>KILL DEAL</div>
          <div>{report.killDealReason}</div>
        </div>
      ) : (
        <div className="info-box info-box--green mb-12" style={{ textAlign: 'center' }}>
          <div className="fw-700" style={{ fontSize: 14 }}>No Kill Deal</div>
        </div>
      )}

      {/* Red Flags */}
      {report.redFlags?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Red Flags ({report.redFlags.length})</div>
          {report.redFlags.map((f, i) => (
            <div key={i} className="dd-flag dd-flag--red">
              <div className="dd-flag__issue">{f.issue}</div>
              <div className="dd-flag__impact">Impact: {f.impact}</div>
              <div className="dd-flag__action">→ {f.action}</div>
            </div>
          ))}
        </div>
      )}

      {/* Yellow Flags */}
      {report.yellowFlags?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Yellow Flags ({report.yellowFlags.length})</div>
          {report.yellowFlags.map((f, i) => (
            <div key={i} className="dd-flag dd-flag--yellow">
              <div className="dd-flag__issue">{f.issue}</div>
              <div className="dd-flag__impact">Impact: {f.impact}</div>
              <div className="dd-flag__action">→ {f.action}</div>
            </div>
          ))}
        </div>
      )}

      {/* Negotiation Leverage */}
      {report.negotiationLeverage?.length > 0 && (
        <div className="mb-12">
          <div className="section-label">Negotiation Leverage</div>
          {report.negotiationLeverage.map((l, i) => (
            <div key={i} className="card mb-8" style={{ borderLeft: '3px solid var(--blue)' }}>
              <div className="fw-600 text-heading text-sm">{l.item}</div>
              <div className="mono text-green text-sm">{l.estimatedValue}</div>
              <div className="text-xs text-muted">{l.howToUse}</div>
            </div>
          ))}
        </div>
      )}

      {/* Hold Cost Estimate */}
      {report.holdCostEstimate && (
        <div className="card mb-12">
          <div className="section-label">Hold Cost Estimate</div>
          {Object.entries(report.holdCostEstimate).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm" style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-muted">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="mono text-heading">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Checklist */}
      {report.beforeExchangeChecklist?.length > 0 && (
        <div className="card mb-12">
          <div className="section-label">Before Exchange Checklist</div>
          {report.beforeExchangeChecklist.map((item, i) => (
            <div key={i} className="flex gap-8 text-sm" style={{ padding: '3px 0' }}>
              <span className="text-muted">☐</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Solicitor Advice */}
      {report.seekSolicitorAdvice?.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(59,130,246,.3)' }}>
          <div className="section-label" style={{ color: 'var(--blue)' }}>Seek Solicitor Advice</div>
          {report.seekSolicitorAdvice.map((item, i) => (
            <div key={i} className="text-sm" style={{ color: '#93c5fd', padding: '3px 0' }}>→ {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stage5DueDiligence() {
  const { state } = usePipeline();
  const { apiKey } = useApi();
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [files, setFiles] = useState([]);
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const prevDone = state.stages.listings?.status === 'done';

  const runDD = useCallback(async () => {
    if (!address || files.length === 0 || !apiKey) return;
    setRunning(true);
    setReport(null);
    setError(null);

    try {
      // Read files as base64
      const docs = await Promise.all(
        files.map(f => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: f.name,
            type: f.type,
            data: reader.result.split(',')[1],
          });
          reader.onerror = reject;
          reader.readAsDataURL(f);
        }))
      );

      const { system, user } = buildStage5Prompt({ address, price });

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODELS.deep,
          max_tokens: 6000,
          system,
          messages: [{
            role: 'user',
            content: [
              ...docs.map(d => ({
                type: d.type === 'application/pdf' ? 'document' : 'image',
                source: { type: 'base64', media_type: d.type, data: d.data },
              })),
              { type: 'text', text: user },
            ],
          }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || response.status);

      const txt = data.content?.filter(b => b.type === 'text').map(b => b.text).join('');
      const parsed = extractJson(txt);
      if (!parsed) throw new Error('Could not parse DD report');

      parsed.address = parsed.address || address;
      setReport(parsed);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, [address, price, files, apiKey]);

  return (
    <StageShell
      title="Due Diligence"
      description="Upload property documents for AI risk analysis"
      status={report ? 'done' : running ? 'running' : 'idle'}
      isUnlocked={prevDone}
      isRunning={running}
      onRun={() => {}}
    >
      <ErrorBoundary label="Due Diligence">
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
          {/* Input panel */}
          <div>
            <div className="card mb-8">
              <div className="section-label">Property</div>
              <input
                className="input mb-8"
                placeholder="Address"
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
              <input
                className="input"
                placeholder="Price (optional)"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>

            <div className="card mb-8">
              <div className="section-label">Documents</div>
              <div
                className="file-drop mb-8"
                onClick={() => document.getElementById('dd-file-input').click()}
              >
                <div className="file-drop__label">Click to upload PDFs or images</div>
              </div>
              <input
                id="dd-file-input"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
                onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])}
              />
              {files.map((f, i) => (
                <div key={i} className="flex justify-between text-xs mono" style={{ padding: '3px 0' }}>
                  <span>{f.name}</span>
                  <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>×</span>
                </div>
              ))}
              <button
                className="btn btn--primary"
                onClick={runDD}
                disabled={running || !address || files.length === 0}
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
              >
                {running ? 'Analysing...' : 'Run Due Diligence'}
              </button>
            </div>

            {error && (
              <div className="info-box info-box--red">{error}</div>
            )}
          </div>

          {/* Results panel */}
          <div>
            {!report && !running && (
              <div className="loading-agent">
                <div className="loading-agent__icon">📄</div>
                <div className="loading-agent__title">Upload documents to analyse</div>
                <div className="loading-agent__phase">
                  Contract of sale, building inspection, pest report,<br />
                  strata documents, council searches, etc.
                </div>
              </div>
            )}
            {running && (
              <div className="loading-agent">
                <div className="loading-agent__icon">🧠</div>
                <div className="loading-agent__title">Analysing documents...</div>
                <div className="loading-agent__phase">Reading and extracting risk factors</div>
              </div>
            )}
            {report && <DDReport report={report} />}
          </div>
        </div>

        {report && (
          <button
            className="btn btn--secondary mt-16"
            onClick={() => { setReport(null); setFiles([]); setAddress(''); setPrice(''); setError(null); }}
          >
            Clear & new property
          </button>
        )}
      </ErrorBoundary>
    </StageShell>
  );
}
