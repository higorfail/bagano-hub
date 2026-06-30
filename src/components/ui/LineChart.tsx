export type LinePoint = { label: string; value: number }

type Props = {
  data: LinePoint[]
  height?: number
  color?: string
}

const W = 320

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

export default function LineChart({ data, height = 140, color = 'var(--color-accent)' }: Props) {
  const padX = 8
  const padY = 14
  const n = data.length
  const values = data.map(d => d.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const span = max - min || 1

  const pts = data.map((d, i) => ({
    x: n > 1 ? padX + (i * (W - 2 * padX)) / (n - 1) : W / 2,
    y: height - padY - ((d.value - min) / span) * (height - 2 * padY),
  }))

  const line = smoothPath(pts)
  const area = line && `${line} L ${pts[n - 1].x},${height} L ${pts[0].x},${height} Z`
  const last = pts[n - 1]
  const gid = `line-grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <div className="w-full">
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: 'block', height }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {last && (
          <>
            <circle cx={last.x} cy={last.y} r={6} fill={color} opacity={0.18} />
            <circle cx={last.x} cy={last.y} r={3.5} fill={color} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        {data.map((d, i) => {
          const show = data.length <= 8 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0
          return <span key={i} className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">{show ? d.label : ''}</span>
        })}
      </div>
    </div>
  )
}
