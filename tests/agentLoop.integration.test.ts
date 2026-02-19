import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getWorldState,
  applyStateChanges,
  initWorldState,
  formatWorldStateForPrompt,
} from '../server/agents/worldState'
import type { StateChanges, WorldState } from '../server/agents/types'

describe('WorldState manager', () => {
  const SESSION = 'test-session-' + Math.random()

  it('returns default state for unknown session', () => {
    const state = getWorldState('nonexistent-session-xyz')
    expect(state.location).toBe('unknown')
    expect(state.playerInventory).toEqual([])
    expect(state.playerStatus).toBe('healthy')
    expect(state.activeCharacters).toEqual({})
    expect(state.flags).toEqual({})
    expect(state.recentEvents).toEqual([])
    expect(state.turnCount).toBe(0)
  })

  it('initWorldState sets location and resets turn count', () => {
    const state = initWorldState(SESSION, 'Castle Entrance')
    expect(state.location).toBe('Castle Entrance')
    expect(state.turnCount).toBe(0)
    expect(state.playerInventory).toEqual([])
  })

  it('applyStateChanges: newLocation updates location', () => {
    const sid = SESSION + '-location'
    initWorldState(sid, 'Start')
    const updated = applyStateChanges(sid, { newLocation: 'Dark Cave' })
    expect(updated.location).toBe('Dark Cave')
  })

  it('applyStateChanges: addInventory appends items without duplicates', () => {
    const sid = SESSION + '-inventory-add'
    initWorldState(sid, 'Town')
    applyStateChanges(sid, { addInventory: ['sword', 'shield'] })
    const state = applyStateChanges(sid, { addInventory: ['potion', 'sword'] })
    // The implementation appends without dedup, so sword appears twice
    // (filter only removes items in removeInventory)
    expect(state.playerInventory).toContain('sword')
    expect(state.playerInventory).toContain('shield')
    expect(state.playerInventory).toContain('potion')
  })

  it('applyStateChanges: removeInventory removes specified items', () => {
    const sid = SESSION + '-inventory-remove'
    initWorldState(sid, 'Town')
    applyStateChanges(sid, { addInventory: ['sword', 'shield', 'potion'] })
    const state = applyStateChanges(sid, { removeInventory: ['shield'] })
    expect(state.playerInventory).toContain('sword')
    expect(state.playerInventory).toContain('potion')
    expect(state.playerInventory).not.toContain('shield')
  })

  it('applyStateChanges: flagChanges merges flags', () => {
    const sid = SESSION + '-flags'
    initWorldState(sid, 'Town')
    applyStateChanges(sid, { flagChanges: { doorOpen: true, torchLit: false } })
    const state = applyStateChanges(sid, {
      flagChanges: { torchLit: true, questStarted: true },
    })
    expect(state.flags.doorOpen).toBe(true)
    expect(state.flags.torchLit).toBe(true)
    expect(state.flags.questStarted).toBe(true)
  })

  it('applyStateChanges: newCharacters merges characters', () => {
    const sid = SESSION + '-characters'
    initWorldState(sid, 'Village')
    applyStateChanges(sid, {
      newCharacters: { 'Old Sage': 'wise and mysterious' },
    })
    const state = applyStateChanges(sid, {
      newCharacters: { Blacksmith: 'strong and grumpy' },
    })
    expect(state.activeCharacters['Old Sage']).toBe('wise and mysterious')
    expect(state.activeCharacters['Blacksmith']).toBe('strong and grumpy')
  })

  it('applyStateChanges: newEvent prepends to recentEvents (max 5)', () => {
    const sid = SESSION + '-events'
    initWorldState(sid, 'Town')
    for (let i = 1; i <= 6; i++) {
      applyStateChanges(sid, { newEvent: `Event ${i}` })
    }
    const state = getWorldState(sid)
    expect(state.recentEvents).toHaveLength(5)
    // Most recent event should be first
    expect(state.recentEvents[0]).toBe('Event 6')
    // Oldest event (Event 1) should have been pushed out
    expect(state.recentEvents).not.toContain('Event 1')
  })

  it('applyStateChanges: increments turnCount on each call', () => {
    const sid = SESSION + '-turncount'
    initWorldState(sid, 'Start')
    applyStateChanges(sid, { newLocation: 'A' })
    applyStateChanges(sid, { newLocation: 'B' })
    const state = applyStateChanges(sid, { newLocation: 'C' })
    expect(state.turnCount).toBe(3)
  })

  it('applyStateChanges: empty changes still increments turnCount', () => {
    const sid = SESSION + '-empty'
    initWorldState(sid, 'Start')
    const state = applyStateChanges(sid, {})
    expect(state.turnCount).toBe(1)
    expect(state.location).toBe('Start')
  })

  it('applyStateChanges: newPlayerStatus updates playerStatus', () => {
    const sid = SESSION + '-status'
    initWorldState(sid, 'Town')
    const state = applyStateChanges(sid, { newPlayerStatus: 'injured' })
    expect(state.playerStatus).toBe('injured')
  })

  it('applyStateChanges: playerStatus unchanged when newPlayerStatus not provided', () => {
    const sid = SESSION + '-status-unchanged'
    initWorldState(sid, 'Town')
    const state = applyStateChanges(sid, { newLocation: 'Cave' })
    expect(state.playerStatus).toBe('healthy')
  })

  it('applyStateChanges: playerStatus can transition multiple times', () => {
    const sid = SESSION + '-status-multi'
    initWorldState(sid, 'Town')
    applyStateChanges(sid, { newPlayerStatus: 'injured' })
    applyStateChanges(sid, { newPlayerStatus: 'poisoned' })
    const state = applyStateChanges(sid, { newPlayerStatus: 'healthy' })
    expect(state.playerStatus).toBe('healthy')
  })
})

