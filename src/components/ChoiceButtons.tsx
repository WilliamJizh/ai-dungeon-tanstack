interface ChoiceButtonsProps {
  choices: [string, string, string]
  onChoose: (choice: string) => void
  disabled: boolean
}

export function ChoiceButtons({ choices, onChoose, disabled }: ChoiceButtonsProps) {
  return (
    <nav className="choices-nav" aria-label="Available choices">
      <p className="choices-label">What do you do?</p>
      <div className="choices-grid">
        {choices.map((choice, idx) => (
          <button
            key={idx}
            className="btn btn-choice"
            disabled={disabled}
            onClick={() => onChoose(choice)}
          >
            <span className="choice-index">{idx + 1}</span>
            <span className="choice-text">{choice}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
