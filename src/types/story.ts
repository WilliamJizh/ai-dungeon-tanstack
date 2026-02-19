export interface WorldState {
  location: string
  playerInventory: string[]
  playerStatus: string
  activeCharacters: Record<string, string>
  flags: Record<string, boolean>
  recentEvents: string[]
  turnCount: number
}

export interface DebugInfo {
  turnId: string
  agentsUsed: string[]
  worldState: WorldState
  stepTimings: Record<string, number>
}

export interface AIStoryResponse {
  scene: string
  choices: [string, string, string]
  stateSummary: string
  debug?: DebugInfo
}

export interface StoryStep {
  id: string
  type: 'ai' | 'player'
  content: string
  timestamp: number
  choices?: [string, string, string]
  stateSummary?: string
  debug?: DebugInfo
}

export interface GameSession {
  id: string
  worldSetup: string
  worldName: string
  createdAt: number
  updatedAt: number
  steps: StoryStep[]
  currentChoices: [string, string, string] | null
  stateSummary: string
}

export interface StoryStepRequest {
  sessionId: string
  worldSetup: string
  history: Array<{ type: 'ai' | 'player'; content: string }>
  playerAction: string
}

export interface StoryStepResponse {
  step: StoryStep
  session: GameSession
}
