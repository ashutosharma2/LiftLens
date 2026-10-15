import { useState } from 'react'
import type { HistoryItem } from '../api/client'
import { formatPercent } from './trend'

const STATUS_WORD: Record<HistoryItem['score']['status'], string> = {
  baseline: 'Baseline',
  increased: 'Increased',
  decreased: 'Decreased',
  no_clear_change: 'No clear change',
  flagged: 'Flagged',
}

function shortDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * Shoulder-to-waist over time: a dashed baseline, a shaded noise band and
 * one point per scored check-in (flagged ones are left out by the caller).
 * Lines are SVG stretched to the box; points are HTML buttons so they stay
 * round, can be tapped, and can be reached with the keyboard.
 */
export function TrendChart({
  items,
  baseline,
  noiseThreshold,
}: {
  items: HistoryItem[]
  baseline: number
  /** From the server (0.024 = ±2.4%), so the band always matches the score. */
  noiseThreshold: number
}) {
  const [active, setActive] = useState<number | null>(null)

  const times = items.map((i) => new Date(i.timestamp).getTime())
  const values = items.map((i) => i.shoulderToWaist)
  const bandLow = baseline * (1 - noiseThreshold)
  const bandHigh = baseline * (1 + noiseThreshold)
  const low = Math.min(...values, bandLow)
  const high = Math.max(...values, bandHigh)
  const pad = (high - low) * 0.15
  const yMin = low - pad
  const yMax = high + pad
  const tMin = Math.min(...times)
  const tSpan = Math.max(...times) - tMin || 1

  // Percent positions inside the plot, leaving room so edge points aren't clipped.
  const x = (t: number) => 4 + ((t - tMin) / tSpan) * 92
  const y = (v: number) => ((yMax - v) / (yMax - yMin)) * 100
  const points = items.map((item, i) => ({ item, left: x(times[i]), top: y(values[i]) }))
  const last = points.length - 1

  const first = items[0]
  const latest = items[last]
  const summary =
    `Shoulder-to-waist ratio over ${items.length} check-ins, from ${first.shoulderToWaist.toFixed(2)} on ${shortDate(first.timestamp)} ` +
    `to ${latest.shoulderToWaist.toFixed(2)} on ${shortDate(latest.timestamp)}. ` +
    `The shaded band is ±${+(noiseThreshold * 100).toFixed(1)}% around your baseline of ${baseline.toFixed(2)}.`

  return (
    <figure>
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="flex gap-3">
        <div aria-hidden className="flex w-9 flex-col justify-between py-1 text-right font-mono text-[11px] text-graphite-500">
          <span>{yMax.toFixed(2)}</span>
          <span>{yMin.toFixed(2)}</span>
        </div>
        <div className="relative h-44 flex-1" onMouseLeave={() => setActive(null)}>
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <rect x="0" y={y(bandHigh)} width="100" height={y(bandLow) - y(bandHigh)} className="fill-signal/8" />
            <line
              x1="0"
              x2="100"
              y1={y(baseline)}
              y2={y(baseline)}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              className="stroke-graphite-500"
            />
            <polyline
              points={points.map((p) => `${p.left},${p.top}`).join(' ')}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-graphite-300"
            />
          </svg>
          <span
            aria-hidden
            className="absolute right-0 -translate-y-full pb-0.5 font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            style={{ top: `${y(baseline)}%` }}
          >
            Baseline
          </span>

          {points.map((p, i) => (
            <button
              key={p.item.timestamp}
              type="button"
              aria-label={`${shortDate(p.item.timestamp)}: ${p.item.shoulderToWaist.toFixed(2)}, ${STATUS_WORD[p.item.score.status]}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
            >
              <span
                className={`block rounded-full ${
                  i === last ? 'size-3 bg-signal ring-4 ring-signal/20' : 'size-2.5 border-2 border-graphite-300 bg-graphite-900'
                } ${active === i ? 'scale-125' : ''} transition-transform`}
              />
            </button>
          ))}

          {active !== null && <Tooltip point={points[active]} />}
        </div>
      </div>
      <div aria-hidden className="mt-2 flex justify-between pl-12 font-mono text-[11px] text-graphite-500">
        <span>{shortDate(first.timestamp)}</span>
        <span>{shortDate(latest.timestamp)}</span>
      </div>
    </figure>
  )
}

function Tooltip({ point }: { point: { item: HistoryItem; left: number; top: number } }) {
  const { item } = point
  // Keep the tooltip inside the chart near the left and right edges.
  const align = point.left < 20 ? 'translate-x-0' : point.left > 80 ? '-translate-x-full' : '-translate-x-1/2'
  const below = point.top < 35
  return (
    <div
      role="status"
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-graphite-700 bg-graphite-950 px-3 py-2 shadow-lg ${align} ${
        below ? 'translate-y-4' : '-translate-y-[calc(100%+1rem)]'
      }`}
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
    >
      <p className="text-xs text-graphite-300">{shortDate(item.timestamp)}</p>
      <p className="font-mono text-base text-graphite-100">{item.shoulderToWaist.toFixed(2)}</p>
      <p className="text-xs text-graphite-300">
        {item.isBaseline ? 'Baseline' : `${formatPercent(item.score.value)} vs baseline`}
      </p>
    </div>
  )
}
