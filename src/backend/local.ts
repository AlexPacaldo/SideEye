import { botClue, botGuess } from '../game/bot'
import { breakdownExp, levelInfo, winningRole } from '../game/exp'
import {
  assignRoles,
  checkWin,
  generateRoomCode,
  tallyVotes,
  topVoted,
} from '../game/logic'
import { pickWordPair } from '../game/words'
import {
  DEFAULT_SETTINGS,
  type CreateRoomInput,
  type GameSettings,
  type Phase,
  type PublicPlayer,
  type PublicVote,
  type Role,
  type RoomSnapshot,
  type SecretInfo,
  type Snapshot,
  type Winner,
} from '../game/types'
import { BackendError, type Backend, type ChatMessage, type Friend, type GameRecord, type LeaderboardEntry, type PlayerSearchResult } from './types'

const CLUE_TURN_SECONDS = 60

const PASS_PLAY_CODE = 'PASSPLAY'

const BOT_NAMES = [
  'Mia',
  'Carlo',
  'Priya',
  'Noah',
  'Zoe',
  'Leo',
  'Nadia',
  'Sam',
  'Ruby',
  'Kai',
  'Iris',
  'Theo',
]

const AVATAR_SEEDS = [3, 7, 11, 14, 18, 22, 27, 31, 36, 41, 45, 52]

interface PersistedUser {
  id: string
  name: string
  avatarUrl: string | null
  isGuest: boolean
  email: string | null
}

interface BoardEntry {
  playerId: string
  name: string
  avatarSeed: number
  exp: number
  games: number
  wins: number
}

interface Internal {
  roles: Record<string, Role>
  secretWord: string
  undercoverWord: string
  passOrder: string[]
  seen: Set<string>
  roundVotes: PublicVote[]
  mrWhiteGuessUsed: boolean
  pendingWinner: Winner | null
  pendingMrWhiteId: string | null
  usedWords: string[]
  eliminated: Map<string, number>
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export class LocalBackend implements Backend {
  readonly kind = 'local' as const

  private listeners = new Set<(s: Snapshot) => void>()
  private user: PersistedUser | null = null
  private room: RoomSnapshot | null = null
  private internal: Internal | null = null
  private seenSecrets = new Map<string, SecretInfo>()
private history: GameRecord[] = []
  private friends: Friend[] = []
  private board: BoardEntry[] = []
  private chat: ChatMessage[] = []
  private chatListeners = new Set<(m: ChatMessage) => void>()
  private botTimers: number[] = []
  private ticker: number | null = null
  private snapshot: Snapshot = {
    user: null,
    room: null,
    me: null,
    connected: true,
  }

  async init(): Promise<void> {
    const stored = load<PersistedUser | null>('sideeye.user', null)
    this.user = stored
this.history = load<GameRecord[]>('sideeye.history', [])
this.friends = load<Friend[]>('sideeye.friends', defaultFriends())
    this.recompute()
  }

  getSnapshot(): Snapshot {
    return this.snapshot
  }

  subscribe(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private recompute(): void {
    let secret: SecretInfo | null = null
    let playerId = this.user?.id ?? 'me'
    if (this.room) {
      if (this.room.mode === 'passplay') {
        const current = this.room.passIndex >= 0
          ? this.internal?.passOrder[this.room.passIndex]
          : undefined
        if (current) {
          playerId = current
          if (this.room.passRevealed) {
            secret = this.seenSecrets.get(current) ?? null
          }
        }
      } else if (this.user) {
        secret = this.seenSecrets.get(this.user.id) ?? null
      }
    }
    this.snapshot = {
      user: this.user,
      room: this.room,
      me: this.room ? { playerId, secret } : null,
      connected: true,
    }
    this.listeners.forEach((l) => l(this.snapshot))
  }

  private commit(): void {
    if (this.room && this.internal) {
      this.room.eliminatedIds = [...this.internal.eliminated.keys()]
    }
    this.recompute()
    if (this.room) this.persistRoom()
  }

  private persistRoom(): void {
    if (!this.room) return
    try {
      localStorage.setItem('sideeye.room', JSON.stringify(this.room))
    } catch {
      /* ignore */
    }
  }

  /* ---------------- auth ---------------- */

  async signInWithGoogle(): Promise<void> {
    const id = uid()
    this.user = {
      id,
      name: 'Google Player',
      avatarUrl: null,
      isGuest: false,
      email: 'player@gmail.com',
    }
    save('sideeye.user', this.user)
    this.recompute()
  }

  async continueAsGuest(name: string): Promise<void> {
    const id = load<string>('sideeye.guestId', uid())
    save('sideeye.guestId', id)
    this.user = {
      id,
      name: name.trim() || 'Guest',
      avatarUrl: null,
      isGuest: true,
      email: null,
    }
    save('sideeye.user', this.user)
    this.recompute()
  }

  async signOut(): Promise<void> {
    this.user = null
    try {
      localStorage.removeItem('sideeye.user')
    } catch {
      /* ignore */
    }
    this.leaveRoomInternal()
    this.recompute()
  }

  /* ---------------- data ---------------- */

async getFriends(): Promise<Friend[]> {
    return this.friends
  }

  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return defaultFriends()
      .filter((f) => f.name.toLowerCase().includes(q))
      .map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl }))
  }

  async addFriend(friendId: string): Promise<void> {
    if (this.friends.some((f) => f.id === friendId)) return
    const found = defaultFriends().find((f) => f.id === friendId)
    if (found) {
      this.friends.push({ ...found })
      save('sideeye.friends', this.friends)
    }
  }

  async removeFriend(friendId: string): Promise<void> {
    this.friends = this.friends.filter((f) => f.id !== friendId)
    save('sideeye.friends', this.friends)
  }

