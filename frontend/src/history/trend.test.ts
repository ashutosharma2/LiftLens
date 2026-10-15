import { describe, expect, it } from 'vitest'
import type { HistoryItem, Score, ScoreStatus } from '../api/client'
import { changeHeadline, currentMethodItems, formatPercent, latestSinceLast, scoredItems } from './trend'

const score = (status: ScoreStatus, value = 0): Score => ({ name: 'x', value, status, formula: '', inputs: {}, explanation: '' })

function item(day: number, ratio: number, status: ScoreStatus = 'no_clear_change', sinceLast: Score | null = null): HistoryItem {
  return {
    timestamp: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`,
    shoulderToWaist: ratio,
    shoulderCheck: status === 'flagged' ? 'too_wide' : 'ok',
    methodVersion: '2026-10-edge-v1',
    isBaseline: status === 'baseline',
    score: score(status),
    sinceLast,
  }
}

describe('currentMethodItems', () => {
  it('keeps only check-ins measured with the current method', () => {
    const old = { ...item(1, 1.78, 'baseline'), methodVersion: 'old' }
    const now = { ...item(15, 1.75, 'baseline'), methodVersion: 'new' }
    const history = { currentMethodVersion: 'new', baselineTimestamp: now.timestamp, noiseThreshold: 0.02, measurements: [old, now] }
    expect(currentMethodItems(history)).toEqual([now])
  })
})

describe('scoredItems', () => {
  it('drops flagged check-ins and keeps order', () => {
    const items = [item(1, 1.7, 'baseline'), item(2, 2.5, 'flagged'), item(3, 1.75)]
    expect(scoredItems(items).map((i) => i.timestamp)).toEqual([items[0].timestamp, items[2].timestamp])
  })
})

describe('latestSinceLast', () => {
  it('is null until the server reports a change', () => {
    expect(latestSinceLast([])).toBeNull()
    expect(latestSinceLast([item(1, 1.7, 'baseline')])).toBeNull()
  })

  it("uses the latest scored check-in's server-computed change, skipping a flagged latest photo", () => {
    const change = score('increased', 4.7)
    const result = latestSinceLast([item(1, 1.7, 'baseline'), item(2, 1.78, 'increased', change), item(3, 2.9, 'flagged')])
    expect(result?.since).toBe(change)
    expect(result?.item.timestamp).toBe('2026-10-02T08:00:00Z')
  })
})

describe('formatting', () => {
  it('formats percent values with a sign', () => {
    expect(formatPercent(3.1)).toBe('+3.1%')
    expect(formatPercent(-2.4)).toBe('-2.4%')
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('wraps changes inside the noise band in plain words', () => {
    expect(changeHeadline(score('no_clear_change', 0.588))).toBe('No clear change (+0.6%)')
    expect(changeHeadline(score('increased', 4.706))).toBe('+4.7%')
  })
})
