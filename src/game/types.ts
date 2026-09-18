export type Role = 'civilian' | 'undercover' | 'mrwhite'

export type Mode = 'online' | 'passplay'

export type Phase =
  | 'lobby'
  | 'roleReveal'
  | 'clue'
  | 'clueReveal'
  | 'discussion'
  | 'voting'
  | 'voteReveal'
  | 'runoff'
  | 'elimination'
  | 'mrWhiteGuess'
  | 'gameOver'

export type Winner = 'civilians' | 'undercover' | 'mrwhite'

export interface GameSettings {
  undercoverCount: number
  mrWhiteEnabled: boolean
  clueSeconds: number
  discussionSeconds: number
  voteSeconds: number
}

export interface PublicPlayer {
  id: string
  name: string
  avatarSeed: number
  avatarUrl: string | null
  isBot: boolean
  isGuest: boolean
  isHost: boolean
  connected: boolean
  ready: boolean
}

export interface SecretInfo {
  role: Role
  word: string | null
}

export interface PublicClue {
  playerId: string
  text: string
  round: number
}

export interface PublicVote {
  voterId: string
  targetId: string | null
  round: number
}

export interface TallyEntry {
  playerId: string
  count: number
}

export interface CastReveal {
  playerId: string
  role: Role
  word: string | null
  eliminatedRound: number | null
}

export interface RoomSnapshot {
  code: string
  mode: Mode
  phase: Phase
  round: number
  hostId: string
  players: PublicPlayer[]
  settings: GameSettings
  eliminatedIds: string[]
  clues: PublicClue[]
  submittedIds: string[]
  votes: PublicVote[]
  tally: TallyEntry[] | null
  runoffIds: string[] | null
  deadline: number | null
  timerSeconds: number | null
  mrWhiteGuessingId: string | null
  mrWhiteGuessCorrect: boolean | null
  lastEliminated: { playerId: string; role: Role } | null
  winner: Winner | null
  reveal: CastReveal[] | null
  passIndex: number
  passRevealed: boolean
  passOrder: string[]
}

export interface SessionUser {
  id: string
  name: string
  avatarUrl: string | null
  isGuest: boolean
  email: string | null
}

export interface Snapshot {
  user: SessionUser | null
  room: RoomSnapshot | null
  me: { playerId: string; secret: SecretInfo | null } | null
  connected: boolean
}

export interface CreateRoomInput {
  name: string
  mode: Mode
  settings: GameSettings
  fillBots?: boolean
  passNames?: string[]
}

export const DEFAULT_SETTINGS: GameSettings = {
  undercoverCount: 1,
  mrWhiteEnabled: true,
  clueSeconds: 90,
  discussionSeconds: 60,
  voteSeconds: 45,
}
