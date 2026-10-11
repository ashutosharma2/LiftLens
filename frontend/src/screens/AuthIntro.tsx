import { Calculator, Camera, Lock, type LucideIcon } from 'lucide-react'
import { FrontFigure } from '../history/BodyMap'
import { Wordmark } from '../ui/kit'

// What LiftLens does, for people who haven't signed in yet. Each line must stay
// true to the app: see docs/scoring.md and ADR-002 (photo never leaves the device).
const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Camera,
    title: 'Track progress from photos',
    text: 'A front photo each check-in becomes your shoulder-to-waist trend.',
  },
  { icon: Calculator, title: 'An explainable score', text: 'Every number shows its formula, so you can check it by hand.' },
  { icon: Lock, title: 'Your photo stays private', text: 'Measured on your device. Only the numbers are saved.' },
]

/**
 * Sign-in intro. Wide screens: wordmark, headline, three points and the body
 * figure. Phones: just the three point titles, shown below the form.
 */
export function AuthIntro() {
  return (
    <section aria-label="What LiftLens does">
      <div className="hidden lg:block">
        <Wordmark />
        <p className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight">
          Track your shape, not just your weight.
        </p>
      </div>
      <div className="lg:mt-10 lg:flex lg:items-center lg:gap-8">
        <ul className="space-y-3 lg:space-y-6">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-signal" strokeWidth={1.75} />
              <div>
                <p className="text-sm font-medium text-graphite-100">{title}</p>
                <p className="mt-0.5 hidden text-sm leading-relaxed text-graphite-300 lg:block">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden shrink-0 lg:block">
          <FrontFigure className="h-64 w-auto" />
        </div>
      </div>
    </section>
  )
}
