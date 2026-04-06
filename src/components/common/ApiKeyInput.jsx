import { useState } from 'react';
import { useApi } from '../../context/ApiContext';

export function ApiKeyInput() {
  const { setApiKey } = useApi();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const key = value.trim();
    if (!key.startsWith('sk-')) {
      setError('API key should start with "sk-"');
      return;
    }
    setApiKey(key);
  };

  return (
    <div className="api-key-screen">
      <div className="api-key-card">
        <div className="api-key-card__title">
          AUS Buyer <span style={{ color: 'var(--amber)' }}>Agent</span>
        </div>
        <div className="api-key-card__subtitle">
          AI-powered property investment analysis for Australia.<br />
          Enter your Anthropic API key to get started.
        </div>
        <form onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder="sk-ant-..."
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6, textAlign: 'left' }}>
              {error}
            </div>
          )}
          <button
            className="btn btn--primary"
            type="submit"
            disabled={!value.trim()}
            style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
          >
            Start Analysis
          </button>
        </form>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
          Your key is stored in localStorage (browser only).<br />
          Uses Claude with web search for live market data.
        </div>
      </div>
    </div>
  );
}
