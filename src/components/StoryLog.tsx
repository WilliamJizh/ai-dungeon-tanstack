import type { StoryStep } from '../types/story'

interface StoryLogProps {
  steps: StoryStep[]
}

export function StoryLog({ steps }: StoryLogProps) {
  if (steps.length === 0) {
    return (
      <div className="story-log story-log--empty">
        <p className="story-log-empty-text">Your adventure is about to begin…</p>
      </div>
    )
  }

  return (
    <div className="story-log" role="log" aria-live="polite" aria-label="Story log">
      {steps.map((step) =>
        step.type === 'ai' ? (
          <AiStep key={step.id} step={step} />
        ) : (
          <PlayerStep key={step.id} step={step} />
        ),
      )}
    </div>
  )
}

function AiStep({ step }: { step: StoryStep }) {
  // Render paragraphs split by double newline
  const paragraphs = step.content
    .split(/\n\n+/)
    .filter(Boolean)

  return (
    <article className="story-entry story-entry--ai">
      <div className="story-entry-icon" aria-hidden="true">
        📖
      </div>
      <div className="story-entry-body">
        {paragraphs.map((p, i) => (
          <p key={i} className="story-paragraph">
            {p}
          </p>
        ))}
      </div>
    </article>
  )
}

function PlayerStep({ step }: { step: StoryStep }) {
  return (
    <article className="story-entry story-entry--player">
      <div className="story-entry-icon" aria-hidden="true">
        ⚔️
      </div>
      <div className="story-entry-body">
        <p className="story-paragraph story-paragraph--action">{step.content}</p>
      </div>
    </article>
  )
}
