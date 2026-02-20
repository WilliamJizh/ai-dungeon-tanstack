import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { VNPackage } from '../../server/vn/types/vnTypes';

interface VNState {
  isHydrated: boolean;
  sessionId: string;
  vnPackage: VNPackage | null;
  currentActId: string | null;
  currentSceneId: string | null;
  completedScenes: string[];
}

type VNAction =
  | { type: 'SET_PACKAGE'; payload: VNPackage }
  | { type: 'SET_SCENE'; payload: { actId: string; sceneId: string } }
  | { type: 'ADVANCE_SCENE'; payload: string }
  | { type: 'COMPLETE_SCENE'; payload: string }
  | { type: 'RESET' };

const VN_SESSION_KEY = 'vn-session-id';
const VN_STATE_KEY = 'vn-state-v1';

interface PersistedVNState {
  vnPackage: VNPackage | null;
  currentActId: string | null;
  currentSceneId: string | null;
  completedScenes: string[];
}

function devLog(message: string, data?: unknown) {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return;
  if (data !== undefined) {
    console.log('[VNContext]', message, data);
  } else {
    console.log('[VNContext]', message);
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getOrCreateSessionId(storage: Storage | null): string {
  if (!storage) return crypto.randomUUID();
  const existing = storage.getItem(VN_SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(VN_SESSION_KEY, id);
  return id;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLikelyVNPackage(value: unknown): value is VNPackage {
  if (!isObjectRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (!isObjectRecord(value.plot)) return false;
  if (!Array.isArray(value.plot.acts) || value.plot.acts.length === 0) return false;
  if (!isObjectRecord(value.assets)) return false;
  return true;
}

function normalizeScenePointer(
  pkg: VNPackage,
  actId: string | null,
  sceneId: string | null,
): { actId: string | null; sceneId: string | null } {
  const firstAct = pkg.plot.acts[0];
  const firstScene = firstAct?.scenes[0];

  if (!firstAct || !firstScene) {
    return { actId: null, sceneId: null };
  }

  if (!actId || !sceneId) {
    return { actId: firstAct.id, sceneId: firstScene.id };
  }

  const matchAct = pkg.plot.acts.find((act) => act.id === actId);
  const matchScene = matchAct?.scenes.find((scene) => scene.id === sceneId);
  if (!matchAct || !matchScene) {
    return { actId: firstAct.id, sceneId: firstScene.id };
  }

  return { actId, sceneId };
}

function sanitizeCompletedScenes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string');
}

function loadInitialState(): VNState {
  const storage = getStorage();
  const sessionId = getOrCreateSessionId(storage);
  const baseState: VNState = {
    isHydrated: true,
    sessionId,
    vnPackage: null,
    currentActId: null,
    currentSceneId: null,
    completedScenes: [],
  };

  if (!storage) {
    devLog('Hydration skipped: localStorage unavailable');
    return baseState;
  }

  const raw = storage.getItem(VN_STATE_KEY);
  if (!raw) {
    devLog('Hydration skipped: no persisted VN state');
    return baseState;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedVNState;
    const pkg = parsed?.vnPackage;
    if (!isLikelyVNPackage(pkg)) {
      storage.removeItem(VN_STATE_KEY);
      devLog('Dropped invalid persisted VN package snapshot');
      return baseState;
    }

    const pointer = normalizeScenePointer(pkg, parsed.currentActId, parsed.currentSceneId);
    const hydratedState: VNState = {
      ...baseState,
      vnPackage: pkg,
      currentActId: pointer.actId,
      currentSceneId: pointer.sceneId,
      completedScenes: sanitizeCompletedScenes(parsed.completedScenes),
    };

    devLog('Hydrated VN state', {
      packageId: hydratedState.vnPackage?.id,
      currentActId: hydratedState.currentActId,
      currentSceneId: hydratedState.currentSceneId,
      completedScenes: hydratedState.completedScenes.length,
    });
    return hydratedState;
  } catch (err) {
    storage.removeItem(VN_STATE_KEY);
    devLog('Failed to parse persisted VN state; cleared snapshot', err);
    return baseState;
  }
}

function vnReducer(state: VNState, action: VNAction): VNState {
  switch (action.type) {
    case 'SET_PACKAGE': {
      const pkg = action.payload;
      const firstAct = pkg.plot.acts[0];
      const firstScene = firstAct?.scenes[0];
      return {
        ...state,
        vnPackage: pkg,
        currentActId: firstAct?.id ?? null,
        currentSceneId: firstScene?.id ?? null,
        completedScenes: [],
      };
    }
    case 'SET_SCENE':
      return {
        ...state,
        currentActId: action.payload.actId,
        currentSceneId: action.payload.sceneId,
      };
    case 'ADVANCE_SCENE': {
      const nextSceneId = action.payload;
      return {
        ...state,
        currentSceneId: nextSceneId,
        completedScenes: state.currentSceneId
          ? [...state.completedScenes, state.currentSceneId]
          : state.completedScenes,
      };
    }
    case 'COMPLETE_SCENE':
      return {
        ...state,
        completedScenes: [...state.completedScenes, action.payload],
      };
    case 'RESET':
      return {
        ...state,
        vnPackage: null,
        currentActId: null,
        currentSceneId: null,
        completedScenes: [],
      };
    default:
      return state;
  }
}

interface VNContextValue extends VNState {
  setPackage: (pkg: VNPackage) => void;
  setScene: (actId: string, sceneId: string) => void;
  advanceScene: (nextSceneId: string) => void;
  completeScene: (sceneId: string) => void;
  reset: () => void;
}

const VNContext = createContext<VNContextValue | null>(null);

export function VNProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(vnReducer, undefined, loadInitialState);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) return;
    const snapshot: PersistedVNState = {
      vnPackage: state.vnPackage,
      currentActId: state.currentActId,
      currentSceneId: state.currentSceneId,
      completedScenes: state.completedScenes,
    };
    try {
      storage.setItem(VN_STATE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      devLog('Failed to persist VN state snapshot', err);
    }
  }, [state.vnPackage, state.currentActId, state.currentSceneId, state.completedScenes]);

  const value: VNContextValue = {
    ...state,
    setPackage: (pkg) => dispatch({ type: 'SET_PACKAGE', payload: pkg }),
    setScene: (actId, sceneId) => dispatch({ type: 'SET_SCENE', payload: { actId, sceneId } }),
    advanceScene: (nextSceneId) => dispatch({ type: 'ADVANCE_SCENE', payload: nextSceneId }),
    completeScene: (sceneId) => dispatch({ type: 'COMPLETE_SCENE', payload: sceneId }),
    reset: () => {
      getStorage()?.removeItem(VN_STATE_KEY);
      dispatch({ type: 'RESET' });
    },
  };

  return <VNContext.Provider value={value}>{children}</VNContext.Provider>;
}

export function useVN(): VNContextValue {
  const ctx = useContext(VNContext);
  if (!ctx) throw new Error('useVN must be used within a VNProvider');
  return ctx;
}
