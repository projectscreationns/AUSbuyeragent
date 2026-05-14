import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { DEFAULT_PROFILE } from '../config/investor-profile';
import { STAGE_DEFS } from '../config/constants';

const STAGE_KEYS = STAGE_DEFS.map(s => s.key);

function makeInitialStages() {
  const stages = {};
  for (const key of STAGE_KEYS) {
    stages[key] = { status: 'idle', data: null, selections: [], error: null, timestamp: null };
  }
  return stages;
}

const initialState = {
  investorProfile: DEFAULT_PROFILE,
  stages: makeInitialStages(),
  currentStage: 'macro',
};

function reducer(state, action) {
  switch (action.type) {
    case 'STAGE_START': {
      const stages = { ...state.stages };
      stages[action.stage] = { ...stages[action.stage], status: 'running', error: null };
      return { ...state, stages };
    }

    case 'STAGE_COMPLETE': {
      const stages = { ...state.stages };
      stages[action.stage] = {
        ...stages[action.stage],
        status: 'done',
        data: action.data,
        error: null,
        timestamp: Date.now(),
      };
      return { ...state, stages };
    }

    case 'STAGE_ERROR': {
      const stages = { ...state.stages };
      stages[action.stage] = { ...stages[action.stage], status: 'error', error: action.error };
      return { ...state, stages };
    }

    case 'STAGE_SELECT': {
      const stages = { ...state.stages };
      stages[action.stage] = { ...stages[action.stage], selections: action.selections };
      return { ...state, stages };
    }

    case 'STAGE_ADVANCE': {
      const idx = STAGE_KEYS.indexOf(action.stage);
      const nextKey = STAGE_KEYS[idx + 1] || state.currentStage;
      return { ...state, currentStage: nextKey };
    }

    case 'STAGE_RESET': {
      const stages = { ...state.stages };
      const idx = STAGE_KEYS.indexOf(action.stage);
      for (let i = idx; i < STAGE_KEYS.length; i++) {
        stages[STAGE_KEYS[i]] = { status: 'idle', data: null, selections: [], error: null, timestamp: null };
      }
      return { ...state, stages, currentStage: action.stage };
    }

    case 'SET_CURRENT_STAGE':
      return { ...state, currentStage: action.stage };

    case 'SET_PROFILE':
      return { ...state, investorProfile: action.profile };

    default:
      return state;
  }
}

const PipelineContext = createContext(null);

export function PipelineProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Auto-load any existing data files on mount
  useEffect(() => {
    async function loadExisting() {
      for (const key of STAGE_KEYS) {
        try {
          const resp = await fetch(`${import.meta.env.BASE_URL}data/${key}.json?t=${Date.now()}`);
          if (resp.ok) {
            const data = await resp.json();
            dispatch({ type: 'STAGE_COMPLETE', stage: key, data });
          }
        } catch {}
      }
    }
    loadExisting();
  }, []);

  return (
    <PipelineContext.Provider value={{ state, dispatch }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used within PipelineProvider');
  return ctx;
}

export function useStageData(stageKey) {
  const { state } = usePipeline();
  return state.stages[stageKey];
}

export function useUpstreamData(stageKey) {
  const { state } = usePipeline();
  const idx = STAGE_KEYS.indexOf(stageKey);
  const upstream = {};
  for (let i = 0; i < idx; i++) {
    upstream[STAGE_KEYS[i]] = state.stages[STAGE_KEYS[i]];
  }
  return upstream;
}
