export type DonutSegment = { value: number; color: string; label?: string }

type Props = {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  trackColor?: string
  children?: React.ReactNode
}

export default function DonutChart({
  segments,
  size = 160,
  thickness = 16,
  trackColor = 'var(--color-bg-subtle)',
  children,
}: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  let acc = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {total > 0 && segments.map((seg, i) => {
          if (seg.value <= 0) return null
          const frac = seg.value / total
          const len = frac * circ
          const el = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-acc}
              strokeLinecap={frac < 1 ? 'round' : 'butt'}
            />
          )
          acc += len
          return el
        })}
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          {children}
        </div>
      )}
    </div>
  )
}
