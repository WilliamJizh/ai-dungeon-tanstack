interface LoadingIndicatorProps {
  label?: string
}

export function LoadingIndicator({ label = 'Loading…' }: LoadingIndicatorProps) {
  return (
    <div className="loading-indicator" role="status" aria-live="polite">
      <div className="loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className="loading-label">{label}</span>
    </div>
  )
}
