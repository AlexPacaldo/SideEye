import { useEffect, useState } from 'react'

interface GameTimerProps {
  deadline: number | null
  total: number | null
  size?: number
  label?: string
  big?: boolean
}

function useRemaining(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0,
  )
  useEffect(() => {
    if (!deadline) return
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    update()
    const handle = window.setInterval(update, 250)
    return () => window.clearInterval(handle)
  }, [deadline])
  return remaining
}

export function GameTimer({
  deadline,
  total,
  size = 48,
  label,
  big = false,
}: GameTimerProps) {
  const remaining = useRemaining(deadline)
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
