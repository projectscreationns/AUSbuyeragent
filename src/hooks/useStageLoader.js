import { useCallback } from 'react';
import { usePipeline, useStageData } from '../context/PipelineContext';
import { STAGE_DEFS } from '../config/constants';

const STAGE_KEYS = STAGE_DEFS.map(s => s.key);

export function useStageLoader(stageKey) {
  const { state, dispatch } = usePipeline();
  const stageData = useStageData(stageKey);

  const idx = STAGE_KEYS.indexOf(stageKey);
  const prevKey = idx > 0 ? STAGE_KEYS[idx - 1] : null;
  const isUnlocked = !prevKey || state.stages[prevKey].status === 'done';

  const load = useCallback(async () => {
    if (!isUnlocked) return;

    dispatch({ type: 'STAGE_START', stage: stageKey });

    try {
      // Cache-bust to ensure we get the latest file
      const resp = await fetch(`${import.meta.env.BASE_URL}data/${stageKey}.json?t=${Date.now()}`);
      if (!resp.ok) {
        throw new Error(
          resp.status === 404
            ? `No data file found. Ask Claude Code to run the ${stageKey} analysis first.`
            : `Failed to load data: ${resp.status}`
        );
      }
      const data = await resp.json();
      dispatch({ type: 'STAGE_COMPLETE', stage: stageKey, data });
      return data;
    } catch (err) {
      dispatch({ type: 'STAGE_ERROR', stage: stageKey, error: err.message });
      throw err;
    }
  }, [isUnlocked, stageKey, dispatch]);

  const reset = useCallback(() => {
    dispatch({ type: 'STAGE_RESET', stage: stageKey });
  }, [dispatch, stageKey]);

  const approve = useCallback(() => {
    dispatch({ type: 'STAGE_ADVANCE', stage: stageKey });
  }, [dispatch, stageKey]);

  const select = useCallback((selections) => {
    dispatch({ type: 'STAGE_SELECT', stage: stageKey, selections });
  }, [dispatch, stageKey]);

  return {
    load,
    reset,
    approve,
    select,
    status: stageData.status,
    data: stageData.data,
    selections: stageData.selections,
    error: stageData.error,
    timestamp: stageData.timestamp,
    isUnlocked,
  };
}
