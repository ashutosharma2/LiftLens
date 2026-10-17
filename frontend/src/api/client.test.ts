import { describe, expect, it, vi } from 'vitest'
import { ApiError, getHistory, saveMeasurement, SignedOutError, type ApiDeps } from './client'

function deps(response: Response | Error, token: string | null = 'id-token'): ApiDeps & { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { getIdToken: async () => token, fetch }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const INGREDIENTS = {
  shoulderEdgePx: 1029,
  waistEdgePx: 577,
  shoulderJointPx: 690,
  hipJointPx: 364,
  torsoLengthPx: 905,
  armAngleDeg: 20,
  methodVersion: '2026-10-posemask-v2',
}

describe('API client', () => {
  it('sends the ID token as a bearer token to the same-origin API path', async () => {
    const d = deps(json(200, { baselineTimestamp: null, measurements: [] }))
    await getHistory(d)
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/measurements')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
  })

  it('posts only the ingredients as JSON', async () => {
    const d = deps(json(201, { measurement: {}, score: {} }))
    await saveMeasurement(d, INGREDIENTS)
    const [, init] = d.fetch.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(INGREDIENTS)
  })

  it('treats no token as signed out without calling the API', async () => {
    const d = deps(json(200, {}), null)
    await expect(getHistory(d)).rejects.toBeInstanceOf(SignedOutError)
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('treats 401 as signed out', async () => {
    await expect(getHistory(deps(json(401, { error: 'Token expired' })))).rejects.toBeInstanceOf(SignedOutError)
  })

  it('turns 503 into a friendly busy message', async () => {
    const err = await getHistory(deps(json(503, { error: 'Service busy' }))).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toMatch(/busy/)
  })

  it('passes through the API error message for 400', async () => {
    const err = await saveMeasurement(deps(json(400, { error: 'waistEdgePx must be between 1 and 10000' })), INGREDIENTS).catch((e) => e)
    expect(err.status).toBe(400)
    expect(err.message).toBe('waistEdgePx must be between 1 and 10000')
  })

  it('explains network failures', async () => {
    const err = await getHistory(deps(new TypeError('Failed to fetch'))).catch((e) => e)
    expect(err.message).toMatch(/Can't reach LiftLens/)
  })
})
