import { signIn } from 'aws-amplify/auth'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { authErrorMessage } from '../auth/errors'
import { AuthPage, Button, Field, Notice } from '../ui/kit'
import { AuthIntro } from './AuthIntro'

export function SignIn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next') ?? '/history'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await signIn({ username: email.trim(), password })
      if (result.isSignedIn) {
        navigate(next, { replace: true })
      } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        navigate(`/verify?email=${encodeURIComponent(email.trim())}`)
      } else {
        setError('This account needs a step LiftLens doesn’t support yet.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'UserAlreadyAuthenticatedException') {
        navigate(next, { replace: true })
        return
      }
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPage title="Sign in" subtitle="Welcome back." intro={<AuthIntro />}>
      <form onSubmit={onSubmit} className="space-y-4">
        {params.get('verified') && <Notice tone="info">Email confirmed. Sign in to continue.</Notice>}
        {params.get('reset') && <Notice tone="info">Password changed. Sign in with your new password.</Notice>}
        {params.get('expired') && <Notice tone="info">Your session ended. Sign in again.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link to="/signup" className="text-signal hover:underline">
          Create an account
        </Link>
        <Link to="/forgot-password" className="text-graphite-300 hover:text-graphite-100">
          Forgot password?
        </Link>
      </div>
    </AuthPage>
  )
}
