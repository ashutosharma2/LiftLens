import type { HistoryItem } from '../api/client'

function shortDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * A small line of the stored shoulder-to-waist ratios, latest point in lime.
 * It only plots stored values (scoring stays on the server). The caller passes
 * scored check-ins only and shows it from two of them.
 */
export function Sparkline({ items, className = '' }: { items: HistoryItem[]; className?: string }) {
  const times = items.map((i) => new Date(i.timestamp).getTime())
  const values = items.map((i) => i.shoulderToWaist)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const tMin = Math.min(...times)
  const tSpan = Math.max(...times) - tMin || 1

  // Percent positions with a small margin so the end dot isn't clipped; a flat series sits in the middle.
  const x = (t: number) => 4 + ((t - tMin) / tSpan) * 92
  const y = (v: number) => (high === low ? 50 : 10 + ((high - v) / (high - low)) * 80)
  const points = items.map((_, i) => ({ left: x(times[i]), top: y(values[i]) }))
  const last = points[points.length - 1]

  const first = items[0]
  const latest = items[items.length - 1]
  const label =
    `Trend over ${items.length} check-ins, flagged photos left out: from ${first.shoulderToWaist.toFixed(2)} on ${shortDate(first.timestamp)} ` +
    `to ${latest.shoulderToWaist.toFixed(2)} on ${shortDate(latest.timestamp)}`

  return (
    <div role="img" aria-label={label} className={`relative ${className}`}>
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <polyline
          points={points.map((p) => `${p.left},${p.top}`).join(' ')}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-graphite-300"
        />
      </svg>
      {/* HTML dot so it stays round when the line is stretched. */}
      <span
        aria-hidden
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal ring-4 ring-signal/20"
        style={{ left: `${last.left}%`, top: `${last.top}%` }}
      />
    </div>
  )
}
