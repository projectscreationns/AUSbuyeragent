import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './context/ApiContext';
import { PipelineProvider } from './context/PipelineContext';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApiProvider>
      <PipelineProvider>
        <App />
      </PipelineProvider>
    </ApiProvider>
  </StrictMode>,
);
