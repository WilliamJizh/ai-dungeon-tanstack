import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { loadSession, saveSession } from '../lib/sessionStorage'
import { StoryLog } from '../components/StoryLog'
import { ActionInput } from '../components/ActionInput'
import { ChoiceButtons } from '../components/ChoiceButtons'
import { LoadingIndicator } from '../components/LoadingIndicator'
import type { AIStoryResponse, GameSession, StoryStep, DebugInfo } from '../types/story'

async function fetchStoryStep(
  session: GameSession,
  playerAction: string,
): Promise<AIStoryResponse> {
  const res = await fetch('/api/story/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: session.id,
      worldSetup: session.worldSetup,
      history: session.steps.map((s) => ({ type: s.type, content: s.content })),
      playerAction,
    }),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<AIStoryResponse>
}

export function GameSessionPage() {
  const { sessionId } = useParams({ from: '/game/$sessionId' })
  const navigate = useNavigate()
  const qClient = useQueryClient()
  const logEndRef = useRef<HTMLDivElement>(null)
  const [customAction, setCustomAction] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // Load session from localStorage
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => {
      const s = loadSession(sessionId)
      if (!s) throw new Error('Session not found')
      return s
    },
    staleTime: Infinity,
  })

  const isOpening = session && session.steps.length === 0

  // Auto-trigger opening scene when session loads with no steps
  const storyMutation = useMutation({
    mutationFn: ({ sess, action }: { sess: GameSession; action: string }) =>
      fetchStoryStep(sess, action),
    onMutate: ({ action }) => {
      setErrorMsg(null)
      if (action) {
        // Optimistically add player step
        qClient.setQueryData<GameSession>(['session', sessionId], (old) => {
          if (!old) return old
          const playerStep: StoryStep = {
            id: uuidv4(),
            type: 'player',
            content: action,
            timestamp: Date.now(),
          }
          const updated = { ...old, steps: [...old.steps, playerStep] }
          saveSession(updated)
          return updated
        })
      }
    },
    onSuccess: (data) => {
      qClient.setQueryData<GameSession>(['session', sessionId], (old) => {
        if (!old) return old
        const aiStep: StoryStep = {
          id: uuidv4(),
          type: 'ai',
          content: data.scene,
          timestamp: Date.now(),
          choices: data.choices,
          stateSummary: data.stateSummary,
          debug: data.debug,
        }
        const updated: GameSession = {
          ...old,
          steps: [...old.steps, aiStep],
          currentChoices: data.choices,
          stateSummary: data.stateSummary,
          updatedAt: Date.now(),
        }
        saveSession(updated)
        return updated
      })
      setCustomAction('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    },
  })

  // Auto-load opening scene
  useEffect(() => {
    if (session && isOpening && !storyMutation.isPending) {
      storyMutation.mutate({ sess: session, action: '' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, isOpening])

  // Auto-scroll to bottom when steps change
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.steps.length, storyMutation.isPending])

  function handleAction(action: string) {
    if (!session || storyMutation.isPending || !action.trim()) return
    storyMutation.mutate({ sess: session, action: action.trim() })
  }

  if (sessionLoading) {
    return (
      <div className="page session-page session-loading">
        <LoadingIndicator label="Loading your adventure…" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="page session-page session-error">
        <p className="error-text">Session not found.</p>
        <button className="btn btn-primary" onClick={() => navigate({ to: '/' })}>
          Return Home
        </button>
      </div>
    )
  }

  const isPending = storyMutation.isPending

  return (
    <div className="page session-page">
      <div className="session-header">
        <div className="session-info">
          <h2 className="session-title">{session.worldName}</h2>
          {session.stateSummary && (
            <p className="session-state-summary">{session.stateSummary}</p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate({ to: '/' })}
        >
          ← Home
        </button>
      </div>

      <div className="story-container">
        <StoryLog steps={session.steps} />

        {isPending && <LoadingIndicator label="The story unfolds…" />}

        {errorMsg && (
          <div className="error-banner" role="alert">
            <span>⚠ {errorMsg}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setErrorMsg(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {session.steps.length > 0 && (() => {
          const lastAiStep = [...session.steps].reverse().find(s => s.type === 'ai')
          const debugData = (lastAiStep as any)?.debug as DebugInfo | undefined
          if (!debugData) return null
          return (
            <div className="debug-panel">
              <button
                className="debug-toggle"
                onClick={() => setShowDebug(d => !d)}
                aria-expanded={showDebug}
              >
                {showDebug ? '\u25BE' : '\u25B8'} Debug — Turn {debugData.worldState.turnCount} · {debugData.agentsUsed.join(', ')}
              </button>
              {showDebug && (
                <div className="debug-body">
                  <div className="debug-row">
                    <span className="debug-label">Location</span>
                    <span className="debug-value">{debugData.worldState.location}</span>
                  </div>
                  {debugData.worldState.playerInventory.length > 0 && (
                    <div className="debug-row">
                      <span className="debug-label">Inventory</span>
                      <span className="debug-value">{debugData.worldState.playerInventory.join(', ')}</span>
                    </div>
                  )}
                  {debugData.worldState.recentEvents.length > 0 && (
                    <div className="debug-row">
                      <span className="debug-label">Events</span>
                      <span className="debug-value">{debugData.worldState.recentEvents[0]}</span>
                    </div>
                  )}
                  <div className="debug-row">
                    <span className="debug-label">Timings</span>
                    <span className="debug-value">
                      {Object.entries(debugData.stepTimings)
                        .map(([k, v]) => `${k}: ${v}ms`)
                        .join(' \u00B7 ')}
                    </span>
                  </div>
                  <div className="debug-row">
                    <span className="debug-label">Turn ID</span>
                    <span className="debug-value debug-monospace">{debugData.turnId.slice(0, 8)}\u2026</span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        <div ref={logEndRef} />
      </div>

      {!isPending && session.currentChoices && (
        <ChoiceButtons
          choices={session.currentChoices}
          onChoose={handleAction}
          disabled={isPending}
        />
      )}

      <ActionInput
        value={customAction}
        onChange={setCustomAction}
        onSubmit={handleAction}
        disabled={isPending || isOpening === true}
        placeholder={
          isOpening
            ? 'Starting your adventure…'
            : 'Or type your own action…'
        }
      />
    </div>
  )
}
