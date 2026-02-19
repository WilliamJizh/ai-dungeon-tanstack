import { describe, it, expect } from 'vitest'
import { formatOpeningPrompt, formatStepPrompt } from '../src/lib/promptFormatter'
import type { GameSession } from '../src/types/story'

describe('formatOpeningPrompt', () => {
  it('includes the world setup in the prompt', () => {
    const prompt = formatOpeningPrompt('A dark forest full of ancient magic')
    expect(prompt).toContain('A dark forest full of ancient magic')
  })

  it('includes the JSON schema in the prompt', () => {
    const prompt = formatOpeningPrompt('Test world')
    expect(prompt).toContain('"scene"')
    expect(prompt).toContain('"choices"')
    expect(prompt).toContain('"stateSummary"')
  })

  it('includes safety preamble', () => {
    const prompt = formatOpeningPrompt('Test world')
    expect(prompt).toContain('family-friendly')
  })

  it('instructs to respond with JSON only', () => {
    const prompt = formatOpeningPrompt('Test world')
    expect(prompt.toLowerCase()).toContain('json')
  })
})

describe('formatStepPrompt', () => {
  const baseSession: Pick<GameSession, 'worldSetup' | 'steps'> = {
    worldSetup: 'An enchanted forest where trees walk at night',
    steps: [],
  }

  it('includes the world setup', () => {
    const prompt = formatStepPrompt(baseSession, 'Look around')
    expect(prompt).toContain('An enchanted forest where trees walk at night')
  })

  it('includes the player action', () => {
    const prompt = formatStepPrompt(baseSession, 'Open the mysterious door')
    expect(prompt).toContain('Open the mysterious door')
  })

  it('sanitizes angle brackets in player input', () => {
    const prompt = formatStepPrompt(baseSession, 'Do <script>alert(1)</script>')
    expect(prompt).not.toContain('<script>')
    expect(prompt).not.toContain('</script>')
  })

  it('truncates player input beyond 500 characters', () => {
    const longInput = 'a'.repeat(600)
    const prompt = formatStepPrompt(baseSession, longInput)
    // The action portion should be at most 500 chars
    const match = prompt.match(/The player chooses: "([^"]*)"/)
    expect(match).not.toBeNull()
    expect(match![1].length).toBeLessThanOrEqual(500)
  })

  it('includes history steps in the prompt', () => {
    const sessionWithHistory: Pick<GameSession, 'worldSetup' | 'steps'> = {
      worldSetup: 'Test world',
      steps: [
        { id: '1', type: 'ai', content: 'You see a cave entrance', timestamp: 0 },
        { id: '2', type: 'player', content: 'Enter the cave', timestamp: 0 },
      ],
    }
    const prompt = formatStepPrompt(sessionWithHistory, 'Look inside')
    expect(prompt).toContain('You see a cave entrance')
    expect(prompt).toContain('Enter the cave')
  })

  it('limits history to last 12 steps', () => {
    const steps = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      type: (i % 2 === 0 ? 'ai' : 'player') as 'ai' | 'player',
      content: `Step content ${i}`,
      timestamp: i,
    }))
    const session: Pick<GameSession, 'worldSetup' | 'steps'> = {
      worldSetup: 'Test world',
      steps,
    }
    const prompt = formatStepPrompt(session, 'Continue')
    // Step 0 (first step) should not appear in a 12-step window
    expect(prompt).not.toContain('Step content 0')
    // Step 19 (last step) should appear
    expect(prompt).toContain('Step content 19')
  })
})
