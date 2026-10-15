import { signOut } from 'aws-amplify/auth'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { saveMeasurement, SignedOutError } from '../api/client'
import { apiDeps } from '../auth/session'
import { FULL_HEIGHT, PhotoView, Stage } from '../capture/Stage'
import { assess, outcomeMessage, type Outcome } from '../measure/checkin'
import { detectPose, PERSON_VALUE, preloadModels, segmentMask } from '../measure/models'
import { Button, Notice } from '../ui/kit'

type Step = 'loading' | 'pose' | 'outline' | 'measuring'

const STEPS: { id: Step; label: string }[] = [
  { id: 'loading', label: 'Loading models' },
  { id: 'pose', label: 'Finding your pose' },
  { id: 'outline', label: 'Finding your outline' },
  { id: 'measuring', label: 'Measuring' },
]

type State =
  | { kind: 'working'; step: Step }
  | { kind: 'done'; outcome: Outcome }
  | { kind: 'error'; message: string }

/** Let the browser paint the current step before the next blocking model call. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

/**
 * Measures the check-in photo on this device, shows the result over the photo,
 * and saves only when the person chooses to. Retake what's meaningless; a
 * flagged shoulder outline can still be saved, marked as flagged.
 */
export function MeasureStep({ photo, onRetake }: { photo: HTMLCanvasElement; onRetake: () => void }) {
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'working', step: 'loading' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    const show = (step: Step) => !cancelled && setState({ kind: 'working', step })

    ;(async () => {
      try {
        const models = await preloadModels()
        show('pose')
        await nextFrame()
        const landmarks = detectPose(models, photo)
        show('outline')
        await nextFrame()
        const maskRowAt = landmarks ? segmentMask(models, photo) : () => new Uint8Array(0)
        show('measuring')
        await nextFrame()
        const outcome = assess(landmarks, photo.width, photo.height, maskRowAt, PERSON_VALUE)
        if (!cancelled) setState({ kind: 'done', outcome })
      } catch {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: "The measuring models couldn't load or run on this device. Check your connection and try again.",
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [photo])

  async function onSave() {
    if (state.kind !== 'done' || state.outcome.kind !== 'measured') return
    setSaving(true)
    setSaveError('')
    try {
      await saveMeasurement(apiDeps, state.outcome.ingredients)
      navigate('/history', { replace: true })
    } catch (err) {
      if (err instanceof SignedOutError) {
        await signOut()
        navigate('/signin?expired=1&next=/check-in', { replace: true })
        return
      }
      setSaveError(err instanceof Error ? err.message : 'Saving failed. Try again.')
      setSaving(false)
    }
  }

  const outcome = state.kind === 'done' ? state.outcome : null
  const message = outcome ? outcomeMessage(outcome) : null
  const measured = outcome?.kind === 'measured' ? outcome : null

  return (
    <main className="space-y-4">
      <Stage aspect={photo.width / photo.height} maxHeight={FULL_HEIGHT}>
        <PhotoView photo={photo} />
        {state.kind === 'working' && <Scanning step={state.step} />}
        {measured && <Lines outcome={measured} width={photo.width} height={photo.height} />}
      </Stage>

      {state.kind === 'error' && <Notice tone="error">{state.message}</Notice>}

      {measured && (
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-graphite-300">Shoulder-to-waist</p>
          <p className={`mt-1 font-mono text-5xl font-medium ${measured.flagged ? 'text-warn' : 'text-signal'}`}>
            {measured.measurements.shoulderToWaist.toFixed(2)}
          </p>
          {/* Local dev only: 3 decimals for noise calibration (dev/noise.py). */}
          {import.meta.env.DEV && (
            <p className="mt-1 font-mono text-xs text-graphite-500">
              dev · {measured.measurements.shoulderToWaist.toFixed(3)}
            </p>
          )}
          {!measured.flagged && (
            <p className="mt-2 text-sm text-graphite-300">Save to add it to your history and see how it compares.</p>
          )}
        </div>
      )}

      {message && <Notice tone={measured ? 'info' : 'error'}>{message}</Notice>}
      {saveError && <Notice tone="error">{saveError}</Notice>}

      {state.kind !== 'working' && (
        <div className={`grid gap-3 ${measured ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Button type="button" variant="ghost" onClick={onRetake} disabled={saving}>
            Retake
          </Button>
          {measured && (
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : measured.flagged ? 'Save flagged' : 'Save'}
            </Button>
          )}
        </div>
      )}
    </main>
  )
}

/** A line sweeping over the photo, with the steps ticking off underneath. */
function Scanning({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <div className="absolute inset-0 bg-black/40">
      <div aria-hidden className="absolute inset-x-0 h-0.5 animate-scan bg-signal shadow-[0_0_12px_2px] shadow-signal/60" />
      <ol aria-live="polite" className="absolute inset-x-0 bottom-0 space-y-1 bg-black/60 p-4 font-mono text-xs">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < current ? 'text-graphite-500' : i === current ? 'text-signal' : 'text-graphite-500/60'}>
            {i < current ? '✓' : i === current ? '›' : '·'} {s.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Shoulder and waist lines drawn where they were measured, in photo pixels. */
function Lines({ outcome, width, height }: { outcome: Extract<Outcome, { kind: 'measured' }>; width: number; height: number }) {
  const m = outcome.measurements
  const stroke = Math.max(width, height) / 220
  const color = outcome.flagged ? 'var(--color-warn)' : 'var(--color-signal)'
  const line = (y: number, left: number, right: number) => (
    <>
      <line x1={left} y1={y} x2={right} y2={y} stroke={color} strokeWidth={stroke} />
      <line x1={left} y1={y - stroke * 4} x2={left} y2={y + stroke * 4} stroke={color} strokeWidth={stroke} />
      <line x1={right} y1={y - stroke * 4} x2={right} y2={y + stroke * 4} stroke={color} strokeWidth={stroke} />
    </>
  )
  return (
    <svg
      aria-label={`Measured lines: shoulders and waist, ratio ${m.shoulderToWaist.toFixed(2)}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full drop-shadow-[0_0_3px_rgb(0_0_0_/_0.8)]"
    >
      {line(m.shoulderY, m.shoulderEdges.left, m.shoulderEdges.right)}
      {line(m.waistY, m.waistEdges.left, m.waistEdges.right)}
    </svg>
  )
}
