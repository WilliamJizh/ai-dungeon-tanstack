import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { VNPackage } from '../../server/vn/types/vnTypes';

interface VNState {
  isHydrated: boolean;
  sessionId: string;
  vnPackage: VNPackage | null;
  currentLocationId: string | null;
  completedLocations: string[];
}

type VNAction =
  | { type: 'SET_PACKAGE'; payload: VNPackage }
  | { type: 'SET_LOCATION'; payload: string }
  | { type: 'ADVANCE_LOCATION'; payload: string }
  | { type: 'COMPLETE_LOCATION'; payload: string }
  | { type: 'RESET' };

const VN_SESSION_KEY = 'vn-session-id';
const VN_STATE_KEY = 'vn-state-v1';

interface PersistedVNState {
  vnPackage: VNPackage | null;
  currentLocationId: string | null;
  completedLocations: string[];
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

function normalizeLocationPointer(
  pkg: VNPackage,
  locationId: string | null,
): string | null {
  const acts = pkg.plot.acts;
  if (!acts || acts.length === 0) return null;

  const firstAct = acts[0];
  if (!firstAct || !firstAct.sandboxLocations || firstAct.sandboxLocations.length === 0) return null;

  const firstLocation = firstAct.sandboxLocations[0];

  if (!locationId) {
    return firstLocation.id;
  }

  // Deep search across all acts
  for (const act of acts) {
    if (act.sandboxLocations) {
      const match = act.sandboxLocations.find((l: any) => l.id === locationId);
      if (match) return locationId;
    }
  }

  return firstLocation.id;
}

function sanitizeCompletedLocations(input: unknown): string[] {
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
    currentLocationId: null,
    completedLocations: [],
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

    const pointer = normalizeLocationPointer(pkg, parsed.currentLocationId);
    const hydratedState: VNState = {
      ...baseState,
      vnPackage: pkg,
      currentLocationId: pointer,
      completedLocations: sanitizeCompletedLocations(parsed.completedLocations),
    };

    devLog('Hydrated VN state', {
      packageId: hydratedState.vnPackage?.id,
      currentLocationId: hydratedState.currentLocationId,
      completedLocations: hydratedState.completedLocations.length,
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
      const acts = pkg.plot.acts;
      const firstAct = acts ? acts[0] : null;
      const firstLocation = firstAct?.sandboxLocations?.[0];
      return {
        ...state,
        vnPackage: pkg,
        currentLocationId: firstLocation?.id ?? null,
        completedLocations: [],
      };
    }
    case 'SET_LOCATION':
      return {
        ...state,
        currentLocationId: action.payload,
      };
    case 'ADVANCE_LOCATION': {
      const nextLocationId = action.payload;
      return {
        ...state,
        currentLocationId: nextLocationId,
        completedLocations: state.currentLocationId
          ? [...state.completedLocations, state.currentLocationId]
          : state.completedLocations,
      };
    }
    case 'COMPLETE_LOCATION':
      return {
        ...state,
        completedLocations: [...state.completedLocations, action.payload],
      };
    case 'RESET':
      return {
        ...state,
        vnPackage: null,
        currentLocationId: null,
        completedLocations: [],
      };
    default:
      return state;
  }
}

interface VNContextValue extends VNState {
  setPackage: (pkg: VNPackage) => void;
  setLocation: (locationId: string) => void;
  advanceLocation: (nextLocationId: string) => void;
  completeLocation: (locationId: string) => void;
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
      currentLocationId: state.currentLocationId,
      completedLocations: state.completedLocations,
    };
    try {
      storage.setItem(VN_STATE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      devLog('Failed to persist VN state snapshot', err);
    }
  }, [state.vnPackage, state.currentLocationId, state.completedLocations]);

  const value: VNContextValue = {
    ...state,
    setPackage: (pkg) => dispatch({ type: 'SET_PACKAGE', payload: pkg }),
    setLocation: (locationId) => dispatch({ type: 'SET_LOCATION', payload: locationId }),
    advanceLocation: (nextLocationId) => dispatch({ type: 'ADVANCE_LOCATION', payload: nextLocationId }),
    completeLocation: (locationId) => dispatch({ type: 'COMPLETE_LOCATION', payload: locationId }),
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
