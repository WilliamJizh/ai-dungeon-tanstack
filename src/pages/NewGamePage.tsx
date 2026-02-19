import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { saveSession } from '../lib/sessionStorage'
import type { GameSession } from '../types/story'

const WORLD_PRESETS = [
  {
    name: 'Enchanted Forest',
    description:
      'A magical forest where ancient trees whisper secrets and woodland creatures hold the fate of the realm.',
    emoji: '🌲',
  },
  {
    name: 'Lost Space Station',
    description:
      'A derelict orbital station drifting near a mysterious anomaly — you are the only crew member still awake.',
    emoji: '🚀',
  },
  {
    name: 'Sunken Kingdom',
    description:
      'An underwater city lost to the seas centuries ago, now rediscovered — and its ancient guardians still patrol.',
    emoji: '🌊',
  },
  {
    name: 'Sky Pirate Archipelago',
    description:
      'A cluster of floating islands ruled by rival sky pirate clans. You just crash-landed on neutral ground.',
    emoji: '☁️',
  },
]

export function NewGamePage() {
  const navigate = useNavigate()
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customSetup, setCustomSetup] = useState('')
  const [worldName, setWorldName] = useState('')

  const effectiveSetup =
    selectedPreset !== null
      ? WORLD_PRESETS[selectedPreset].description
      : customSetup

  const effectiveName =
    selectedPreset !== null && !worldName
      ? WORLD_PRESETS[selectedPreset].name
      : worldName || 'My Adventure'

  const canStart = effectiveSetup.trim().length >= 10

  function handleStart() {
    if (!canStart) return

    const session: GameSession = {
      id: uuidv4(),
      worldSetup: effectiveSetup.trim(),
      worldName: effectiveName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
      currentChoices: null,
      stateSummary: '',
    }

    saveSession(session)
    navigate({ to: '/game/$sessionId', params: { sessionId: session.id } })
  }

  function handlePresetClick(idx: number) {
    setSelectedPreset(idx === selectedPreset ? null : idx)
    if (idx !== selectedPreset) {
      setCustomSetup('')
    }
  }

  return (
    <div className="page new-game-page">
      <h1 className="page-title">Choose Your World</h1>
      <p className="page-subtitle">Pick a preset or write your own adventure setting.</p>

      <div className="preset-grid">
        {WORLD_PRESETS.map((preset, idx) => (
          <button
            key={preset.name}
            className={`preset-card ${selectedPreset === idx ? 'preset-card--selected' : ''}`}
            onClick={() => handlePresetClick(idx)}
          >
            <span className="preset-emoji">{preset.emoji}</span>
            <span className="preset-name">{preset.name}</span>
            <span className="preset-desc">{preset.description}</span>
          </button>
        ))}
      </div>

      <div className="divider">
        <span>or write your own</span>
      </div>

      <div className="form-group">
        <label htmlFor="world-name" className="form-label">
          Adventure Name
        </label>
        <input
          id="world-name"
          type="text"
          className="form-input"
          placeholder="e.g. The Crimson Peaks"
          value={
            selectedPreset !== null && !worldName
              ? WORLD_PRESETS[selectedPreset].name
              : worldName
          }
          onChange={(e) => setWorldName(e.target.value)}
          maxLength={60}
        />
      </div>

      <div className="form-group">
        <label htmlFor="world-setup" className="form-label">
          World Setup
        </label>
        <textarea
          id="world-setup"
          className="form-textarea"
          placeholder="Describe the world, your character, and the situation you're in…"
          value={
            selectedPreset !== null && !customSetup
              ? WORLD_PRESETS[selectedPreset].description
              : customSetup
          }
          onChange={(e) => {
            setCustomSetup(e.target.value)
            setSelectedPreset(null)
          }}
          rows={4}
          maxLength={800}
        />
        <span className="form-hint">
          {effectiveSetup.trim().length}/800 characters (min 10)
        </span>
      </div>

      <div className="form-actions">
        <button
          className="btn btn-primary btn-lg"
          disabled={!canStart}
          onClick={handleStart}
        >
          Start Adventure →
        </button>
      </div>
    </div>
  )
}
