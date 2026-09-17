import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'

interface ClueInputProps {
  onSubmit: (value: string) => void
  locked?: boolean
  lockedLabel?: string
  maxLength?: number
  disabled?: boolean
}

export function ClueInput({
  onSubmit,
  locked = false,
  lockedLabel = 'Clue locked',
  maxLength = 30,
  disabled = false,
}: ClueInputProps) {
  const [value, setValue] = useState('')
  const [shake, setShake] = useState(false)

  if (locked) {
    return (
      <div className="clue-input clue-input--locked">
        <div className="clue-input__field" style={{ justifyContent: 'center' }}>
          <span className="clue-lock" style={{ color: 'var(--role-civilian)' }}>
            <Lock size={18} /> {lockedLabel}
          </span>
        </div>
      </div>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const clean = value.trim()
    if (!clean) {
      setShake(true)
      window.setTimeout(() => setShake(false), 450)
      return
    }
    onSubmit(clean.slice(0, maxLength))
    setValue('')
  }

  return (
    <form className="clue-input" onSubmit={submit}>
      <div className={`clue-input__field ${shake ? 'anim-shake' : ''}`}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          placeholder="one word…"
          maxLength={maxLength}
          disabled={disabled}
          autoFocus
          aria-label="Your clue"
        />
        <span className="clue-input__count">
          {value.length} / {maxLength}
        </span>
      </div>
      <button
        type="submit"
        className="btn btn--primary btn--lg btn--block"
        disabled={disabled || value.trim().length === 0}
      >
        LOCK IT IN
      </button>
    </form>
  )
}
