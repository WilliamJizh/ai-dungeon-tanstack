import type { KeyboardEvent } from 'react'

interface ActionInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  disabled: boolean
  placeholder?: string
}

export function ActionInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: ActionInputProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSubmit(value)
    }
  }

  return (
    <div className="action-input-container">
      <textarea
        className="action-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? 'Type your action… (Enter to submit)'}
        rows={2}
        maxLength={500}
        aria-label="Player action input"
      />
      <button
        className="btn btn-primary action-submit-btn"
        disabled={disabled || !value.trim()}
        onClick={() => onSubmit(value)}
        aria-label="Submit action"
      >
        {disabled ? '⏳' : '→'}
      </button>
    </div>
  )
}
