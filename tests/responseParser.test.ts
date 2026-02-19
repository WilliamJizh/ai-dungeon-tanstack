import { describe, it, expect } from 'vitest'
import { parseAIResponse, ParseError } from '../src/lib/responseParser'

const VALID_RESPONSE = JSON.stringify({
  scene: 'You stand at the edge of a dark forest. Ancient trees loom overhead, their gnarled branches forming a canopy that blocks out most of the moonlight.',
  choices: [
    'Step into the forest cautiously',
    'Call out to see if anyone is there',
    'Turn back and find another path',
  ],
  stateSummary: 'Location: Forest edge. Items: lantern, map. Status: cautious.',
})

describe('parseAIResponse', () => {
  it('parses a valid JSON response', () => {
    const result = parseAIResponse(VALID_RESPONSE)
    expect(result.scene).toContain('dark forest')
    expect(result.choices).toHaveLength(3)
    expect(result.stateSummary).toContain('Forest edge')
  })

  it('strips markdown code fences before parsing', () => {
    const wrapped = '```json\n' + VALID_RESPONSE + '\n```'
    const result = parseAIResponse(wrapped)
    expect(result.scene).toBeTruthy()
    expect(result.choices).toHaveLength(3)
  })

  it('strips plain code fences before parsing', () => {
    const wrapped = '```\n' + VALID_RESPONSE + '\n```'
    const result = parseAIResponse(wrapped)
    expect(result.scene).toBeTruthy()
  })

  it('trims whitespace from fields', () => {
    const raw = JSON.stringify({
      scene: '  A misty valley.  ',
      choices: ['  Run away  ', '  Hide  ', '  Fight  '],
      stateSummary: '  Safe for now.  ',
    })
    const result = parseAIResponse(raw)
    expect(result.scene).toBe('A misty valley.')
    expect(result.choices[0]).toBe('Run away')
    expect(result.stateSummary).toBe('Safe for now.')
  })

  it('throws ParseError for invalid JSON', () => {
    expect(() => parseAIResponse('not json at all')).toThrow(ParseError)
    expect(() => parseAIResponse('not json at all')).toThrow('Failed to parse JSON')
  })

  it('throws ParseError when scene is missing', () => {
    const raw = JSON.stringify({
      choices: ['A', 'B', 'C'],
      stateSummary: 'ok',
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
  })

  it('throws ParseError when scene is empty string', () => {
    const raw = JSON.stringify({
      scene: '   ',
      choices: ['A', 'B', 'C'],
      stateSummary: 'ok',
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
  })

  it('throws ParseError when choices has fewer than 3 items', () => {
    const raw = JSON.stringify({
      scene: 'A scene.',
      choices: ['only one'],
      stateSummary: 'ok',
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
    expect(() => parseAIResponse(raw)).toThrow('exactly 3')
  })

  it('throws ParseError when choices has more than 3 items', () => {
    const raw = JSON.stringify({
      scene: 'A scene.',
      choices: ['A', 'B', 'C', 'D'],
      stateSummary: 'ok',
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
  })

  it('throws ParseError when a choice is an empty string', () => {
    const raw = JSON.stringify({
      scene: 'A scene.',
      choices: ['A', '', 'C'],
      stateSummary: 'ok',
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
  })

  it('throws ParseError when stateSummary is missing', () => {
    const raw = JSON.stringify({
      scene: 'A scene.',
      choices: ['A', 'B', 'C'],
    })
    expect(() => parseAIResponse(raw)).toThrow(ParseError)
  })

  it('throws ParseError when response is not an object', () => {
    expect(() => parseAIResponse('"just a string"')).toThrow(ParseError)
    expect(() => parseAIResponse('42')).toThrow(ParseError)
    expect(() => parseAIResponse('null')).toThrow(ParseError)
  })

  it('exposes raw text on ParseError', () => {
    const badRaw = 'totally bad'
    try {
      parseAIResponse(badRaw)
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      expect((e as ParseError).raw).toBe(badRaw)
    }
  })
})
