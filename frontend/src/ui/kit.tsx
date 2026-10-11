// Small shared UI pieces in the LiftLens look: graphite surfaces, corner-bracket frames.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/** A panel framed by four corner brackets, like a camera viewfinder. */
export function Viewfinder({ children, className = '' }: { children: ReactNode; className?: string }) {
  const corner = 'pointer-events-none absolute size-5 border-signal'
  return (
    <div className={`relative p-6 sm:p-8 ${className}`}>
      <span aria-hidden className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
      <span aria-hidden className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
      <span aria-hidden className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span aria-hidden className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
      {children}
    </div>
  )
}

export function Wordmark() {
  return (
    <span className="font-display text-lg font-semibold tracking-tight">
      Lift<span className="text-signal">Lens</span>
    </span>
  )
}

/**
 * Page used by the sign-in screens: the form card, centred. With `intro`, the
 * intro sits beside the card on wide screens and below it on phones.
 */
export function AuthPage({
  title,
  subtitle,
  intro,
  children,
}: {
  title: string
  subtitle?: string
  intro?: ReactNode
  children: ReactNode
}) {
  const card = (
    <Viewfinder className="bg-graphite-900">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-graphite-300">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </Viewfinder>
  )

  if (!intro) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8">
          <Wordmark />
        </div>
        {card}
      </main>
    )
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-10 px-4 py-10 lg:max-w-5xl lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className="lg:order-2">
        <div className="mb-8 lg:hidden">
          <Wordmark />
        </div>
        {card}
      </div>
      <div className="lg:order-1">{intro}</div>
    </main>
  )
}

export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-graphite-100">{label}</span>
      <input
        {...input}
        className="mt-1.5 w-full rounded-md border border-graphite-700 bg-graphite-950 px-3 py-2.5 text-base text-graphite-100 placeholder:text-graphite-500 focus:border-signal focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-graphite-300">{hint}</span>}
    </label>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const styles =
    variant === 'primary'
      ? 'bg-signal text-graphite-950 hover:bg-signal-dim disabled:bg-graphite-700 disabled:text-graphite-300'
      : 'border border-graphite-700 text-graphite-100 hover:border-graphite-500'
  return (
    <button
      {...props}
      className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    />
  )
}

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  const color = tone === 'error' ? 'border-error/40 text-error' : 'border-signal/40 text-signal'
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  )
}
