import type {
  CreateRoomInput,
  GameSettings,
  Snapshot,
} from '../game/types'

export interface Friend {
  id: string
  name: string
  avatarSeed: number
  avatarUrl: string | null
  online: boolean
}

export interface GameRecordPlayer {
  name: string
  role: string
  word: string | null
}

export interface GameRecord {
  id: string
  code: string
  playedAt: number
  mode: string
  winner: string
  yourRole: string
  rounds: number
  players: GameRecordPlayer[]
}

export interface Backend {
  kind: 'local' | 'supabase'
  init(): Promise<void>
  getSnapshot(): Snapshot
  subscribe(listener: (s: Snapshot) => void): () => void

  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
  continueAsGuest(name: string): Promise<void>

  getFriends(): Promise<Friend[]>
  getHistory(): Promise<GameRecord[]>

  createRoom(input: CreateRoomInput): Promise<void>
  joinRoom(code: string, name: string): Promise<void>
  leaveRoom(): Promise<void>

  setReady(ready: boolean): Promise<void>
  updateSettings(settings: Partial<GameSettings>): Promise<void>
  startGame(): Promise<void>

  acknowledgeRole(): Promise<void>
  submitClue(text: string): Promise<void>
  castVote(targetId: string | null): Promise<void>
  submitMrWhiteGuess(word: string): Promise<void>

  advance(): Promise<void>
  runPassTurn(): Promise<void>

  replay(): Promise<void>
  returnToLobby(): Promise<void>
}

export class BackendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackendError'
  }
}
