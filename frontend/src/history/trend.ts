// Display helpers for the History screen. All scoring (percent changes, the
// noise rule) happens on the server; these only select and format its results.
import type { History, HistoryItem, Score } from '../api/client'

/**
 * Check-ins measured with the current method. Earlier methods are different
 * rulers, so they stay in the list but out of trends (ADR-007).
 */
export function currentMethodItems(history: History): HistoryItem[] {
  return history.measurements.filter((item) => item.methodVersion === history.currentMethodVersion)
}

/** Check-ins that count for trends: everything except flagged photos, oldest first. */
export function scoredItems(measurements: HistoryItem[]): HistoryItem[] {
  return measurements.filter((item) => item.score.status !== 'flagged')
}

/** The most recent check-in's change since the previous one, as scored by the server. */
export function latestSinceLast(measurements: HistoryItem[]): { item: HistoryItem; since: Score } | null {
  const latest = scoredItems(measurements).at(-1)
  return latest?.sinceLast ? { item: latest, since: latest.sinceLast } : null
}

/** "+3.1%" or "-2.4%" from a percent value, rounded for reading only. */
export function formatPercent(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
}

/** Headline for a change score, in the same neutral words as its explanation. */
export function changeHeadline(score: Score): string {
  return score.status === 'no_clear_change' ? `No clear change (${formatPercent(score.value)})` : formatPercent(score.value)
}
