// Client for the measurements API (docs/api.md). The browser only ever sends
// numbers; the user is identified by the Cognito ID token, never by the body.

export type ShoulderCheck = 'ok' | 'too_wide' | 'too_narrow'
export type ScoreStatus = 'baseline' | 'increased' | 'decreased' | 'no_clear_change' | 'flagged'

export interface Score {
  name: string
  value: number
  status: ScoreStatus
  formula: string
  inputs: Record<string, number>
  explanation: string
}

export interface Measurement {
  timestamp: string
  shoulderToWaist: number
  shoulderCheck: ShoulderCheck
  methodVersion: string
  isBaseline: boolean
}

export interface HistoryItem extends Measurement {
  score: Score
  /** Change since the previous ok check-in, scored by the server; null for the first. */
  sinceLast: Score | null
}

export interface History {
  /** Method of the most recent check-in; scores only compare check-ins of one method (ADR-007). */
  currentMethodVersion: string | null
  /** Baseline of the current method. */
  baselineTimestamp: string | null
  /** Arm angle of the current method's baseline photo; new photos must match it (ADR-008). */
  baselineArmAngleDeg: number | null
  /** The server's noise threshold as a fraction (0.02 = ±2%). */
  noiseThreshold: number
  measurements: HistoryItem[]
}

export interface Ingredients {
  shoulderEdgePx: number
  waistEdgePx: number
  shoulderJointPx: number
  hipJointPx: number
  torsoLengthPx: number
  /** Upper arms' angle from straight down, in degrees: the pose, matched against the baseline (ADR-008). */
  armAngleDeg: number
  methodVersion: string
}

/** The session has ended; the app should send the user to sign in. */
export class SignedOutError extends Error {}

/** A request failed with a message that is safe to show the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ApiDeps {
  /** Current ID token, or null when signed out. */
  getIdToken: () => Promise<string | null>
  fetch: typeof fetch
}

const PATH = '/api/measurements'

async function request<T>(deps: ApiDeps, init: RequestInit): Promise<T> {
  const token = await deps.getIdToken()
  if (!token) throw new SignedOutError()

  let response: Response
  try {
    response = await deps.fetch(PATH, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new ApiError(0, "Can't reach LiftLens. Check your connection and try again.")
  }

  if (response.status === 401) throw new SignedOutError()
  if (response.status === 503) throw new ApiError(503, 'LiftLens is busy right now. Try again in a moment.')

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : 'Something went wrong. Try again.'
    throw new ApiError(response.status, message)
  }
  return body as T
}

export function getHistory(deps: ApiDeps): Promise<History> {
  return request<History>(deps, { method: 'GET' })
}

export function saveMeasurement(
  deps: ApiDeps,
  ingredients: Ingredients,
): Promise<{ measurement: Measurement; score: Score; sinceLast: Score | null }> {
  return request(deps, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ingredients),
  })
}