async getHistory(): Promise<GameRecord[]> {
    return [...this.history].sort((a, b) => b.playedAt - a.playedAt)
  }

  async getPartyLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!this.room) return []
    const me = this.user?.id
    const sorted = [...this.board].sort((a, b) => b.exp - a.exp || a.name.localeCompare(b.name))
    return sorted.map((b, i) => {
      const lvl = levelInfo(b.exp)
      return {
        playerId: b.playerId,
        name: b.name,
        avatarSeed: b.avatarSeed,
        exp: b.exp,
        level: lvl.level,
        intoLevel: lvl.intoLevel,
        games: b.games,
        wins: b.wins,
        isMe: me != null && b.playerId === me,
        rank: i + 1,
      }
    })
  }

  private loadPartyBoard(code: string): void {
    this.board = load<BoardEntry[]>(`sideeye.party.${code}`, [])
  }

  /* ---------------- chat ---------------- */

  async listMessages(): Promise<ChatMessage[]> {
    return this.chat.slice(-50)
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.room) return
    const clean = text.trim().slice(0, 300)
    if (!clean) return
    const pid = this.snapshot.me?.playerId ?? this.user?.id ?? 'me'
    const name =
      this.room.players.find((p) => p.id === pid)?.name ??
      this.user?.name ??
      'Player'
    const msg: ChatMessage = {
      id: uid(),
      playerId: pid,
      name,
      text: clean,
      createdAt: Date.now(),
    }
    this.chat = [...this.chat, msg].slice(-100)
    this.chatListeners.forEach((l) => l(msg))
  }

  subscribeChat(listener: (m: ChatMessage) => void): () => void {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  /* ---------------- room ---------------- */

async createRoom(input: CreateRoomInput): Promise<void> {
    if (!this.user) await this.continueAsGuest('You')
    this.chat = []
    this.chatListeners.clear()
    const settings = { ...DEFAULT_SETTINGS, ...input.settings }
    const code = input.mode === 'passplay' ? PASS_PLAY_CODE : generateRoomCode()
    const players: PublicPlayer[] = []

    if (input.mode === 'passplay') {
      const names = (input.passNames ?? []).map((n) => n.trim()).filter(Boolean)
      if (names.length < 3) {
        throw new BackendError('Pass & Play needs at least 3 players.')
      }
      names.forEach((name, i) => {
        players.push({
          id: i === 0 ? this.user!.id : `pass-${i}`,
          name,
          avatarSeed: (i * 5 + 2) % 60,
          avatarUrl: null,
          isBot: false,
          isGuest: true,
          isHost: i === 0,
          connected: true,
          ready: true,
        })
      })
    } else {
      const me: PublicPlayer = {
        id: this.user!.id,
        name: input.name.trim() || this.user!.name,
        avatarSeed: 9,
        avatarUrl: null,
        isBot: false,
        isGuest: this.user!.isGuest,
        isHost: true,
        connected: true,
        ready: true,
      }
      players.push(me)
      if (input.fillBots) {
        const count = 4
        for (let i = 0; i < count; i += 1) {
          players.push({
            id: `bot-${i}`,
            name: BOT_NAMES[i % BOT_NAMES.length],
            avatarSeed: AVATAR_SEEDS[i % AVATAR_SEEDS.length],
            avatarUrl: null,
            isBot: true,
            isGuest: false,
            isHost: false,
            connected: true,
            ready: false,
          })
        }
      }
    }

    this.internal = {
      roles: {},
      secretWord: '',
      undercoverWord: '',
      passOrder: [],
      seen: new Set(),
      roundVotes: [],
      mrWhiteGuessUsed: false,
      pendingWinner: null,
      pendingMrWhiteId: null,
      usedWords: [],
      eliminated: new Map(),
    }
    this.seenSecrets.clear()
    this.room = {
      code,
      mode: input.mode,
      phase: 'lobby',
      round: 0,
      hostId: this.user!.id,
      players,
      settings,
      clues: [],
      eliminatedIds: [],
      submittedIds: [],
      votes: [],
      tally: null,
      runoffIds: null,
      deadline: null,
      timerSeconds: null,
      mrWhiteGuessingId: null,
      mrWhiteGuessCorrect: null,
      lastEliminated: null,
      winner: null,
      reveal: null,
passIndex: 0,
      passRevealed: false,
      passOrder: [],
    }
    this.loadPartyBoard(code)
    this.commit()
    this.scheduleBots()
  }

async joinRoom(code: string, name: string): Promise<void> {
    if (!this.user) await this.continueAsGuest(name)
    this.chat = []
    this.chatListeners.clear()
    const trimmed = name.trim()
    if (this.room && this.room.code === code.toUpperCase()) {
      this.room.players = this.room.players.map((p) =>
        p.id === this.user!.id ? { ...p, name: trimmed || p.name } : p,
      )
      this.commit()
      return
    }
    if (!/^[A-Z0-9]{5}$/.test(code.toUpperCase())) {
      throw new BackendError('That code does not look right.')
    }
    const me: PublicPlayer = {
      id: this.user!.id,
      name: trimmed || this.user!.name,
      avatarSeed: 9,
      avatarUrl: null,
      isBot: false,
      isGuest: this.user!.isGuest,
      isHost: false,
      connected: true,
      ready: false,
    }
    this.internal = {
      roles: {},
      secretWord: '',
      undercoverWord: '',
      passOrder: [],
      seen: new Set(),
      roundVotes: [],
      mrWhiteGuessUsed: false,
      pendingWinner: null,
      pendingMrWhiteId: null,
      usedWords: [],
      eliminated: new Map(),
    }
    this.room = {
      code: code.toUpperCase(),
      mode: 'online',
      phase: 'lobby',
      round: 0,
      hostId: 'friend-1',
      players: [
        me,
        { ...bot('friend-1', 'Mia', 7, true), isBot: false, isHost: true },
        { ...bot('friend-2', 'Carlo', 21, true), isBot: false },
      ],
      settings: { ...DEFAULT_SETTINGS },
      clues: [],
      eliminatedIds: [],
      submittedIds: [],
      votes: [],
      tally: null,
      runoffIds: null,
      deadline: null,
      timerSeconds: null,
      mrWhiteGuessingId: null,
      mrWhiteGuessCorrect: null,
      lastEliminated: null,
      winner: null,
      reveal: null,
passIndex: 0,
      passRevealed: false,
      passOrder: [],
    }
    this.loadPartyBoard(code.toUpperCase())
    this.commit()
  }

  async leaveRoom(): Promise<void> {
    this.leaveRoomInternal()
    this.recompute()
  }

private leaveRoomInternal(): void {
    this.clearTimers()
    this.chat = []
    this.chatListeners.clear()
    this.room = null
    this.internal = null
    this.board = []
    this.seenSecrets.clear()
    try {
      localStorage.removeItem('sideeye.room')
    } catch {
      /* ignore */
    }
  }

  async setReady(ready: boolean): Promise<void> {
    this.patchPlayer(this.user?.id, { ready })
  }

  async updateSettings(settings: Partial<GameSettings>): Promise<void> {
    if (!this.room || this.room.phase !== 'lobby') return
    this.room.settings = { ...this.room.settings, ...settings }
    this.commit()
  }

  /* ---------------- game flow ---------------- */

  async startGame(): Promise<void> {
    if (!this.room || !this.internal) return
    const room = this.room
    if (room.mode === 'online') {
      const allReady = room.players.every((p) => p.ready || p.isBot)
      if (!allReady) {
        room.players = room.players.map((p) => (p.isBot ? { ...p, ready: true } : p))
      }
    }
    const pair = pickWordPair(this.internal.usedWords)
    this.internal.usedWords.push(pair.civilian, pair.undercover)
    this.internal.secretWord = pair.civilian
    this.internal.undercoverWord = pair.undercover
    this.internal.roles = assignRoles(room.players, room.settings)
    this.internal.seen = new Set()
    this.internal.roundVotes = []
    this.internal.eliminated = new Map()
    this.internal.mrWhiteGuessUsed = false
    this.internal.pendingWinner = null
    this.internal.pendingMrWhiteId = null
    this.seenSecrets.clear()

    room.players = room.players.map((p) => ({ ...p, ready: false }))
    room.players.forEach((p) => {
      const role = this.internal!.roles[p.id]
      const word =
        role === 'civilian'
          ? this.internal!.secretWord
          : role === 'undercover'
            ? this.internal!.undercoverWord
            : null
      this.seenSecrets.set(p.id, { role, word })
    })
    room.round = 1
    room.clues = []
    room.votes = []
    room.tally = null
    room.runoffIds = null
    room.winner = null
    room.reveal = null
    room.lastEliminated = null
    room.mrWhiteGuessingId = null
    room.mrWhiteGuessCorrect = null
    room.submittedIds = []
    this.enterPhase('roleReveal', null)
  }

  async acknowledgeRole(): Promise<void> {
    if (!this.room || this.room.phase !== 'roleReveal') return
    if (this.room.mode === 'passplay') return this.runPassTurn()
    const id = this.user?.id
    if (!id) return
    if (!this.room.submittedIds.includes(id)) {
      this.room.submittedIds = [...this.room.submittedIds, id]
    }
    if (this.allSubmitted()) this.enterPhase('clue', this.room.settings.clueSeconds)
    this.commit()
  }

async submitClue(text: string): Promise<void> {
    const actor = this.currentActor()
    if (this.room?.phase === 'clue' && this.room?.mode === 'online' && actor !== this.user?.id) return
    this.submitClueFor(actor, text)
  }

  private submitClueFor(playerId: string | null, text: string): void {
    if (!this.room || this.room.phase !== 'clue' || !playerId) return
    const clean = text.trim().slice(0, 30)
    if (!clean) return
    if (this.room.clues.some((c) => c.playerId === playerId && c.round === this.room!.round)) {
      return
    }
    this.room.clues = [
      ...this.room.clues,
      { playerId, text: clean, round: this.room.round },
    ]
    if (!this.room.submittedIds.includes(playerId)) {
      this.room.submittedIds = [...this.room.submittedIds, playerId]
    }
    if (this.allSubmitted()) {
      this.enterPhase('clueReveal', null)
    } else {
      this.advancePass()
      this.commit()
    }
  }

  async castVote(targetId: string | null): Promise<void> {
    this.castVoteFor(this.currentActor(), targetId)
  }

private castVoteFor(playerId: string | null, targetId: string | null): void {
    if (!this.room) return
    if (this.room.phase !== 'voting' && this.room.phase !== 'runoff') return
    if (!playerId) return
    if (!this.voterIds(this.room.phase === 'runoff').includes(playerId)) return
    if (this.internal!.roundVotes.some((v) => v.voterId === playerId && v.round === this.room!.round)) {
      return
    }
if (this.room.runoffIds && targetId && !this.room.runoffIds.includes(targetId)) {
      return
    }
    if (this.room.mode !== 'passplay' && targetId === playerId) return
    this.internal!.roundVotes = [
      ...this.internal!.roundVotes,
      { voterId: playerId, targetId, round: this.room.round },
    ]
    this.room.votes = this.internal!.roundVotes
if (!this.room.submittedIds.includes(playerId)) {
      this.room.submittedIds = [...this.room.submittedIds, playerId]
    }
    if (this.room.mode === 'passplay' || this.votersDone()) {
      this.enterPhase('voteReveal', null)
    } else {
      this.advancePass()
      this.commit()
    }
  }

async submitMrWhiteGuess(word: string): Promise<void> {
    if (!this.room || !this.internal) return
    if (this.room.phase !== 'mrWhiteGuess') return
    const guess = normalize(word)
    const correct = guess.length > 0 && guess === normalize(this.internal.secretWord)
    this.internal.mrWhiteGuessUsed = true
    this.room.mrWhiteGuessCorrect = correct
    this.internal.pendingMrWhiteId = null

    const check = checkWin({
      aliveIds: this.aliveIds(),
      roles: this.internal.roles,
      pendingMrWhiteGuess: false,
      mrWhiteGuessCorrect: correct,
    })

    if (check.gameOver) {
      this.room.winner = check.winner
      this.finishGame()
      return
    }

    this.room.round += 1
    this.room.votes = []
    this.room.tally = null
    this.room.runoffIds = null
    this.internal.roundVotes = []
    this.enterPhase('postElimination', null)
  }

  async advance(): Promise<void> {
    if (!this.room) return
    switch (this.room.phase) {
      case 'clueReveal':
        this.enterPhase('discussion', this.room.settings.discussionSeconds)
        break
      case 'discussion':
        this.startVoting(false)
        break
      case 'voteReveal':
        this.resolveVotes()
        break
      case 'elimination':
        if (!this.room.deadline || Date.now() >= this.room.deadline) {
          this.continueAfterElimination()
        } else {
          this.commit()
        }
        break
      case 'postElimination':
        this.enterPhase('discussion', null)
        break
      case 'roleReveal':
        if (this.room.mode === 'passplay') this.runPassTurn()
        break
      default:
        this.commit()
    }
  }

  async nextRound(skipClues: boolean): Promise<void> {
    if (!this.room) return
    if (this.room.phase !== 'postElimination') return
    if (skipClues) {
      this.startVoting(false)
    } else if (this.room.mode === 'passplay') {
      this.enterPhase('discussion', null)
    } else {
      this.enterPhase('clue', this.room.settings.clueSeconds)
    }
  }

  async skipTurn(): Promise<void> {
    if (!this.room || !this.internal) return
    if (this.room.phase !== 'clue') return
    if (!this.aliveIds().includes(this.user?.id ?? '')) return
    const turn = this.internal.passOrder[this.room.passIndex]
    if (!turn) return
    if (
      this.room.clues.some((c) => c.playerId === turn && c.round === this.room!.round)
    ) return
    this.submitClueFor(turn, '…')
  }

  async runPassTurn(): Promise<void> {
    if (!this.room || !this.internal) return
    const room = this.room
    if (room.mode !== 'passplay') return

    if (room.phase === 'roleReveal') {
      if (!room.passRevealed) {
        room.passRevealed = true
        const id = this.internal.passOrder[room.passIndex]
        if (id) this.internal.seen.add(id)
        this.commit()
        return
      }
      room.passRevealed = false
      room.passIndex += 1
if (room.passIndex >= this.internal.passOrder.length) {
        room.submittedIds = [...this.internal.passOrder]
        this.enterPhase('discussion', null)
      } else {
        this.commit()
      }
      return
    }

    if (
      room.phase === 'clue' ||
      room.phase === 'voting' ||
      room.phase === 'runoff' ||
      room.phase === 'mrWhiteGuess'
    ) {
      if (!room.passRevealed) {
        room.passRevealed = true
        this.commit()
      } else {
        this.commit()
      }
    }
  }

  async replay(): Promise<void> {
    if (!this.room) return
    await this.startGame()
  }

  async returnToLobby(): Promise<void> {
    if (!this.room) return
    this.clearTimers()
    this.room.phase = 'lobby'
    this.room.round = 0
    this.room.clues = []
    this.room.votes = []
    this.room.tally = null
    this.room.runoffIds = null
    this.room.winner = null
    this.room.reveal = null
    this.room.lastEliminated = null
    this.room.mrWhiteGuessingId = null
    this.room.mrWhiteGuessCorrect = null
    this.room.submittedIds = []
    this.room.passIndex = 0
    this.room.passRevealed = false
    this.room.players = this.room.players.map((p) =>
      p.isBot ? { ...p, ready: false } : p,
    )
    this.internal!.roundVotes = []
    this.internal!.roles = {}
    this.seenSecrets.clear()
    this.commit()
    this.scheduleBots()
  }

  /* ---------------- phase plumbing ---------------- */

  private enterPhase(phase: Phase, timerSeconds: number | null): void {
    if (!this.room) return
    this.clearBotTimers()
    const room = this.room
    room.phase = phase
    room.deadline = timerSeconds ? Date.now() + timerSeconds * 1000 : null
    room.timerSeconds = timerSeconds
    room.passIndex = 0
    room.passRevealed = false

if (phase === 'clue') {
      room.submittedIds = []
      room.clues = room.clues.filter((c) => c.round !== room.round)
      this.setPassOrder(this.shuffleOrder(this.aliveIds()))
      if (room.mode !== 'passplay') {
        room.deadline = Date.now() + CLUE_TURN_SECONDS * 1000
        room.timerSeconds = CLUE_TURN_SECONDS
      }
    }
    if (phase === 'voting' || phase === 'runoff') {
      room.submittedIds = []
      this.setPassOrder(this.voterIds(phase === 'runoff'))
    }
    if (phase === 'roleReveal') {
      room.submittedIds = []
      this.setPassOrder(room.players.map((p) => p.id))
      if (room.mode === 'passplay') {
        room.deadline = null
        room.timerSeconds = null
      } else {
        room.deadline = Date.now() + 60000
        room.timerSeconds = 60
      }
    }
if (phase === 'elimination') {
      room.deadline = room.mode === 'online' ? Date.now() + 4000 : null
      room.timerSeconds = room.mode === 'online' ? 4 : null
    }
    if (phase === 'voteReveal') {
      room.tally = tallyVotes(this.internal!.roundVotes, room.round, this.aliveIds())
      room.deadline = null
      room.timerSeconds = null
    }
    if (phase === 'discussion' && room.mode === 'passplay') {
      this.setPassOrder(this.shuffleOrder(this.aliveIds()))
    }

    this.startTicker()
    this.commit()
    this.scheduleBots()
  }

  private startVoting(runoff: boolean): void {
    if (!this.room || !this.internal) return
    this.internal.roundVotes = []
    this.room.votes = []
    this.room.tally = null
    if (!runoff) this.room.runoffIds = null
    this.enterPhase(runoff ? 'runoff' : 'voting', this.room.settings.voteSeconds)
  }

  private resolveVotes(): void {
    if (!this.room || !this.internal) return
    const room = this.room
    const alive = this.aliveIds()
    const restriction = room.runoffIds ?? undefined
    const tally = tallyVotes(this.internal.roundVotes, room.round, alive)
    room.tally = tally
    const { leaders, max } = topVoted(tally, restriction)

    if (max === 0) {
      room.lastEliminated = null
      room.runoffIds = null
      this.internal.pendingWinner = null
      this.internal.pendingMrWhiteId = null
      this.enterPhase('elimination', null)
      return
    }

    if (leaders.length > 1 && !room.runoffIds) {
      room.runoffIds = leaders
      this.startVoting(true)
      return
    }

    const eliminatedId =
      leaders.length > 1
        ? leaders[Math.floor(Math.random() * leaders.length)]
        : leaders[0]
    this.eliminate(eliminatedId)
  }

  private eliminate(playerId: string): void {
    if (!this.room || !this.internal) return
    const room = this.room
    const role = this.internal.roles[playerId]
    this.internal.eliminated.set(playerId, room.round)
    room.lastEliminated = { playerId, role }
    room.runoffIds = null
    room.players = room.players.map((p) =>
      p.id === playerId ? { ...p, ready: false } : p,
)

    const aliveAfter = this.aliveIds()
    const check = checkWin({
      aliveIds: aliveAfter,
      roles: this.internal.roles,
      pendingMrWhiteGuess:
        role === 'mrwhite' && !this.internal.mrWhiteGuessUsed,
      mrWhiteGuessCorrect: null,
    })

    this.internal.pendingWinner = check.winner
    this.internal.pendingMrWhiteId = check.needsMrWhiteGuess
      ? playerId
      : null

    this.enterPhase('elimination', null)
  }

  private continueAfterElimination(): void {
    if (!this.room || !this.internal) return
    const room = this.room
    if (this.internal.pendingWinner) {
      room.winner = this.internal.pendingWinner
      this.finishGame()
      return
    }
    if (this.internal.pendingMrWhiteId) {
      room.mrWhiteGuessingId = this.internal.pendingMrWhiteId
      room.passIndex = 0
      room.passRevealed = false
      const mwId = this.internal.pendingMrWhiteId
      this.internal.passOrder = [mwId]
      this.enterPhase('mrWhiteGuess', 45)
      return
    }
room.round += 1
    room.votes = []
    room.tally = null
    room.runoffIds = null
    this.internal.roundVotes = []
    this.enterPhase('postElimination', null)
  }

  private finishGame(): void {
    if (!this.room || !this.internal) return
    const room = this.room
    room.reveal = room.players.map((p) => {
      const role = this.internal!.roles[p.id]
      const word =
        role === 'civilian'
          ? this.internal!.secretWord
          : role === 'undercover'
            ? this.internal!.undercoverWord
            : null
      return {
        playerId: p.id,
        role,
        word,
        eliminatedRound: this.internal!.eliminated.get(p.id) ?? null,
      }
    })
    room.deadline = null
    room.timerSeconds = null
    this.recordGame()
    this.enterPhase('gameOver', null)
  }

private recordGame(): void {
    if (!this.room || !this.internal) return
    const room = this.room
    const myRole = this.user ? this.internal.roles[this.user.id] ?? 'civilian' : 'civilian'
    const record: GameRecord = {
      id: uid(),
      code: room.code,
      playedAt: Date.now(),
      mode: room.mode,
      winner: room.winner ?? 'civilians',
      yourRole: myRole,
      rounds: room.round,
      players: room.reveal?.map((r) => ({
        name: room.players.find((p) => p.id === r.playerId)?.name ?? 'Player',
        role: r.role,
        word: r.word,
      })) ?? [],
    }
    this.history = [record, ...this.history].slice(0, 40)
    save('sideeye.history', this.history)
    this.awardExp(record)
  }

  private awardExp(record: GameRecord): void {
    const room = this.room
    if (!room?.reveal) return
    const winner = (record.winner ?? 'civilians') as Winner
    const next = [...this.board]
    for (const r of room.reveal) {
      const player = room.players.find((p) => p.id === r.playerId)
      if (player?.isBot) continue
      const playerId = player?.id ?? r.playerId
      const name = player?.name ?? 'Player'
      const role = r.role
      const survived = r.eliminatedRound == null
      const exp = breakdownExp(winner, role, survived, record.rounds).total
      const won = winningRole(winner).includes(role)
      const entry = next.find((b) => b.playerId === playerId)
      if (entry) {
        entry.name = name
        entry.avatarSeed = player?.avatarSeed ?? entry.avatarSeed
        entry.exp += exp
        entry.games += 1
        if (won) entry.wins += 1
      } else {
        next.push({
          playerId,
          name,
          avatarSeed: player?.avatarSeed ?? 0,
          exp,
          games: 1,
          wins: won ? 1 : 0,
        })
      }
    }
    next.sort((a, b) => b.exp - a.exp || a.name.localeCompare(b.name))
    this.board = next
    save(`sideeye.party.${room.code}`, this.board)
  }

  /* ---------------- helpers ---------------- */

  private currentActor(): string | null {
    if (!this.room || !this.internal) return null
if (this.room.mode === 'passplay') {
      if (this.room.phase === 'mrWhiteGuess') return this.room.mrWhiteGuessingId
      return this.internal.passOrder[this.room.passIndex] ?? null
    }
    if (this.room.phase === 'mrWhiteGuess') {
      return this.room.mrWhiteGuessingId === this.user?.id
        ? this.user?.id ?? null
        : null
    }
    if (this.room.phase === 'clue') {
      return this.internal.passOrder[this.room.passIndex] ?? null
    }
    return this.user?.id ?? null
  }

private setPassOrder(order: string[]): void {
    if (!this.internal || !this.room) return
    this.internal.passOrder = [...order]
    this.room.passIndex = 0
    this.room.passRevealed = false
    this.room.passOrder = [...order]
  }

  private shuffleOrder(order: string[]): string[] {
    const copy = [...order]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

private advancePass(): void {
    if (!this.room || !this.internal) return
    if (this.room.mode !== 'passplay' && this.room.phase !== 'clue') return
    this.room.passRevealed = false
    const order = this.internal.passOrder
    if (this.room.phase === 'clue') {
      const hasClue = (id: string) =>
        this.room!.clues.some((c) => c.playerId === id && c.round === this.room!.round)
      let idx = 0
      while (idx < order.length && hasClue(order[idx])) idx += 1
      if (idx > order.length - 1) idx = order.length - 1
      this.room.passIndex = idx
      if (this.room.mode !== 'passplay') {
        this.room.deadline = Date.now() + CLUE_TURN_SECONDS * 1000
        this.room.timerSeconds = CLUE_TURN_SECONDS
      }
      return
    }
    let idx = this.room.passIndex + 1
    while (idx < order.length) {
      const id = order[idx]
      if (
        (this.room.phase === 'voting' || this.room.phase === 'runoff') &&
        this.internal.roundVotes.some(
          (v) => v.voterId === id && v.round === this.room!.round,
        )
      ) {
        idx += 1
        continue
      }
      break
    }
    this.room.passIndex = idx
  }

  private aliveIds(): string[] {
    if (!this.room || !this.internal) return []
    return this.room.players
      .map((p) => p.id)
      .filter((id) => !this.internal!.eliminated.has(id))
  }

  private voterIds(runoff: boolean): string[] {
    if (!this.room) return []
    const alive = this.aliveIds()
    if (runoff && this.room.runoffIds) {
      return alive.filter((id) => !this.room!.runoffIds!.includes(id))
    }
    return alive
  }

  private allSubmitted(): boolean {
    if (!this.room) return false
    const expected =
this.room.phase === 'clue'
        ? this.aliveIds()
        : this.room.players.map((p) => p.id)
    return expected.every((id) => this.room!.submittedIds.includes(id))
  }

  private votersDone(): boolean {
    if (!this.room) return false
    return this.voterIds(this.room.phase === 'runoff').every((id) =>
      this.internal!.roundVotes.some(
        (v) => v.voterId === id && v.round === this.room!.round,
      ),
    )
  }

  private patchPlayer(id: string | undefined, patch: Partial<PublicPlayer>): void {
    if (!this.room || !id) return
    this.room.players = this.room.players.map((p) =>
      p.id === id ? { ...p, ...patch } : p,
    )
    this.commit()
  }

  /* ---------------- bots ---------------- */

  private scheduleBots(): void {
    if (!this.room || !this.internal) return
    if (this.room.mode !== 'online') return
    this.clearBotTimers()
    const room = this.room
    const bots = room.players.filter((p) => p.isBot)
    bots.forEach((b, i) => {
      const delay = 900 + i * 650 + Math.random() * 1600
      if (room.phase === 'lobby' && !b.ready) {
        this.later(() => this.patchPlayer(b.id, { ready: true }), delay)
      }
      if (room.phase === 'roleReveal' && !room.submittedIds.includes(b.id)) {
        this.later(() => {
          if (this.room?.phase !== 'roleReveal') return
          if (!this.room.submittedIds.includes(b.id)) {
            this.room.submittedIds = [...this.room.submittedIds, b.id]
            if (this.allSubmitted()) {
              this.enterPhase('clue', this.room.settings.clueSeconds)
            } else {
              this.commit()
            }
          }
        }, delay)
      }
      if (
        room.phase === 'clue' &&
        !room.clues.some((c) => c.playerId === b.id && c.round === room.round)
      ) {
        this.later(() => {
          if (this.room?.phase !== 'clue') return
          const clue = botClue(this.internal!.roles[b.id], this.seenSecrets.get(b.id)?.word ?? null)
          this.submitClueFor(b.id, clue)
        }, delay + 900)
      }
      if (
        (room.phase === 'voting' || room.phase === 'runoff') &&
        !this.internal!.roundVotes.some(
          (v) => v.voterId === b.id && v.round === room.round,
        )
      ) {
        this.later(() => {
          if (
            this.room?.phase !== 'voting' &&
            this.room?.phase !== 'runoff'
          ) {
            return
          }
          const targets = this.voterIds(this.room.phase === 'runoff').filter(
            (id) => id !== b.id,
          )
          if (targets.length === 0) return
          const pick = targets[Math.floor(Math.random() * targets.length)]
          this.castVoteFor(b.id, pick)
        }, delay + 700)
      }
      if (room.phase === 'mrWhiteGuess' && room.mrWhiteGuessingId === b.id) {
        this.later(() => {
          if (this.room?.phase !== 'mrWhiteGuess') return
          void this.submitMrWhiteGuess(
            botGuess(this.internal!.secretWord),
          )
        }, 2600)
      }
    })
  }

  private later(fn: () => void, delay: number): void {
    const handle = window.setTimeout(() => {
      this.botTimers = this.botTimers.filter((h) => h !== handle)
      fn()
    }, delay)
    this.botTimers.push(handle)
  }

  private clearBotTimers(): void {
    this.botTimers.forEach((h) => window.clearTimeout(h))
    this.botTimers = []
  }

  /* ---------------- timers ---------------- */

  private startTicker(): void {
    if (this.ticker != null) return
    this.ticker = window.setInterval(() => {
      if (!this.room?.deadline) return
      if (Date.now() >= this.room.deadline) {
        this.handleTimeout()
      }
    }, 400)
  }

  private handleTimeout(): void {
    if (!this.room) return
    const phase = this.room.phase
    switch (phase) {
      case 'roleReveal':
        if (this.room.mode === 'online') {
          this.room.players.forEach((p) => {
            if (!this.room!.submittedIds.includes(p.id)) {
              this.room!.submittedIds = [...this.room!.submittedIds, p.id]
            }
          })
          this.enterPhase('clue', this.room.settings.clueSeconds)
        }
        break
case 'clue': {
        const order = this.internal?.passOrder ?? []
        const cur = order[this.room!.passIndex]
        if (this.room!.mode !== 'passplay' && cur) {
          this.submitClueFor(cur, '…')
        } else {
          const missing = this.aliveIds().filter(
            (id) => !this.room!.clues.some((c) => c.playerId === id && c.round === this.room!.round),
          )
          missing.forEach((id, i) => {
            this.room!.clues = [
              ...this.room!.clues,
              { playerId: id, text: i === 0 ? 'hmm' : '…', round: this.room!.round },
            ]
          })
          this.enterPhase('clueReveal', null)
        }
        break
      }
      case 'clueReveal':
        this.enterPhase('discussion', this.room.settings.discussionSeconds)
        break
      case 'discussion':
        this.startVoting(false)
        break
      case 'voting':
      case 'runoff': {
        const missing = this.voterIds(phase === 'runoff').filter(
          (id) => !this.internal!.roundVotes.some((v) => v.voterId === id && v.round === this.room!.round),
        )
        missing.forEach((id) => {
          const targets = this.voterIds(phase === 'runoff').filter((t) => t !== id)
          const pick = targets.length
            ? targets[Math.floor(Math.random() * targets.length)]
            : null
          this.internal!.roundVotes = [
            ...this.internal!.roundVotes,
            { voterId: id, targetId: pick, round: this.room!.round },
          ]
        })
        this.room.votes = this.internal!.roundVotes
        this.enterPhase('voteReveal', null)
        break
      }
      case 'voteReveal':
        this.resolveVotes()
        break
      case 'elimination':
        this.continueAfterElimination()
        break
      case 'mrWhiteGuess':
        void this.submitMrWhiteGuess('')
        break
      default:
        break
    }
  }

  private clearTimers(): void {
    this.clearBotTimers()
    if (this.ticker != null) {
      window.clearInterval(this.ticker)
      this.ticker = null
    }
  }
}

function bot(
  id: string,
  name: string,
  avatarSeed: number,
  ready = false,
): PublicPlayer {
  return {
    id,
    name,
    avatarSeed,
    avatarUrl: null,
    isBot: true,
    isGuest: false,
    isHost: false,
    connected: true,
    ready,
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function defaultFriends(): Friend[] {
  return [
    { id: 'f1', name: 'Mia', avatarSeed: 7, avatarUrl: null, online: true },
    { id: 'f2', name: 'Carlo', avatarSeed: 21, avatarUrl: null, online: true },
    { id: 'f3', name: 'Priya', avatarSeed: 33, avatarUrl: null, online: false },
  ]
}
