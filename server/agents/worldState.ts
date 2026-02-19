import type { WorldState, StateChanges } from './types.js'

const DEFAULT_STATE: WorldState = {
  location: 'unknown',
  playerInventory: [],
  playerStatus: 'healthy',
  activeCharacters: {},
  flags: {},
  recentEvents: [],
  turnCount: 0,
}

const store = new Map<string, WorldState>()

export function getWorldState(sessionId: string): WorldState {
  return store.get(sessionId) ?? { ...DEFAULT_STATE }
}

export function applyStateChanges(
  sessionId: string,
  changes: StateChanges,
): WorldState {
  const current = getWorldState(sessionId)

  const removeSet = new Set(changes.removeInventory ?? [])
  const filteredInventory = current.playerInventory.filter(
    (item) => !removeSet.has(item),
  )

  const newEvents = changes.newEvent
    ? [changes.newEvent, ...current.recentEvents].slice(0, 5)
    : current.recentEvents

  const updated: WorldState = {
    location: changes.newLocation ?? current.location,
    playerInventory: [...filteredInventory, ...(changes.addInventory ?? [])],
    playerStatus: changes.newPlayerStatus ?? current.playerStatus,
    activeCharacters: {
      ...current.activeCharacters,
      ...(changes.newCharacters ?? {}),
    },
    flags: { ...current.flags, ...(changes.flagChanges ?? {}) },
    recentEvents: newEvents,
    turnCount: current.turnCount + 1,
  }

  store.set(sessionId, updated)
  return updated
}

export function initWorldState(
  sessionId: string,
  location?: string,
): WorldState {
  const state: WorldState = {
    ...DEFAULT_STATE,
    location: location ?? DEFAULT_STATE.location,
  }
  store.set(sessionId, state)
  return state
}

export function formatWorldStateForPrompt(state: WorldState): string {
  const lines = [
    `Location: ${state.location}`,
    `Inventory: ${state.playerInventory.length > 0 ? state.playerInventory.join(', ') : '(empty)'}`,
    `Status: ${state.playerStatus}`,
    `Turn: ${state.turnCount}`,
  ]

  const charEntries = Object.entries(state.activeCharacters)
  if (charEntries.length > 0) {
    lines.push(
      `Characters: ${charEntries.map(([name, desc]) => `${name} (${desc})`).join(', ')}`,
    )
  }

  const activeFlags = Object.entries(state.flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (activeFlags.length > 0) {
    lines.push(`Active flags: ${activeFlags.join(', ')}`)
  }

  if (state.recentEvents.length > 0) {
    lines.push(`Recent events: ${state.recentEvents.join('; ')}`)
  }

  return lines.join('\n')
}
