export type ProgressTone = 'red' | 'orange' | 'green' | 'blue' | 'purple' | 'neutral'

const FILL: Record<ProgressTone, string> = {
  red:     'var(--color-accent)',
  orange:  'var(--ds-warn-accent)',
  green:   'var(--ds-success-accent)',
  blue:    'var(--ds-info-accent)',
  purple:  'var(--ds-purple-accent)',
  neutral: 'var(--color-text-muted)',
}

type Props = {
  value: number
  max?: number
  tone?: ProgressTone
  height?: number
  className?: string
}

export default function ProgressBar({ value, max = 100, tone = 'red', height = 6, className = '' }: Props) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className={`w-full rounded-full overflow-hidden bg-[var(--color-bg-subtle)] ${className}`}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: FILL[tone] }}
      />
    </div>
  )
}
