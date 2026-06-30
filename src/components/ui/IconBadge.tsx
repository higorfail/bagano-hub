import type { LucideIcon } from 'lucide-react'

export type BadgeTone = 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' | 'neutral'

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  red:     { bg: 'var(--color-accent-bg)', fg: 'var(--color-accent)'     },
  orange:  { bg: 'var(--ds-warn-bg)',      fg: 'var(--ds-warn-accent)'    },
  amber:   { bg: 'var(--ds-caution-bg)',   fg: 'var(--ds-caution-accent)' },
  green:   { bg: 'var(--ds-success-bg)',   fg: 'var(--ds-success-accent)' },
  blue:    { bg: 'var(--ds-info-bg)',      fg: 'var(--ds-info-accent)'    },
  purple:  { bg: 'var(--ds-purple-bg)',    fg: 'var(--ds-purple-accent)'  },
  neutral: { bg: 'var(--color-bg-subtle)', fg: 'var(--color-text-muted)'  },
}

const SIZE = {
  sm: { box: 28, icon: 14, radius: 9 },
  md: { box: 38, icon: 18, radius: 11 },
  lg: { box: 48, icon: 22, radius: 14 },
}

type Props = {
  icon: LucideIcon
  tone?: BadgeTone
  size?: keyof typeof SIZE
  className?: string
}

export default function IconBadge({ icon: Icon, tone = 'neutral', size = 'md', className = '' }: Props) {
  const t = TONE[tone]
  const s = SIZE[size]
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: s.box, height: s.box, borderRadius: s.radius, background: t.bg }}
    >
      <Icon size={s.icon} strokeWidth={2} style={{ color: t.fg }} />
    </div>
  )
}
