import { signOut } from 'aws-amplify/auth'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { getHistory, SignedOutError, type History as HistoryData, type HistoryItem } from '../api/client'
import { apiDeps } from '../auth/session'
import { BodyMap } from '../history/BodyMap'
import { changeHeadline, latestSinceLast, scoredItems } from '../history/trend'
import { Sparkline } from '../history/Sparkline'
import { TrendChart } from '../history/TrendChart'
import { Button, Notice, Viewfinder } from '../ui/kit'

const STATUS_LABEL: Record<HistoryItem['score']['status'], string> = {
  baseline: 'Baseline',
  increased: 'Increased',
  decreased: 'Decreased',
  no_clear_change: 'No clear change',
  flagged: 'Flagged',
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function shortDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function Row({ item }: { item: HistoryItem }) {
  const flagged = item.score.status === 'flagged'
  return (
    <li className={`border-b border-graphite-800 py-5 last:border-b-0 ${flagged ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-graphite-300">{formatDate(item.timestamp)}</span>
        <span className="rounded-full border border-graphite-700 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-graphite-300">
          {STATUS_LABEL[item.score.status]}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-medium">{item.shoulderToWaist.toFixed(2)}</p>
      <p className="mt-1 text-sm leading-relaxed text-graphite-300">{item.score.explanation}</p>
    </li>
  )
}

export function History() {
  const navigate = useNavigate()
  const [data, setData] = useState<HistoryData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getHistory(apiDeps)
      .then((history) => !cancelled && setData(history))
      .catch(async (err) => {
        if (cancelled) return
        if (err instanceof SignedOutError) {
          await signOut()
          navigate('/signin?expired=1&next=/history', { replace: true })
          return
        }
        setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const latest = data?.measurements.at(-1)
  const scored = data ? scoredItems(data.measurements) : []
  const since = data ? latestSinceLast(data.measurements) : null
  // The ok check-in before the latest one, for the date range only; the change itself comes from the server.
  const previous = since ? scored[scored.indexOf(since.item) - 1] : undefined
  const noiseLabel = data ? `±${+(data.noiseThreshold * 100).toFixed(1)}%` : ''
  const baseline = data?.measurements.find((m) => m.isBaseline)?.shoulderToWaist ?? scored[0]?.shoulderToWaist
  const count = data?.measurements.length ?? 0
  // Facts straight from the stored data: when the baseline was set, how many check-ins, and the latest one.
  const facts = [
    data?.baselineTimestamp && `Baseline ${shortDate(data.baselineTimestamp)}`,
    count > 0 && `${count} check-in${count === 1 ? '' : 's'}`,
    count > 1 && latest && `last ${shortDate(latest.timestamp)}`,
  ].filter(Boolean)

  return (
    <main className="space-y-8">
      <Viewfinder className="bg-graphite-900">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-graphite-300">Shoulder-to-waist</p>
            <p className="mt-2 font-mono text-5xl font-medium text-signal">{latest ? latest.shoulderToWaist.toFixed(2) : '—'}</p>
          </div>
          {scored.length >= 2 && <Sparkline items={scored} className="mb-2 h-12 w-28 sm:w-40" />}
        </div>
        {since && (
          <p className="mt-3">
            <span className="block font-mono text-base text-graphite-100">{changeHeadline(since.since)}</span>
            <span className="block text-xs text-graphite-500">
              since last check-in
              {previous && (
                <>
                  {' · '}
                  <span className="whitespace-nowrap">
                    {shortDate(previous.timestamp)} → {shortDate(since.item.timestamp)}
                  </span>
                </>
              )}
            </span>
          </p>
        )}
        <p className="mt-2 text-sm text-graphite-300">
          {latest ? latest.score.explanation : 'Take your first check-in to set your baseline.'}
        </p>
        {latest && !since && (
          <p className="mt-2 text-sm text-graphite-500">Your trend appears after your next check-in.</p>
        )}
        {facts.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-x-2 border-t border-graphite-800 pt-3 font-mono text-[11px] uppercase tracking-wider text-graphite-500">
            {facts.map((fact, i) => (
              <span key={i} className="whitespace-nowrap">
                {fact}
                {i < facts.length - 1 && <span aria-hidden className="ml-2">·</span>}
              </span>
            ))}
          </p>
        )}
        <Link to="/check-in" className="mt-6 block">
          <Button tabIndex={-1}>New check-in</Button>
        </Link>
      </Viewfinder>

      {data && (
        // Closed by default: the map doesn't change between check-ins, so it shouldn't make the page long.
        <details className="group rounded-md border border-graphite-800 bg-graphite-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md p-4 sm:p-6 [&::-webkit-details-marker]:hidden">
            <span>
              <h2 className="inline text-lg font-semibold">Body map</h2>
              <span className="ml-2 text-sm text-graphite-500">what LiftLens measures</span>
            </span>
            <ChevronDown aria-hidden className="size-5 shrink-0 text-graphite-300 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <BodyMap ratio={scored.at(-1)?.shoulderToWaist ?? null} />
          </div>
        </details>
      )}

      {scored.length >= 2 && baseline !== undefined && (
        <section className="rounded-md border border-graphite-800 bg-graphite-900 p-4 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Trend</h2>
            <span className="text-xs text-graphite-500">Shaded: {noiseLabel} noise around baseline</span>
          </div>
          <TrendChart items={scored} baseline={baseline} noiseThreshold={data!.noiseThreshold} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">History</h2>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!data && !error && <p className="mt-3 text-sm text-graphite-300">Loading…</p>}
        {data && data.measurements.length === 0 && (
          <p className="mt-3 text-sm text-graphite-300">No check-ins yet.</p>
        )}
        {data && data.measurements.length > 0 && (
          <ul className="mt-2">
            {[...data.measurements].reverse().map((item) => (
              <Row key={item.timestamp} item={item} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
