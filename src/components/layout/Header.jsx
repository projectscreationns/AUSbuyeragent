import { useApi } from '../../context/ApiContext';
import { usePipeline } from '../../context/PipelineContext';

export function Header() {
  const { clearApiKey } = useApi();
  const { state } = usePipeline();
  const p = state.investorProfile;

  return (
    <header className="header">
      <div className="header__logo">
        AUS Buyer <span>Agent</span>
      </div>
      <div className="header__chips">
        <div className="header__chip">
          <b>${(p.budget / 1000).toFixed(0)}k</b> House · {p.depositPercent}% dep · LMI
        </div>
        <div className="header__chip">
          <b>{p.strategy === 'capital-growth' ? 'Growth' : p.strategy}</b> · {p.horizon}
        </div>
        {p.existingHoldings.length > 0 && (
          <div className="header__chip">
            Existing: {p.existingHoldings.map(h => `${h.type} ${h.state}`).join(', ')}
          </div>
        )}
      </div>
      <div className="header__right">
        <button
          className="btn btn--secondary btn--sm"
          onClick={clearApiKey}
          title="Change API key"
        >
          Key
        </button>
      </div>
    </header>
  );
}
