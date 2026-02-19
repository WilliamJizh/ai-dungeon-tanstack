import { describe, it, expect } from 'vitest'
import { parseAgentJSON } from '../server/agents/agentLoop'
import { AgentError } from '../server/agents/types'
import type {
  StoryTurnOutput,
  DirectorOutput,
  WorldState,
} from '../server/agents/types'

describe('StoryTurnOutput contract', () => {
  const VALID_WORLD_STATE: WorldState = {
    location: 'Dark Forest',
    playerInventory: ['torch', 'map'],
    playerStatus: 'healthy',
    activeCharacters: { 'Old Hermit': 'neutral' },
    flags: { metHermit: true },
    recentEvents: ['Entered the forest'],
    turnCount: 3,
  }

  const VALID_OUTPUT: StoryTurnOutput = {
    scene: 'The hermit eyes you suspiciously from his doorway.',
    choices: ['Greet him politely', 'Ask about the path', 'Walk past him'],
    stateSummary: 'Location: Dark Forest. Status: healthy. Carrying torch.',
    debug: {
      turnId: 'abc-123',
      agentsUsed: ['story-director', 'narrator', 'world-state-manager'],
      worldState: VALID_WORLD_STATE,
      stepTimings: { 'story-director': 450, narrator: 380 },
    },
  }

  it('has scene as non-empty string', () => {
    expect(typeof VALID_OUTPUT.scene).toBe('string')
    expect(VALID_OUTPUT.scene.length).toBeGreaterThan(0)
  })

  it('has choices as tuple of exactly 3 strings', () => {
    expect(Array.isArray(VALID_OUTPUT.choices)).toBe(true)
    expect(VALID_OUTPUT.choices).toHaveLength(3)
    for (const choice of VALID_OUTPUT.choices) {
      expect(typeof choice).toBe('string')
      expect(choice.length).toBeGreaterThan(0)
    }
  })

  it('has stateSummary as non-empty string', () => {
    expect(typeof VALID_OUTPUT.stateSummary).toBe('string')
    expect(VALID_OUTPUT.stateSummary.length).toBeGreaterThan(0)
  })

  it('debug.turnId is a string', () => {
    expect(typeof VALID_OUTPUT.debug.turnId).toBe('string')
    expect(VALID_OUTPUT.debug.turnId.length).toBeGreaterThan(0)
  })

  it('debug.agentsUsed is a non-empty array', () => {
    expect(Array.isArray(VALID_OUTPUT.debug.agentsUsed)).toBe(true)
    expect(VALID_OUTPUT.debug.agentsUsed.length).toBeGreaterThan(0)
    for (const agent of VALID_OUTPUT.debug.agentsUsed) {
      expect(typeof agent).toBe('string')
    }
  })

  it('debug.worldState has all required fields', () => {
    const ws = VALID_OUTPUT.debug.worldState
    expect(typeof ws.location).toBe('string')
    expect(Array.isArray(ws.playerInventory)).toBe(true)
    expect(typeof ws.playerStatus).toBe('string')
    expect(typeof ws.activeCharacters).toBe('object')
    expect(typeof ws.flags).toBe('object')
    expect(Array.isArray(ws.recentEvents)).toBe(true)
    expect(typeof ws.turnCount).toBe('number')
  })

  it('debug.stepTimings is a Record<string, number>', () => {
    const timings = VALID_OUTPUT.debug.stepTimings
    expect(typeof timings).toBe('object')
    expect(timings).not.toBeNull()
    for (const [key, value] of Object.entries(timings)) {
      expect(typeof key).toBe('string')
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('DirectorOutput contract', () => {
  const VALID_DIRECTOR: DirectorOutput = {
    storyBeat: 'The player discovers a hidden passage behind the bookshelf.',
    choices: ['Enter the passage', 'Close the bookshelf', 'Call for help'],
    stateChanges: {
      newLocation: 'Hidden Passage',
      addInventory: ['rusty key'],
      flagChanges: { foundPassage: true },
      newEvent: 'Discovered hidden passage',
    },
  }

  it('validates storyBeat, choices, stateChanges', () => {
    expect(typeof VALID_DIRECTOR.storyBeat).toBe('string')
    expect(VALID_DIRECTOR.storyBeat.length).toBeGreaterThan(0)
    expect(Array.isArray(VALID_DIRECTOR.choices)).toBe(true)
    expect(VALID_DIRECTOR.choices).toHaveLength(3)
    expect(typeof VALID_DIRECTOR.stateChanges).toBe('object')
    expect(VALID_DIRECTOR.stateChanges).not.toBeNull()
    expect(Array.isArray(VALID_DIRECTOR.stateChanges)).toBe(false)
  })

  it('choices must be array of 3 strings', () => {
    for (const choice of VALID_DIRECTOR.choices) {
      expect(typeof choice).toBe('string')
      expect(choice.length).toBeGreaterThan(0)
    }
  })

  it('stateChanges fields are all optional', () => {
    const minimalDirector: DirectorOutput = {
      storyBeat: 'Nothing happens.',
      choices: ['Wait', 'Leave', 'Look around'],
      stateChanges: {},
    }
    expect(minimalDirector.stateChanges.newLocation).toBeUndefined()
    expect(minimalDirector.stateChanges.addInventory).toBeUndefined()
    expect(minimalDirector.stateChanges.removeInventory).toBeUndefined()
    expect(minimalDirector.stateChanges.flagChanges).toBeUndefined()
    expect(minimalDirector.stateChanges.newCharacters).toBeUndefined()
    expect(minimalDirector.stateChanges.newEvent).toBeUndefined()
    expect(minimalDirector.stateChanges.newPlayerStatus).toBeUndefined()
  })

  it('stateChanges accepts newPlayerStatus', () => {
    const director: DirectorOutput = {
      storyBeat: 'The arrow strikes true — you are injured.',
      choices: ['Find shelter', 'Drink a potion', 'Fight through the pain'],
      stateChanges: { newPlayerStatus: 'injured' },
    }
    expect(director.stateChanges.newPlayerStatus).toBe('injured')
  })
})

describe('parseAgentJSON', () => {
  it('parses clean JSON', () => {
    const raw = '{"name":"test","value":42}'
    const result = parseAgentJSON<{ name: string; value: number }>(
      raw,
      'test-agent',
    )
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('strips ```json code fences', () => {
    const raw = '```json\n{"storyBeat":"hello"}\n```'
    const result = parseAgentJSON<{ storyBeat: string }>(raw, 'test-agent')
    expect(result).toEqual({ storyBeat: 'hello' })
  })

  it('strips plain ``` code fences', () => {
    const raw = '```\n{"scene":"A dark room."}\n```'
    const result = parseAgentJSON<{ scene: string }>(raw, 'test-agent')
    expect(result).toEqual({ scene: 'A dark room.' })
  })

  it('throws AgentError for invalid JSON', () => {
    const raw = 'not valid json at all'
    expect(() => parseAgentJSON(raw, 'test-agent')).toThrow(AgentError)
  })

  it('exposes agentId on AgentError', () => {
    try {
      parseAgentJSON('bad json', 'my-agent')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError)
      expect((err as AgentError).agentId).toBe('my-agent')
    }
  })

  it('exposes raw text on AgentError', () => {
    const rawInput = '{ broken json'
    try {
      parseAgentJSON(rawInput, 'parse-agent')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError)
      expect((err as AgentError).raw).toBe(rawInput)
    }
  })
})
