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

export interface PlayerSearchResult {
  id: string
  name: string
  avatarUrl: string | null
}

export interface GameRecordPlayer {
  name: string
  role: string
  word: string | null
}

export interface ChatMessage {
  id: string
  playerId: string
  name: string
  text: string
  createdAt: number
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

export interface LeaderboardEntry {
  playerId: string
  name: string
  avatarSeed: number
  exp: number
  level: number
  intoLevel: number
  games: number
  wins: number
  isMe: boolean
  rank: number
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
  searchPlayers(query: string): Promise<PlayerSearchResult[]>
  addFriend(friendId: string): Promise<void>
  removeFriend(friendId: string): Promise<void>

  getPartyLeaderboard(): Promise<LeaderboardEntry[]>

  listMessages(): Promise<ChatMessage[]>
  sendMessage(text: string): Promise<void>
  subscribeChat(listener: (m: ChatMessage) => void): () => void

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
  nextRound(skipClues: boolean): Promise<void>
  skipTurn(): Promise<void>
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
