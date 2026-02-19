export interface WorldState {
  location: string
  playerInventory: string[]
  playerStatus: string
  activeCharacters: Record<string, string>
  flags: Record<string, boolean>
  recentEvents: string[]
  turnCount: number
}

export interface StateChanges {
  newLocation?: string
  addInventory?: string[]
  removeInventory?: string[]
  flagChanges?: Record<string, boolean>
  newCharacters?: Record<string, string>
  newEvent?: string
  newPlayerStatus?: string
}

export interface AgentConfig {
  id: string
  name: string
  temperature?: number
  maxOutputTokens?: number
}

export interface DirectorOutput {
  storyBeat: string
  choices: [string, string, string]
  stateChanges: StateChanges
}

export interface NarratorOutput {
  scene: string
  stateSummary: string
}

export interface StoryTurnInput {
  sessionId: string
  worldSetup: string
  playerAction: string
  history: Array<{ type: 'ai' | 'player'; content: string }>
}

export interface StoryTurnOutput {
  scene: string
  choices: [string, string, string]
  stateSummary: string
  debug: {
    turnId: string
    agentsUsed: string[]
    worldState: WorldState
    stepTimings: Record<string, number>
  }
}

export class AgentError extends Error {
  constructor(
    public readonly agentId: string,
    message: string,
    public readonly raw?: string,
  ) {
    super(`[${agentId}] ${message}`)
    this.name = 'AgentError'
  }
}
