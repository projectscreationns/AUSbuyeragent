import { useCallback } from 'react';
import { usePipeline, useStageData, useUpstreamData } from '../context/PipelineContext';
import { useAnthropicAgent } from './useAnthropicAgent';
import { extractJson } from '../lib/response-parser';
import { STAGE_DEFS } from '../config/constants';

const STAGE_KEYS = STAGE_DEFS.map(s => s.key);

export function useStageRunner(stageKey, buildPrompt) {
  const { state, dispatch } = usePipeline();
  const stageData = useStageData(stageKey);
  const upstream = useUpstreamData(stageKey);
  const agent = useAnthropicAgent();

  const idx = STAGE_KEYS.indexOf(stageKey);
  const prevKey = idx > 0 ? STAGE_KEYS[idx - 1] : null;
  const isUnlocked = !prevKey || state.stages[prevKey].status === 'done';

  const run = useCallback(async () => {
    if (!isUnlocked) return;

    dispatch({ type: 'STAGE_START', stage: stageKey });

    try {
      const { system, user, model, maxTokens, maxSearchUses } = buildPrompt({
        investorProfile: state.investorProfile,
        upstream,
        selections: stageData.selections,
      });

      const result = await agent.run({
        system,
        userMessage: user,
        model,
        maxTokens,
        maxSearchUses,
      });

      const parsed = extractJson(result.text);
      if (!parsed) {
        throw new Error('Agent returned no structured data. Raw response available in console.');
      }

      dispatch({ type: 'STAGE_COMPLETE', stage: stageKey, data: parsed });
      return parsed;
    } catch (err) {
      console.error(`Stage ${stageKey} error:`, err);
      dispatch({ type: 'STAGE_ERROR', stage: stageKey, error: err.message });
      throw err;
    }
  }, [isUnlocked, stageKey, buildPrompt, state.investorProfile, upstream, stageData.selections, agent, dispatch]);

  const reset = useCallback(() => {
    agent.abort();
    dispatch({ type: 'STAGE_RESET', stage: stageKey });
  }, [agent, dispatch, stageKey]);

  const approve = useCallback(() => {
    dispatch({ type: 'STAGE_ADVANCE', stage: stageKey });
  }, [dispatch, stageKey]);

  const select = useCallback((selections) => {
    dispatch({ type: 'STAGE_SELECT', stage: stageKey, selections });
  }, [dispatch, stageKey]);

  return {
    run,
    reset,
    approve,
    select,
    status: stageData.status,
    data: stageData.data,
    selections: stageData.selections,
    error: stageData.error,
    timestamp: stageData.timestamp,
    isUnlocked,
    isRunning: agent.isRunning,
    turn: agent.turn,
    abort: agent.abort,
  };
}
