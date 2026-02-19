import type { GameSession } from '../types/story'

const STORAGE_KEY = 'ai-dungeon-sessions'

export function loadSessions(): GameSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as GameSession[]
  } catch {
    return []
  }
}

export function loadSession(id: string): GameSession | null {
  const sessions = loadSessions()
  return sessions.find((s) => s.id === id) ?? null
}

export function saveSession(session: GameSession): void {
  const sessions = loadSessions().filter((s) => s.id !== session.id)
  sessions.unshift({ ...session, updatedAt: Date.now() })
  // Keep max 20 sessions
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)))
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}
