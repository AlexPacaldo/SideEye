interface DecorProps {
  variant?: 'home' | 'lobby' | 'game' | 'soft'
}

const SHAPES = ['bubble', 'card', 'question', 'eye', 'scribble', 'note'] as const

function Shape({ kind }: { kind: (typeof SHAPES)[number] }) {
  switch (kind) {
    case 'bubble':
      return (
        <svg width="90" height="80" viewBox="0 0 90 80">
          <rect x="2" y="2" width="86" height="58" rx="22" fill="currentColor" />
          <path d="M24 58 L20 78 L44 58 Z" fill="currentColor" />
        </svg>
      )
    case 'card':
      return (
        <svg width="70" height="92" viewBox="0 0 70 92">
          <rect
            x="2"
            y="2"
            width="66"
            height="88"
            rx="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="M18 34h34M18 48h34M18 62h20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )
    case 'question':
      return (
        <svg width="64" height="64" viewBox="0 0 64 64">
          <path
            d="M20 22c0-8 6-12 13-12s12 4 12 11c0 9-10 9-10 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="34.5" cy="52" r="4.5" fill="currentColor" />
        </svg>
      )
    case 'eye':
      return (
        <svg width="86" height="58" viewBox="0 0 86 58">
          <path
            d="M6 29C16 12 70 12 80 29 70 46 16 46 6 29Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
          <circle cx="43" cy="29" r="10" fill="currentColor" />
        </svg>
      )
    case 'scribble':
      return (
        <svg width="96" height="54" viewBox="0 0 96 54">
          <path
            d="M4 40c10-26 22 10 32-12s20 16 30-6 16 8 26-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return (
        <svg width="72" height="84" viewBox="0 0 72 84">
          <rect x="2" y="2" width="68" height="80" rx="14" fill="currentColor" opacity="0.5" />
          <path d="M20 28h32M20 42h32M20 56h18" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )
  }
}

const LAYOUTS: Record<
  NonNullable<DecorProps['variant']>,
  { kind: (typeof SHAPES)[number]; top: string; left: string; rot: number; size: number; tone: string }[]
> = {
  home: [
    { kind: 'bubble', top: '12%', left: '6%', rot: -10, size: 1, tone: 'motif--primary' },
    { kind: 'question', top: '22%', left: '86%', rot: 12, size: 0.8, tone: 'motif--grape' },
    { kind: 'card', top: '68%', left: '4%', rot: -16, size: 0.9, tone: '' },
    { kind: 'eye', top: '78%', left: '80%', rot: 8, size: 1, tone: 'motif--primary' },
    { kind: 'scribble', top: '48%', left: '90%', rot: -6, size: 0.9, tone: '' },
  ],
  lobby: [
    { kind: 'bubble', top: '8%', left: '82%', rot: 8, size: 0.8, tone: 'motif--primary' },
    { kind: 'card', top: '72%', left: '6%', rot: -12, size: 0.8, tone: '' },
    { kind: 'question', top: '82%', left: '90%', rot: 10, size: 0.7, tone: 'motif--grape' },
  ],
  game: [
    { kind: 'question', top: '10%', left: '8%', rot: -8, size: 0.6, tone: 'motif--grape' },
    { kind: 'bubble', top: '84%', left: '88%', rot: 6, size: 0.6, tone: 'motif--primary' },
  ],
  soft: [
    { kind: 'eye', top: '14%', left: '88%', rot: 6, size: 0.7, tone: '' },
    { kind: 'scribble', top: '86%', left: '6%', rot: -8, size: 0.7, tone: 'motif--primary' },
  ],
}

export function Decor({ variant = 'soft' }: DecorProps) {
  const items = LAYOUTS[variant]
  return (
    <div aria-hidden="true">
      {items.map((item, i) => (
        <span
          key={i}
          className={`motif anim-drift ${item.tone}`}
          style={{
            top: item.top,
            left: item.left,
            transform: `scale(${item.size})`,
            ['--rot' as string]: `${item.rot}deg`,
            animationDelay: `${i * 1.4}s`,
          }}
        >
          <Shape kind={item.kind} />
        </span>
      ))}
    </div>
  )
}