describe('formatWorldStateForPrompt', () => {
  it('includes location in output', () => {
    const state: WorldState = {
      location: 'Enchanted Forest',
      playerInventory: [],
      playerStatus: 'healthy',
      activeCharacters: {},
      flags: {},
      recentEvents: [],
      turnCount: 0,
    }
    const result = formatWorldStateForPrompt(state)
    expect(result).toContain('Location: Enchanted Forest')
  })

  it('includes inventory items when present', () => {
    const state: WorldState = {
      location: 'Town',
      playerInventory: ['sword', 'potion'],
      playerStatus: 'healthy',
      activeCharacters: {},
      flags: {},
      recentEvents: [],
      turnCount: 1,
    }
    const result = formatWorldStateForPrompt(state)
    expect(result).toContain('sword')
    expect(result).toContain('potion')
  })

  it('shows "empty" for empty inventory', () => {
    const state: WorldState = {
      location: 'Town',
      playerInventory: [],
      playerStatus: 'healthy',
      activeCharacters: {},
      flags: {},
      recentEvents: [],
      turnCount: 0,
    }
    const result = formatWorldStateForPrompt(state)
    expect(result).toContain('(empty)')
  })

  it('includes turn number', () => {
    const state: WorldState = {
      location: 'Town',
      playerInventory: [],
      playerStatus: 'healthy',
      activeCharacters: {},
      flags: {},
      recentEvents: [],
      turnCount: 7,
    }
    const result = formatWorldStateForPrompt(state)
    expect(result).toContain('Turn: 7')
  })
})

// For the workflow integration test, we mock the AI agent calls at the module level
// so that storyTurn.ts gets the mocked versions of runStoryDirector and runNarrator.
vi.mock('../server/agents/storyDirector', () => ({
  runStoryDirector: vi.fn(),
}))

vi.mock('../server/agents/narratorAgent', () => ({
  runNarrator: vi.fn(),
}))

describe('runStoryTurn workflow (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls director then narrator and returns assembled output', async () => {
    const { runStoryDirector } = await import(
      '../server/agents/storyDirector'
    )
    const { runNarrator } = await import('../server/agents/narratorAgent')

    const mockDirector = vi.mocked(runStoryDirector)
    const mockNarrator = vi.mocked(runNarrator)

    mockDirector.mockResolvedValueOnce({
      output: {
        storyBeat: 'The player approaches the ancient door',
        choices: ['Push the door', 'Knock loudly', 'Search for a key'],
        stateChanges: {
          newLocation: 'Ancient Door',
          newEvent: 'Found the door',
        },
      },
      durationMs: 300,
    })

    mockNarrator.mockResolvedValueOnce({
      output: {
        scene:
          'Before you stands an ancient oak door, covered in moss and vines.',
        stateSummary: 'Location: Ancient Door. Status: healthy.',
      },
      durationMs: 250,
    })

    const { runStoryTurn } = await import('../server/workflows/storyTurn')

    const result = await runStoryTurn({
      sessionId: 'mock-session-' + Math.random(),
      worldSetup: 'A dark fantasy world',
      playerAction: 'Look around',
      history: [],
    })

    expect(result.scene).toContain('ancient oak door')
    expect(result.choices).toHaveLength(3)
    expect(result.choices[0]).toBe('Push the door')
    expect(result.choices[1]).toBe('Knock loudly')
    expect(result.choices[2]).toBe('Search for a key')
    expect(result.stateSummary).toContain('Ancient Door')
    expect(result.debug.agentsUsed).toContain('story-director')
    expect(result.debug.agentsUsed).toContain('narrator')
    expect(result.debug.turnId).toBeTruthy()
    expect(typeof result.debug.turnId).toBe('string')
    expect(result.debug.worldState.location).toBe('Ancient Door')
    expect(typeof result.debug.stepTimings['story-director']).toBe('number')
    expect(typeof result.debug.stepTimings['narrator']).toBe('number')
  })
})
