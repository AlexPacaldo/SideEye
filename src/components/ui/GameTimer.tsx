import { useEffect, useState } from 'react'

interface GameTimerProps {
  deadline: number | null
  total: number | null
  size?: number
  label?: string
  big?: boolean
}

function useRemaining(total: number): number {
  const [remaining, setRemaining] = useState(total)
  useEffect(() => {
    const start = Date.now()
    const update = () => {
      const elapsed = Math.max(0, Date.now() - start)
      const left = Math.ceil((total * 1000 - elapsed) / 1000)
      setRemaining(Math.max(0, Math.min(total, left)))
    }
    const handle = window.setInterval(update, 250)
    return () => window.clearInterval(handle)
  }, [total])
  return remaining
}

export function GameTimer({
  deadline,
  total,
  size = 48,
  label,
  big = false,
}: GameTimerProps) {
  // Count down from `total` for `total` seconds starting when this instance
  // mounts. Callers should key this component on the deadline so a new
  // deadline remounts it and restarts the countdown — this keeps the display
  // immune to the client clock differing from the server clock, while the
  // server still enforces the real deadline.
  const remaining = useRemaining(total ?? 0)
  if (!deadline || !total) return null

  const radius = 18
  const circumference = 2 * Math.PI * radius
  const fraction = Math.max(0, Math.min(1, remaining / total))
  const urgent = remaining <= 10 && remaining > 0
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div
      className={[
        'timer',
        urgent ? 'timer--urgent' : '',
        big ? 'timer--big' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="timer"
      aria-live="off"
    >
      <span className="timer__dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="4"
          />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke={urgent ? 'var(--danger)' : 'var(--primary)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>
      </span>
      <span className="col" style={{ gap: 0 }}>
        {label && <span className="timer__label">{label}</span>}
        <span className="timer__value">{display}</span>
      </span>
    </div>
  )
}