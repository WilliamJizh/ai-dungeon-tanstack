import { v4 as uuidv4 } from 'uuid'
import type { StoryTurnInput, StoryTurnOutput } from '../agents/types.js'
import {
  getWorldState,
  applyStateChanges,
  initWorldState,
} from '../agents/worldState.js'
import { runStoryDirector } from '../agents/storyDirector.js'
import { runNarrator } from '../agents/narratorAgent.js'

/**
 * runStoryTurn: Mastra-inspired workflow.
 * Step 1: Story Director (decides beat + stateChanges + choices)
 * Step 2: [parallel] World-State Manager (applies stateChanges) + Narrator (writes prose)
 * Step 3: Assemble StoryTurnOutput with debug info
 */
export async function runStoryTurn(
  input: StoryTurnInput,
): Promise<StoryTurnOutput> {
  const { sessionId, worldSetup, playerAction, history } = input
  const turnId = uuidv4()
  const stepTimings: Record<string, number> = {}

  // If opening scene, reset world state
  if (playerAction === '') {
    initWorldState(sessionId, 'start')
  }

  const worldState = getWorldState(sessionId)

  // Step 1: Story Director
  const director = await runStoryDirector({
    worldSetup,
    playerAction,
    history: history.slice(-10),
    worldState,
  })
  stepTimings['story-director'] = director.durationMs

  // Step 2: Parallel — apply state changes + narrate
  const [updatedWorldState, narrator] = await Promise.all([
    Promise.resolve(
      applyStateChanges(sessionId, director.output.stateChanges),
    ),
    runNarrator({
      worldSetup,
      storyBeat: director.output.storyBeat,
      worldState,
    }),
  ])
  stepTimings['narrator'] = narrator.durationMs

  // Step 3: Assemble output
  return {
    scene: narrator.output.scene,
    choices: director.output.choices,
    stateSummary: narrator.output.stateSummary,
    debug: {
      turnId,
      agentsUsed: ['story-director', 'narrator', 'world-state-manager'],
      worldState: updatedWorldState,
      stepTimings,
    },
  }
}
