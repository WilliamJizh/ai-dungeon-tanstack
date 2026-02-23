import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { VNPackage } from '../../server/vn/types/vnTypes';

interface VNState {
  isHydrated: boolean;
  sessionId: string;
  vnPackage: VNPackage | null;
  currentNodeId: string | null;
  completedNodes: string[];
}

type VNAction =
  | { type: 'SET_PACKAGE'; payload: VNPackage }
  | { type: 'SET_NODE'; payload: string }
  | { type: 'ADVANCE_NODE'; payload: string }
  | { type: 'COMPLETE_NODE'; payload: string }
  | { type: 'RESET' };

const VN_SESSION_KEY = 'vn-session-id';
const VN_STATE_KEY = 'vn-state-v1';

interface PersistedVNState {
  vnPackage: VNPackage | null;
  currentNodeId: string | null;
  completedNodes: string[];
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
  if (!Array.isArray(value.plot.nodes) || value.plot.nodes.length === 0) return false;
  if (!isObjectRecord(value.assets)) return false;
  return true;
}

function normalizeNodePointer(
  pkg: VNPackage,
  nodeId: string | null,
): string | null {
  const firstNode = pkg.plot.nodes[0];

  if (!firstNode) {
    return null;
  }

  if (!nodeId) {
    return firstNode.id;
  }

  const matchNode = pkg.plot.nodes.find((n: any) => n.id === nodeId);
  if (!matchNode) {
    return firstNode.id;
  }

  return nodeId;
}

function sanitizeCompletedNodes(input: unknown): string[] {
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
    currentNodeId: null,
    completedNodes: [],
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

    const pointer = normalizeNodePointer(pkg, parsed.currentNodeId);
    const hydratedState: VNState = {
      ...baseState,
      vnPackage: pkg,
      currentNodeId: pointer,
      completedNodes: sanitizeCompletedNodes(parsed.completedNodes),
    };

    devLog('Hydrated VN state', {
      packageId: hydratedState.vnPackage?.id,
      currentNodeId: hydratedState.currentNodeId,
      completedNodes: hydratedState.completedNodes.length,
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
      const firstNode = pkg.plot.nodes[0];
      return {
        ...state,
        vnPackage: pkg,
        currentNodeId: firstNode?.id ?? null,
        completedNodes: [],
      };
    }
    case 'SET_NODE':
      return {
        ...state,
        currentNodeId: action.payload,
      };
    case 'ADVANCE_NODE': {
      const nextNodeId = action.payload;
      return {
        ...state,
        currentNodeId: nextNodeId,
        completedNodes: state.currentNodeId
          ? [...state.completedNodes, state.currentNodeId]
          : state.completedNodes,
      };
    }
    case 'COMPLETE_NODE':
      return {
        ...state,
        completedNodes: [...state.completedNodes, action.payload],
      };
    case 'RESET':
      return {
        ...state,
        vnPackage: null,
        currentNodeId: null,
        completedNodes: [],
      };
    default:
      return state;
  }
}

interface VNContextValue extends VNState {
  setPackage: (pkg: VNPackage) => void;
  setNode: (nodeId: string) => void;
  advanceNode: (nextNodeId: string) => void;
  completeNode: (nodeId: string) => void;
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
      currentNodeId: state.currentNodeId,
      completedNodes: state.completedNodes,
    };
    try {
      storage.setItem(VN_STATE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      devLog('Failed to persist VN state snapshot', err);
    }
  }, [state.vnPackage, state.currentNodeId, state.completedNodes]);

  const value: VNContextValue = {
    ...state,
    setPackage: (pkg) => dispatch({ type: 'SET_PACKAGE', payload: pkg }),
    setNode: (nodeId) => dispatch({ type: 'SET_NODE', payload: nodeId }),
    advanceNode: (nextNodeId) => dispatch({ type: 'ADVANCE_NODE', payload: nextNodeId }),
    completeNode: (nodeId) => dispatch({ type: 'COMPLETE_NODE', payload: nodeId }),
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
