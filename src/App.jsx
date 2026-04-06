import './app.css';
import { useApi } from './context/ApiContext';
import { usePipeline } from './context/PipelineContext';
import { ApiKeyInput } from './components/common/ApiKeyInput';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Stage1Macro } from './components/stages/Stage1Macro';
import { Stage2RegionScan } from './components/stages/Stage2RegionScan';
import { Stage3SuburbDive } from './components/stages/Stage3SuburbDive';
import { Stage4ListingScout } from './components/stages/Stage4ListingScout';
import { Stage5DueDiligence } from './components/stages/Stage5DueDiligence';

const STAGE_COMPONENTS = {
  macro: Stage1Macro,
  regions: Stage2RegionScan,
  suburbs: Stage3SuburbDive,
  listings: Stage4ListingScout,
  dd: Stage5DueDiligence,
};

function Dashboard() {
  const { state } = usePipeline();
  const StageComponent = STAGE_COMPONENTS[state.currentStage] || Stage1Macro;

  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main className="main">
        <ErrorBoundary label={state.currentStage}>
          <StageComponent />
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  const { isConfigured } = useApi();

  if (!isConfigured) {
    return <ApiKeyInput />;
  }

  return (
    <ErrorBoundary label="App">
      <Dashboard />
    </ErrorBoundary>
  );
}
