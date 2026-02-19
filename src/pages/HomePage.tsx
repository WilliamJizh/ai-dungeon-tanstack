import { Link, useNavigate } from '@tanstack/react-router'
import { loadSessions, deleteSession } from '../lib/sessionStorage'
import { useMemo, useState } from 'react'
import type { GameSession } from '../types/story'

export function HomePage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<GameSession[]>(() => loadSessions())

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  )

  function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    deleteSession(id)
    setSessions(loadSessions())
  }

  function formatDate(ts: number) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  }

  return (
    <div className="page home-page">
      <div className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <h1 className="hero-title">
          <span className="hero-title-line1">Enter the</span>
          <span className="hero-title-line2">Dungeon</span>
        </h1>
        <p className="hero-subtitle">
          An AI-powered text adventure. Every story is unique — shaped by your choices.
        </p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate({ to: '/new-game' })}
        >
          Begin New Adventure
        </button>
      </div>

      {sortedSessions.length > 0 && (
        <section className="saved-sessions">
          <h2 className="section-title">Continue Your Journey</h2>
          <ul className="session-list">
            {sortedSessions.map((session) => (
              <li key={session.id} className="session-card">
                <Link
                  to="/game/$sessionId"
                  params={{ sessionId: session.id }}
                  className="session-card-link"
                >
                  <div className="session-card-content">
                    <span className="session-world-name">{session.worldName}</span>
                    <span className="session-meta">
                      {session.steps.length} steps · {formatDate(session.updatedAt)}
                    </span>
                    {session.stateSummary && (
                      <span className="session-summary">{session.stateSummary}</span>
                    )}
                  </div>
                  <button
                    className="btn-icon btn-danger-ghost"
                    onClick={(e) => handleDelete(session.id, e)}
                    aria-label={`Delete ${session.worldName}`}
                    title="Delete session"
                  >
                    ✕
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
