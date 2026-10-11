import { useState, type KeyboardEvent } from 'react'
import { region, type BackRegionId, type FrontRegionId, type RegionId } from './regions'

/**
 * Muscle shapes in a 200 x 400 box. `side` shapes are drawn for the left of the
 * figure and mirrored for the right, so the body is exactly symmetric; `centre`
 * shapes are drawn once.
 */
interface Shapes {
  centre?: string[]
  side?: string[]
}

const HEAD = 'M100 13 C111 13 117 23 117 34 C117 46 110 55 100 55 C90 55 83 46 83 34 C83 23 89 13 100 13 Z'

const FRONT: Record<FrontRegionId, Shapes> = {
  head: {
    centre: [HEAD],
    side: ['M92 56 L99 60 L99 70 L84 72 Q90 66 92 56 Z'],
  },
  shoulders: { side: ['M77 74 Q60 74 51 87 Q46 100 50 117 Q57 105 64 97 Q70 89 79 83 Z'] },
  chest: { side: ['M99 80 L99 117 Q86 124 72 118 Q64 111 66 100 Q71 88 83 83 Q92 79 99 80 Z'] },
  arms: {
    side: [
      'M62 108 Q53 113 49 124 L45 151 Q50 159 56 156 L60 136 L64 117 Z',
      'M44 165 Q39 182 34 207 L42 211 L49 190 L55 167 Q50 161 44 165 Z',
    ],
  },
  waist: {
    side: [
      'M88 124 L98 124 L98 139 L87 139 Z',
      'M87 142 L98 142 L98 157 L87 157 Z',
      'M87 160 L98 160 L98 175 L88 175 Z',
      'M88 178 L98 178 L98 201 Q92 197 89 189 Z',
      'M84 124 L70 122 L70 140 L73 166 L72 184 L85 194 L85 160 Z',
    ],
  },
  hips: { side: ['M71 190 L86 198 L99 205 L99 236 Q88 222 74 214 L68 209 Z'] },
  legs: {
    side: [
      'M68 216 Q86 224 97 246 L95 292 Q86 300 76 294 Q66 262 68 216 Z',
      'M84 266 Q95 274 95 290 Q89 297 82 291 Q79 278 84 266 Z',
      'M71 308 Q67 326 70 341 L78 368 L82 368 L82 331 Q80 315 71 308 Z',
      'M86 312 L94 310 L94 340 L90 368 L85 368 L86 330 Z',
    ],
  },
}

/**
 * The whole body outline, left half (mirrored for the right). Drawn under the
 * muscles. It runs 1 unit past the centre so the two halves overlap with no seam.
 */
const SILHOUETTE =
  'M101 52 L92 52 L91 66 Q78 70 64 74 Q50 78 48 94 L46 114 L42 140 L39 164 L34 190 L30 214 Q26 228 31 238 ' +
  'Q37 243 41 234 L45 214 L50 190 L56 164 L60 140 L64 120 L66 112 L68 140 L72 168 L70 186 L66 206 L66 240 ' +
  'L72 300 L68 330 L74 360 L80 378 L74 394 L96 396 L94 378 L96 340 L96 300 L98 250 L101 240 Z'

const MIRROR = 'matrix(-1 0 0 1 200 0)'

/** A left-side shape plus its mirror image. */
function Pair({ d, className }: { d: string; className?: string }) {
  return (
    <>
      <path d={d} className={className} />
      <path d={d} transform={MIRROR} className={className} />
    </>
  )
}

const BACK: Record<BackRegionId, Shapes> = {
  upperBack: {
    // Traps from the neck down the spine, plus the shoulder blades.
    centre: ['M100 56 L92 59 Q87 67 77 73 L84 80 Q93 92 100 128 Q107 92 116 80 L123 73 Q113 67 108 59 Z'],
    side: ['M82 84 L93 100 L90 116 Q80 118 71 110 L69 98 Q73 89 82 84 Z'],
  },
  rearShoulders: { side: ['M75 75 Q60 74 51 87 Q46 100 50 117 Q58 106 64 98 Q69 90 78 83 Z'] },
  backArms: {
    side: [
      'M62 108 Q53 113 49 124 L45 151 Q50 159 56 156 L60 136 L64 117 Z',
      'M44 165 Q39 182 34 207 L42 211 L49 190 L55 167 Q50 161 44 165 Z',
    ],
  },
  lats: { side: ['M70 113 Q80 120 90 120 L92 132 L91 160 Q86 172 76 180 Q72 160 70 140 Z'] },
  lowerBack: { side: ['M94 131 L99 131 L99 198 L86 198 Q84 186 86 178 Q92 170 94 158 Z'] },
  glutes: { side: ['M70 201 Q84 197 99 205 L99 238 Q86 248 70 238 Q64 222 70 201 Z'] },
  hamstrings: {
    side: [
      'M68 246 Q76 250 83 251 L84 296 Q78 298 74 294 Q66 270 68 246 Z',
      'M86 251 Q92 251 97 248 L95 294 Q90 298 87 296 Z',
    ],
  },
  calves: {
    side: [
      'M71 306 Q66 322 70 338 Q74 348 80 346 L82 318 Q80 308 71 306 Z',
      'M85 308 Q94 308 95 322 Q96 340 90 348 Q84 346 84 330 Z',
    ],
  },
}

// Draw order, back to front: overlapping edges belong to the later shape.
const FRONT_ORDER: FrontRegionId[] = ['head', 'legs', 'hips', 'arms', 'waist', 'chest', 'shoulders']
const BACK_ORDER: BackRegionId[] = ['calves', 'hamstrings', 'glutes', 'backArms', 'lowerBack', 'lats', 'upperBack', 'rearShoulders']

