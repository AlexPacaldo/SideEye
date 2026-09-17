import { motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { ROLE_META } from '../../game/identity'

interface MrWhiteGuessProps {
  canGuess: boolean
  guesserName: string
  onSubmit: (word: string) => void
}

export function MrWhiteGuess({ canGuess, guesserName, onSubmit }: MrWhiteGuessProps) {
  const [value, setValue] = useState('')
  const meta = ROLE_META.mrwhite

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <div className="col center" style={{ gap: 22, textAlign: 'center' }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="col center"
        style={{ gap: 6 }}
      >
        <span className="t-eyebrow" style={{ color: meta.color }}>
          Wait.
        </span>
        <span className="big-message">MR. WHITE GETS ONE LAST SHOT.</span>
      </motion.div>

      {canGuess ? (
        <form className="col center" style={{ gap: 16, width: 'min(420px, 100%)' }} onSubmit={submit}>
          <span className="t-eyebrow">One word. One chance.</span>
          <p className="t-body">What was the secret word?</p>
          <div className="clue-input" style={{ width: '100%' }}>
            <div className="clue-input__field" style={{ borderColor: meta.color }}>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, 30))}
                placeholder="type it…"
                autoFocus
                aria-label="Your final guess"
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn btn--lg btn--block"
            style={{ background: meta.color, color: '#fff' }}
            disabled={!value.trim()}
          >
            FINAL ANSWER
          </button>
        </form>
      ) : (
        <motion.div
          className="col center"
          style={{ gap: 16 }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          <span className="reaction reaction--float" aria-hidden="true">
            🤫
          </span>
          <span className="t-body">
            {guesserName} is guessing…
          </span>
        </motion.div>
      )}
    </div>
  )
}
