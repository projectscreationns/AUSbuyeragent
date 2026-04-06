import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PipelineProvider } from './context/PipelineContext';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PipelineProvider>
      <App />
    </PipelineProvider>
  </StrictMode>,
);
