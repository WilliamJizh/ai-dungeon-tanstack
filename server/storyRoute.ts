import { Router, type Request, type Response } from 'express'
import { runStoryTurn } from './workflows/storyTurn.js'
import { AgentError } from './agents/types.js'
import type { StoryTurnInput } from './agents/types.js'

export const storyRouter = Router()

storyRouter.post('/step', async (req: Request, res: Response) => {
  const body = req.body as StoryTurnInput & {
    history?: Array<{ type: 'ai' | 'player'; content: string }>
  }

  if (!body.worldSetup || typeof body.worldSetup !== 'string') {
    res.status(400).json({ error: 'worldSetup is required' })
    return
  }

  try {
    const result = await runStoryTurn({
      sessionId: body.sessionId ?? 'default',
      worldSetup: body.worldSetup,
      playerAction: body.playerAction ?? '',
      history: body.history ?? [],
    })
    res.json(result)
  } catch (err) {
    if (err instanceof AgentError) {
      console.error(
        `[story/step] AgentError in ${err.agentId}:`,
        err.message,
        err.raw ? `\nRaw: ${err.raw}` : '',
      )
      res.status(502).json({
        error: 'Agent response malformed',
        detail: err.message,
      })
      return
    }
    console.error('[story/step] Error:', err)
    res.status(500).json({ error: 'Story generation failed' })
  }
})
