import { signUp } from 'aws-amplify/auth'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PASSWORD_RULES } from '../auth/amplify'
import { authErrorMessage } from '../auth/errors'
import { AuthPage, Button, Field, Notice } from '../ui/kit'
import { AuthIntro } from './AuthIntro'

export function SignUp() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const username = email.trim()
      await signUp({ username, password, options: { userAttributes: { email: username } } })
      navigate(`/verify?email=${encodeURIComponent(username)}`)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPage title="Create your account" subtitle="We’ll email you a code to confirm the address is yours." intro={<AuthIntro />}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          hint={PASSWORD_RULES}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-graphite-300">
        Already have an account?{' '}
        <Link to="/signin" className="text-signal hover:underline">
          Sign in
        </Link>
      </p>
    </AuthPage>
  )
}