interface FigureProps<Id extends RegionId> {
  label: string
  caption?: string
  /** Small line under the caption, e.g. why the figure is all grey. */
  note?: string
  shapes: Record<Id, Shapes>
  order: Id[]
  selected?: RegionId | null
  /** Makes each part a button. Without it the figure is a plain picture. */
  onSelect?: (id: RegionId) => void
  /** Back of the head as plain outline, since the back figure has no head part. */
  plainHead?: boolean
  /** Dashed lines where the two widths are taken (front only). */
  widthLines?: boolean
  svgClassName?: string
}

/** One body figure: dark outline with muscle groups on top, tappable when onSelect is given. */
function Figure<Id extends RegionId>({
  label,
  caption,
  note,
  shapes,
  order,
  selected = null,
  onSelect,
  plainHead,
  widthLines,
  svgClassName = 'h-72 w-auto sm:h-80',
}: FigureProps<Id>) {
  function onKey(id: RegionId, event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(id)
    }
  }

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 400" className={svgClassName} role={onSelect ? 'group' : 'img'} aria-label={label}>
        <g aria-hidden className="pointer-events-none fill-graphite-950">
          <Pair d={SILHOUETTE} />
          {plainHead && <path d={HEAD} className="fill-graphite-800" />}
        </g>
        {order.map((id) => {
          const r = region(id)
          const isSelected = selected === id
          const paths = (
            <>
              {shapes[id].centre?.map((d) => <path key={d} d={d} />)}
              {shapes[id].side?.map((d) => <Pair key={d} d={d} />)}
            </>
          )
          if (!onSelect) {
            return (
              <g key={id} strokeWidth="1.5" strokeLinejoin="round" className={`stroke-graphite-950 ${r.measured ? 'fill-signal/85' : 'fill-graphite-700'}`}>
                {paths}
              </g>
            )
          }
          const fill = r.measured
            ? isSelected ? 'fill-signal' : 'fill-signal/85 hover:fill-signal'
            : isSelected ? 'fill-graphite-500' : 'fill-graphite-700 hover:fill-graphite-500'
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={`${r.label}: ${r.measured ? 'measured' : 'not measured'}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => onKey(id, e)}
              strokeWidth="1.5"
              strokeLinejoin="round"
              className={`cursor-pointer stroke-graphite-950 outline-none transition-colors ${fill} [&:focus-visible>path]:stroke-graphite-100`}
            >
              {paths}
            </g>
          )
        })}
        {widthLines && (
          <g aria-hidden className="pointer-events-none stroke-graphite-100/60" strokeWidth="1" strokeDasharray="3 3">
            <line x1="46" x2="154" y1="98" y2="98" />
            <line x1="71" x2="129" y1="168" y2="168" />
          </g>
        )}
      </svg>
      {caption && (
        <figcaption aria-hidden className="mt-2 text-center">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-graphite-300">{caption}</span>
          {note && <span className="block text-[11px] text-graphite-500">{note}</span>}
        </figcaption>
      )}
    </figure>
  )
}

/** The front figure as a plain picture (not tappable), e.g. to show what LiftLens measures before sign-in. */
export function FrontFigure({ className }: { className?: string }) {
  return (
    <Figure
      label="Body outline with the shoulders and waist highlighted: the two widths LiftLens measures"
      shapes={FRONT}
      order={FRONT_ORDER}
      widthLines
      svgClassName={className}
    />
  )
}

/**
 * Body map for V1. Front: shoulders and waist (what LiftLens measures) in lime,
 * everything else grey. Back: all grey, because V1 takes a front photo only.
 * Each part is a button; tapping it shows what LiftLens does with that part.
 */
export function BodyMap({ ratio }: { ratio: number | null }) {
  const [selected, setSelected] = useState<RegionId | null>(null)
  const chosen = selected ? region(selected) : null

  return (
    <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
      <div className="flex justify-center gap-2 sm:gap-6">
        <Figure
          label="Front body map"
          caption="Front"
          shapes={FRONT}
          order={FRONT_ORDER}
          selected={selected}
          onSelect={setSelected}
          widthLines
        />
        <Figure
          label="Back body map, front photo only"
          caption="Back"
          note="Front photo only"
          shapes={BACK}
          order={BACK_ORDER}
          selected={selected}
          onSelect={setSelected}
          plainHead
        />
      </div>

      <div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-graphite-300">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-signal" /> Measured
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-graphite-700" /> Not measured
          </span>
        </div>

        <div aria-live="polite" className="mt-4 min-h-28 rounded-md border border-graphite-800 bg-graphite-950 p-4">
          {!chosen && <p className="text-sm text-graphite-300">Tap a part of the body to see what LiftLens measures.</p>}
          {chosen && (
            <>
              <p className="font-mono text-xs uppercase tracking-wider text-graphite-300">{chosen.label}</p>
              {chosen.measured && (
                <p className="mt-1 font-mono text-2xl font-medium text-signal">
                  {ratio !== null ? ratio.toFixed(2) : '—'}
                  <span className="ml-2 font-sans text-xs font-normal text-graphite-300">shoulder-to-waist</span>
                </p>
              )}
              <p className="mt-1 text-sm leading-relaxed text-graphite-100">{chosen.detail}</p>
              {chosen.measured && ratio === null && (
                <p className="mt-1 text-sm text-graphite-300">Take your first check-in to get your ratio.</p>
              )}
            </>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-graphite-500">
          LiftLens V1 measures your shoulder-to-waist ratio from a front photo. Other muscle groups aren't rated.
        </p>
      </div>
    </div>
  )
}
