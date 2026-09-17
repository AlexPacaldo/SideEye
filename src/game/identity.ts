import type { Role } from './types'

export const GAME = {
  name: 'SIDE EYE',
  tagline: 'Read the room.',
  blurb: 'Everyone knows the word. Almost everyone.',
  description:
    'A party game of one-word clues, quiet bluffing and very loud side eyes.',
} as const

export const ROLE_META: Record<
  Role,
  {
    label: string
    short: string
    blurb: string
    color: string
    soft: string
    glyph: string
  }
> = {
  civilian: {
    label: 'Civilian',
    short: 'CIVILIAN',
    blurb: "You know the word. Keep it vague and stay alive.",
    color: 'var(--role-civilian)',
    soft: 'var(--role-civilian-soft)',
    glyph: '◆',
  },
  undercover: {
    label: 'Undercover',
    short: 'UNDERCOVER',
    blurb: "Your word is close. Close enough to blend.",
    color: 'var(--role-undercover)',
    soft: 'var(--role-undercover-soft)',
    glyph: '◈',
  },
  mrwhite: {
    label: 'Mr. White',
    short: 'MR. WHITE',
    blurb: 'No word. Just vibes. Good luck out there.',
    color: 'var(--role-mrwhite)',
    soft: 'var(--role-mrwhite-soft)',
    glyph: '◇',
  },
}

export const MOTIF_COPY = [
  'Read the room.',
  'Someone is lying.',
  'Keep it vague.',
  'Nice try.',
  'Blend in.',
  'Say less.',
  "Who's acting sus?",
] as const

export const LOADING_LINES = {
  create: 'CREATING YOUR PARTY…',
  join: 'KNOCKING ON THE DOOR…',
  roles: 'SHUFFLING THE ROLES…',
  words: 'PICKING SECRET WORDS…',
  ready: 'GETTING EVERYONE READY…',
  votes: 'COUNTING THE VOTES…',
  reveal: 'FLIPPING THE CARDS…',
} as const
