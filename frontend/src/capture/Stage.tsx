// Picture frames shared by the check-in screens: the live camera, the review
// and the measuring step. The photo is shown in place and never copied anywhere.
import { useEffect, useRef, type ReactNode } from 'react'

// Camera and review pictures: nearly full height, leaving room for the header,
// one line of text or chips, and the buttons.
export const FULL_HEIGHT = 'calc(100dvh - 12rem)'

/**
 * Frame shaped exactly like the picture (width / height), so the outline drawn
 * over it lines up with the photo. No taller than maxHeight (default 70% of the screen).
 */
export function Stage({ aspect, maxHeight = '70dvh', children }: { aspect: number; maxHeight?: string; children: ReactNode }) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-md bg-black"
      style={{ aspectRatio: aspect, width: `min(100%, calc(${maxHeight} * ${aspect}))` }}
    >
      {children}
    </div>
  )
}

export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-graphite-100">{children}</div>
  )
}

/** Shows the in-memory photo canvas without copying it anywhere. */
export function PhotoView({ photo }: { photo: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.replaceChildren(photo)
  }, [photo])
  return <div ref={ref} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:object-cover" />
}
