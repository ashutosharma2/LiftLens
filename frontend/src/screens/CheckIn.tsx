import { useEffect, useReducer, useRef, useState, type ChangeEvent } from 'react'
import { Frame, Lock, MoveHorizontal, PersonStanding, Repeat, ScanFace, Smartphone, Timer, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { createBeeper, type Beeper } from '../capture/beep'
import { BodyOutline } from '../capture/BodyOutline'
import { openCamera, stopCamera } from '../capture/camera'
import { startCountdown } from '../capture/countdown'
import { cameraOn, COUNTDOWN_SECONDS, initialPhase, next, PROBLEM_MESSAGE, type CaptureProblem } from '../capture/flow'
import { fileToCanvas, frameToCanvas } from '../capture/photo'
import { FULL_HEIGHT, Overlay, PhotoView, Stage } from '../capture/Stage'
import { preloadModels } from '../measure/models'
import { Button, Notice, Viewfinder } from '../ui/kit'
import { MeasureStep } from './MeasureStep'

// The setup tips. The first is the only guard against a tilted phone, so keep it.
const TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Smartphone, text: 'Phone upright at chest height' },
  { icon: MoveHorizontal, text: 'Step back about 2 m' },
  { icon: PersonStanding, text: 'Face the camera, arms slightly out' },
  { icon: Repeat, text: 'Same clothes, light and spot each time' },
]

// What to look for on the review screen. Prompts for the person, not results:
// nothing has been checked yet, so no ticks.
const REVIEW_CHECKS: { icon: LucideIcon; text: string }[] = [
  { icon: Frame, text: 'In frame' },
  { icon: ScanFace, text: 'Facing camera' },
  { icon: PersonStanding, text: 'Arms out' },
]

