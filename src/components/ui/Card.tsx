import type { LucideIcon } from 'lucide-react'
import IconBadge, { type BadgeTone } from './IconBadge'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padded?: boolean
  hover?: boolean
}

export function Card({ padded = false, hover = false, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-card ${padded ? 'p-5' : ''} ${hover ? 'transition-all hover:shadow-pop hover:border-[var(--color-border-hover)]' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

type SectionCardProps = {
  title: string
  icon?: LucideIcon
  iconTone?: BadgeTone
  action?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function SectionCard({ title, icon, iconTone = 'neutral', action, className = '', bodyClassName = '', children }: SectionCardProps) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="flex items-center gap-2.5 px-5 py-4">
        {icon && <IconBadge icon={icon} tone={iconTone} size="sm" />}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className={bodyClassName || 'px-5 pb-5'}>
        {children}
      </div>
    </Card>
  )
}
