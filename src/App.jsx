import './app.css';
import { usePipeline } from './context/PipelineContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Stage1Macro } from './components/stages/Stage1Macro';
import { Stage2RegionScan } from './components/stages/Stage2RegionScan';
import { Stage3SuburbDive } from './components/stages/Stage3SuburbDive';
import { Stage4ListingScout } from './components/stages/Stage4ListingScout';
import { Stage5DueDiligence } from './components/stages/Stage5DueDiligence';
import { AgentsView } from './components/stages/AgentsView';
import { Top10View } from './components/stages/Top10View';

const STAGE_COMPONENTS = {
  agents: AgentsView,
  macro: Stage1Macro,
  regions: Stage2RegionScan,
  suburbs: Stage3SuburbDive,
  listings: Stage4ListingScout,
  dd: Stage5DueDiligence,
  top10: Top10View,
};

export default function App() {
  const { state } = usePipeline();
  const StageComponent = STAGE_COMPONENTS[state.currentStage] || Stage1Macro;

  return (
    <ErrorBoundary label="App">
      <div className="app-layout">
        <Header />
        <Sidebar />
        <main className="main">
          <ErrorBoundary label={state.currentStage}>
            <StageComponent />
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  );
}
