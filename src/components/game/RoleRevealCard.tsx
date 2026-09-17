import type { Role } from '../../game/types'
import { ROLE_META } from '../../game/identity'

interface RoleRevealCardProps {
  role: Role
  word: string | null
  revealed: boolean
  onReveal?: () => void
}

export function RoleRevealCard({
  role,
  word,
  revealed,
  onReveal,
}: RoleRevealCardProps) {
  const meta = ROLE_META[role]

  return (
    <div className={`role-card ${revealed ? 'role-card--revealed' : ''}`}>
      <div className="role-card__inner">
        <button
          type="button"
          className="role-card__face role-card__back"
          onClick={revealed ? undefined : onReveal}
          style={{
            cursor: revealed ? 'default' : 'pointer',
            border: 'none',
          }}
          aria-label="Reveal your role"
        >
          <span className="role-card__hint" style={{ color: 'var(--ink-faint)' }}>
            Your role is
          </span>
          <svg width="120" height="150" viewBox="0 0 120 150" aria-hidden="true">
            <rect
              x="8"
              y="8"
              width="104"
              height="134"
              rx="22"
              fill="var(--surface-2)"
              stroke="var(--line-strong)"
              strokeWidth="3"
            />
            <path
              d="M30 46h60M30 66h60M30 86h40"
              stroke="var(--ink-faint)"
              strokeWidth="5"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d="M40 112c8-8 32-8 40 0"
              stroke="var(--ink-faint)"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              opacity="0.5"
            />
            <circle cx="60" cy="126" r="5" fill="var(--primary)" />
          </svg>
          <span className="role-card__cover-word">TAP TO REVEAL</span>
        </button>

        <div className={`role-card__face role-card__front role-card__front--${role}`}>
          <span className="role-card__hint">Your role</span>
          <span className="role-card__glyph" aria-hidden="true">
            {meta.glyph}
          </span>
          <span className="role-card__role">{meta.short}</span>
          {role === 'mrwhite' ? (
            <>
              <span className="role-card__word">NO WORD FOR YOU</span>
              <p className="role-card__note">
                Listen carefully. Blend in. Don&apos;t get caught.
              </p>
            </>
          ) : (
            <>
              <span className="role-card__word">YOUR WORD</span>
              <span className="role-card__secret">{word ?? '—'}</span>
              <p className="role-card__note">
                {role === 'undercover'
                  ? 'Close enough to blend. Far enough to be caught.'
                  : 'Give a clue. Don\u2019t make it obvious.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
