export type AvatarState =
  | 'default'
  | 'ready'
  | 'turn'
  | 'submitted'
  | 'voted'
  | 'eliminated'
  | 'disconnected'

const PALETTE = [
  '#FFD166',
  '#EF476F',
  '#06D6A0',
  '#4CC9F0',
  '#F78C6B',
  '#B39DDB',
  '#7ED957',
  '#FF9F1C',
  '#F72585',
  '#90BE6D',
  '#5AA9E6',
  '#F9844A',
]

const INK = '#241B2F'

interface AvatarProps {
  seed: number
  name: string
  avatarUrl?: string | null
  size?: number
  state?: AvatarState
  host?: boolean
  className?: string
}

export function Avatar({
  seed,
  name,
  avatarUrl,
  size = 56,
  state = 'default',
  host = false,
  className = '',
}: AvatarProps) {
  const bg = PALETTE[Math.abs(seed) % PALETTE.length]
  const eye = Math.abs(seed) % 4
  const mouth = Math.abs(Math.floor(seed / 3)) % 3
  const blush = Math.abs(Math.floor(seed / 5)) % 2 === 1
  const brow = Math.abs(Math.floor(seed / 7)) % 3

  const classes = [
    'avatar',
    `avatar--${state}`,
    host ? 'avatar--host' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      title={name}
      aria-label={name}
    >
      {avatarUrl ? (
        <img className="avatar__img" src={avatarUrl} alt="" draggable={false} />
      ) : (
        <svg viewBox="0 0 100 100" className="avatar__svg" aria-hidden="true">
          <rect x="0" y="0" width="100" height="100" rx="34" fill={bg} />
          <ellipse
            cx="30"
            cy="72"
            rx="16"
            ry="10"
            fill="#fff"
            opacity="0.22"
          />
          {brow === 1 && (
            <>
              <path d="M28 38 q7 -5 14 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
              <path d="M58 38 q7 -5 14 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
            </>
          )}
          {eye === 0 && (
            <>
              <circle cx="36" cy="50" r="5.4" fill={INK} />
              <circle cx="64" cy="50" r="5.4" fill={INK} />
            </>
          )}
          {eye === 1 && (
            <>
              <path d="M30 50 q6 -8 12 0" stroke={INK} strokeWidth="4.4" fill="none" strokeLinecap="round" />
              <path d="M58 50 q6 -8 12 0" stroke={INK} strokeWidth="4.4" fill="none" strokeLinecap="round" />
            </>
          )}
          {eye === 2 && (
            <>
              <path d="M30 50 q6 -8 12 0" stroke={INK} strokeWidth="4.4" fill="none" strokeLinecap="round" />
              <circle cx="64" cy="50" r="5.4" fill={INK} />
            </>
          )}
          {eye === 3 && (
            <>
              <line x1="30" y1="50" x2="42" y2="50" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
              <line x1="58" y1="50" x2="70" y2="50" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
            </>
          )}
          {mouth === 0 && (
            <path d="M40 66 q10 10 20 0" stroke={INK} strokeWidth="4.4" fill="none" strokeLinecap="round" />
          )}
          {mouth === 1 && (
            <path d="M38 64 a12 12 0 0 0 24 0 z" fill={INK} />
          )}
          {mouth === 2 && (
            <line x1="42" y1="68" x2="58" y2="68" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
          )}
          {blush && (
            <>
              <ellipse cx="27" cy="60" rx="6" ry="4" fill="#fff" opacity="0.5" />
              <ellipse cx="73" cy="60" rx="6" ry="4" fill="#fff" opacity="0.5" />
            </>
          )}
        </svg>
      )}
      {host && (
        <span className="avatar__crown" aria-hidden="true">
          <svg viewBox="0 0 24 18" width="18" height="14">
            <path
              d="M2 15 L2 6 L7 10 L12 3 L17 10 L22 6 L22 15 Z"
              fill="#FFB020"
              stroke="rgba(0,0,0,0.18)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
  )
}
