import { createContext, useContext, useState, useCallback } from 'react';
import { getApiKey, setApiKey as storeApiKey, clearApiKey as removeApiKey } from '../lib/cache';

const ApiContext = createContext(null);

export function ApiProvider({ children }) {
  const [apiKey, setApiKeyState] = useState(() => getApiKey());

  const setApiKey = useCallback((key) => {
    storeApiKey(key);
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(() => {
    removeApiKey();
    setApiKeyState(null);
  }, []);

  return (
    <ApiContext.Provider value={{ apiKey, isConfigured: !!apiKey, setApiKey, clearApiKey }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
}
