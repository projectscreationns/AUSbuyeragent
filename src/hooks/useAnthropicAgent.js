import { useState, useRef, useCallback } from 'react';
import { runAgent, ApiError } from '../lib/anthropic-client';
import { useApi } from '../context/ApiContext';

const RETRY_DELAYS = [5000, 15000, 45000];

export function useAnthropicAgent() {
  const { apiKey } = useApi();
  const [isRunning, setIsRunning] = useState(false);
  const [turn, setTurn] = useState(0);
  const abortRef = useRef(null);

  const run = useCallback(async ({ system, userMessage, model, maxTokens, maxSearchUses, onTurn }) => {
    if (!apiKey) throw new ApiError('No API key configured', 'auth');

    setIsRunning(true);
    setTurn(0);
    abortRef.current = new AbortController();

    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const result = await runAgent({
          apiKey,
          model,
          system,
          userMessage,
          signal: abortRef.current.signal,
          maxTokens,
          maxSearchUses,
          onTurn: (t) => {
            setTurn(t);
            onTurn?.(t);
          },
        });

        setIsRunning(false);
        return result;
      } catch (err) {
        lastError = err;

        if (err.name === 'AbortError' || err.type === 'abort') {
          setIsRunning(false);
          throw err;
        }

        // Only retry on rate limit or server errors
        if ((err.type === 'rate_limit' || err.type === 'server') && attempt < RETRY_DELAYS.length) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }

        setIsRunning(false);
        throw err;
      }
    }

    setIsRunning(false);
    throw lastError;
  }, [apiKey]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return { run, isRunning, turn, abort };
}
