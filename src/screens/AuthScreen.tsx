import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Logo } from '../components/ui/Logo'
import { hasSupabase } from '../backend'
import { useApp } from '../state/context'

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.5c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.5 12 5.5Z"
      />
    </svg>
  )
}

export function AuthScreen({ onBack }: { onBack: () => void }) {
  const { backend, safe } = useApp()
  const [guestName, setGuestName] = useState('')

  return (
    <div className="auth">
      <button type="button" className="btn btn--ghost btn--sm auth__back" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="auth__card">
        <Logo size={52} className="logo--stack" />
        <h1 className="t-title" style={{ marginTop: 20 }}>
          Sign in to keep score
        </h1>
        <p className="t-body">
          Track your games, build a friends list, and jump into parties faster.
        </p>

        <button
          type="button"
          className="btn btn--block auth__google"
          onClick={() => void safe(backend.signInWithGoogle())}
        >
          <GoogleGlyph />
          SIGN IN WITH GOOGLE
        </button>

        <div className="auth__divider">
          <span>or</span>
        </div>

        <label className="field">
          <span className="t-eyebrow">Playing as a guest</span>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value.slice(0, 16))}
            placeholder="Pick a nickname"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guestName.trim()) {
                void safe(backend.continueAsGuest(guestName.trim()))
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--soft btn--block"
          disabled={!guestName.trim()}
          onClick={() => void safe(backend.continueAsGuest(guestName.trim()))}
        >
          CONTINUE AS GUEST
        </button>

        <p className="t-muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
          Google sign-in only. No passwords, ever.
        </p>

        {!hasSupabase && (
          <p className="t-muted" style={{ fontSize: '0.78rem' }}>
            Demo mode: auth is simulated locally until Supabase keys are added.
          </p>
        )}
      </div>
    </div>
  )
}
