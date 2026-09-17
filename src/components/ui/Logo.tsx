interface LogoProps {
  size?: number
  showWordmark?: boolean
  className?: string
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="logo__mark"
    >
      <rect x="0" y="0" width="64" height="64" rx="21" fill="var(--primary)" />
      <path
        d="M14 33c6-10 30-10 36 0-6 9-30 9-36 0Z"
        fill="#fff"
        opacity="0.96"
      />
      <circle cx="32" cy="33" r="8" fill="#241B2F" />
      <circle cx="35" cy="30" r="2.6" fill="#fff" />
      <path
        d="M43 15c3 1.6 4.6 3.2 5.6 5.6"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M15 47c2.4 2.6 5 4.3 8.4 5.2"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  )
}

export function Logo({ size = 40, showWordmark = true, className = '' }: LogoProps) {
  return (
    <span className={`logo ${className}`.trim()}>
      <LogoMark size={size} />
      {showWordmark && (
        <span
          className="logo__word"
          style={{ fontSize: size * 0.62 }}
        >
          SIDE&nbsp;EYE
        </span>
      )}
    </span>
  )
}