/** Guided check-in photo: propped phone, front camera, body outline, 10 s countdown. */
export function CheckIn() {
  const [phase, dispatch] = useReducer(next, initialPhase)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelCountdownRef = useRef<(() => void) | null>(null)
  const beeperRef = useRef<Beeper | null>(null)
  const mountedRef = useRef(true)
  const [videoAspect, setVideoAspect] = useState(3 / 4)

  // The camera runs only while opening, live or counting down. Leaving those
  // phases, or leaving the screen, turns it off.
  const wantCamera = cameraOn(phase)
  useEffect(() => {
    if (wantCamera) return
    stopCamera(streamRef.current)
    streamRef.current = null
  }, [wantCamera])

  useEffect(() => {
    mountedRef.current = true
    // Start downloading the measuring models now, so they're usually ready by
    // the time the photo is taken. Failures surface later, on the measuring step.
    preloadModels().catch(() => {})
    return () => {
      mountedRef.current = false
      cancelCountdownRef.current?.()
      beeperRef.current?.close()
      stopCamera(streamRef.current)
      streamRef.current = null
    }
  }, [])

  // Show the stream once the video element exists.
  useEffect(() => {
    if (phase.kind === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [phase.kind])

  async function onOpenCamera() {
    dispatch({ type: 'open' })
    try {
      const stream = await openCamera()
      if (!mountedRef.current) return stopCamera(stream)
      streamRef.current = stream
      dispatch({ type: 'cameraReady' })
    } catch (problem) {
      dispatch({ type: 'failed', problem: problem as CaptureProblem })
    }
  }

  function onStart() {
    beeperRef.current ??= createBeeper()
    const beeper = beeperRef.current
    dispatch({ type: 'start' })
    beeper.tick()
    cancelCountdownRef.current = startCountdown(
      COUNTDOWN_SECONDS,
      (secondsLeft) => {
        beeper.tick()
        dispatch({ type: 'tick', secondsLeft })
      },
      () => {
        cancelCountdownRef.current = null
        const video = videoRef.current
        if (!video || video.videoWidth === 0) return dispatch({ type: 'failed', problem: 'failed' })
        beeper.shutter()
        dispatch({ type: 'captured', photo: frameToCanvas(video) })
      },
    )
  }

  function onCancel() {
    cancelCountdownRef.current?.()
    cancelCountdownRef.current = null
    dispatch({ type: 'cancel' })
  }

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    try {
      dispatch({ type: 'uploaded', photo: await fileToCanvas(file) })
    } catch {
      dispatch({ type: 'failed', problem: 'bad-file' })
    }
  }

  function onRetake() {
    const fromCamera = phase.kind === 'review' && phase.source === 'camera'
    dispatch({ type: 'retake' })
    if (fromCamera) void onOpenCamera()
  }

  if (phase.kind === 'setup') {
    return (
      <main>
        <Viewfinder className="bg-graphite-900">
          <h1 className="text-2xl font-semibold">New check-in</h1>
          <ol className="mt-6 grid grid-cols-2 gap-3">
            {TIPS.map(({ icon: Icon, text }) => (
              <li key={text} className="rounded-md border border-graphite-800 bg-graphite-950 p-4">
                <Icon aria-hidden className="size-6 text-signal" strokeWidth={1.75} />
                <p className="mt-3 text-sm leading-snug text-graphite-100">{text}</p>
              </li>
            ))}
          </ol>
          {phase.problem && (
            <div className="mt-6">
              <Notice tone="error">{PROBLEM_MESSAGE[phase.problem]}</Notice>
            </div>
          )}
          <div className="mt-6 space-y-3">
            <Button type="button" onClick={onOpenCamera}>
              Open camera
            </Button>
            <label className="block w-full cursor-pointer rounded-md border border-graphite-700 px-4 py-2.5 text-center text-sm font-semibold text-graphite-100 transition-colors hover:border-graphite-500 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-signal">
              Upload a photo instead
              <input type="file" accept="image/*" onChange={onUpload} className="sr-only" />
            </label>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-graphite-500">
            <Lock aria-hidden className="size-3.5" />
            Your photo stays on this device
          </p>
          <Link to="/history" className="mt-6 inline-block text-sm text-graphite-300 hover:text-graphite-100">
            Back to history
          </Link>
        </Viewfinder>
      </main>
    )
  }

  if (phase.kind === 'opening' || phase.kind === 'live' || phase.kind === 'countdown') {
    const counting = phase.kind === 'countdown'
    return (
      <main className="space-y-4">
        <Stage aspect={videoAspect} maxHeight={FULL_HEIGHT}>
          {/* Mirrored like a mirror; the captured photo isn't. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={(e) => setVideoAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight)}
            className="h-full w-full -scale-x-100 object-cover"
          />
          {/* Thick, shadowed outline and a big corner number: readable from about 2 m away. */}
          <BodyOutline
            lineWidth={counting ? 1.6 : 1.2}
            className={`drop-shadow-[0_0_3px_rgb(0_0_0_/_0.8)] ${counting ? 'text-signal' : 'text-graphite-100'}`}
          />
          {phase.kind === 'opening' && <Overlay>Starting camera…</Overlay>}
          {counting && (
            <span
              aria-live="assertive"
              className="absolute right-4 top-2 font-mono text-[20dvh] font-medium leading-none text-signal drop-shadow-[0_2px_6px_rgb(0_0_0_/_0.8)]"
            >
              {phase.secondsLeft}
            </span>
          )}
        </Stage>
        {!counting && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-graphite-300">
            <Timer aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
            Tap Start, then step back · 10 s
          </p>
        )}
        {counting ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Back
            </Button>
            <Button type="button" onClick={onStart} disabled={phase.kind === 'opening'}>
              Start
            </Button>
          </div>
        )}
      </main>
    )
  }

  if (phase.kind === 'review') {
    return (
      <main className="space-y-4">
        <Stage aspect={phase.photo.width / phase.photo.height} maxHeight={FULL_HEIGHT}>
          <PhotoView photo={phase.photo} />
          <BodyOutline className="text-signal/80" />
        </Stage>
        <ul aria-label="Check your photo" className="flex flex-wrap justify-center gap-2">
          {REVIEW_CHECKS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="inline-flex items-center gap-1.5 rounded-full border border-graphite-700 px-3 py-1 text-xs text-graphite-100"
            >
              <Icon aria-hidden className="size-3.5 text-signal" strokeWidth={1.75} />
              {text}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onRetake}>
            Retake
          </Button>
          <Button type="button" onClick={() => dispatch({ type: 'use' })}>
            Use photo
          </Button>
        </div>
      </main>
    )
  }

  // ready: measure the photo on this device, then save or retake.
  return <MeasureStep photo={phase.photo} onRetake={() => dispatch({ type: 'restart' })} />
}
