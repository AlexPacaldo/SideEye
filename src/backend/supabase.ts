import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_SETTINGS,
  type CreateRoomInput,
  type GameSettings,
  type RoomSnapshot,
  type SecretInfo,
  type SessionUser,
  type Snapshot,
} from '../game/types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { BackendError, type Backend, type ChatMessage, type Friend, type GameRecord, type PlayerSearchResult } from './types'

interface RoomStateRow extends Partial<RoomSnapshot> {
  me_secret?: SecretInfo | null
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const

  private client: SupabaseClient
  private listeners = new Set<(s: Snapshot) => void>()
  private channel: RealtimeChannel | null = null
  private chatChannel: RealtimeChannel | null = null
  private chatListeners = new Set<(m: ChatMessage) => void>()
  private poll: ReturnType<typeof setInterval> | null = null
  private refreshing = false
  private generation = 0
  private roomCode: string | null = null
  private snapshot: Snapshot = {
    user: null,
    room: null,
    me: null,
    connected: false,
  }

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }

  async init(): Promise<void> {
    const { data } = await this.client.auth.getSession()
    this.snapshot.user = mapUser(data.session?.user ?? null)
    this.client.auth.onAuthStateChange((_evt, session) => {
      this.snapshot.user = mapUser(session?.user ?? null)
      this.emit()
      if (session?.user) void this.refresh()
    })
    const { data: roomCode } = await this.client
      .from('memberships')
      .select('room_code')
      .maybeSingle()
    if (roomCode?.room_code) {
      this.roomCode = roomCode.room_code
      await this.refresh()
      this.subscribeRealtime()
    } else {
      this.snapshot.connected = true
      this.emit()
    }
  }

  getSnapshot(): Snapshot {
    return this.snapshot
  }

  subscribe(listener: (s: Snapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.listeners.forEach((l) => l(this.snapshot))
  }

  /* ---------------- auth ---------------- */

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new BackendError(error.message)
  }

  async continueAsGuest(name: string): Promise<void> {
    const { data: existing } = await this.client.auth.getSession()
    if (!existing.session) {
      const { error } = await this.client.auth.signInAnonymously({
        options: { data: { full_name: name, guest: true } },
      })
      if (error) throw new BackendError(error.message)
    } else if (name) {
      await this.client.auth.updateUser({ data: { full_name: name, guest: true } })
    }
    const { data } = await this.client.auth.getSession()
    this.snapshot.user = mapUser(data.session?.user ?? null)
    this.emit()
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
    this.generation++
    this.leaveChannel()
    this.snapshot.user = null
    this.snapshot.room = null
    this.snapshot.me = null
    this.emit()
  }

  /* ---------------- data ---------------- */

  async getFriends(): Promise<Friend[]> {
    const { data, error } = await this.client
      .from('friends')
      .select('friend_id, profiles(name, avatar_url)')
    if (error) return []
    return (data ?? []).map((row, i) => {
      const profile = row.profiles as { name?: string; avatar_url?: string } | null
      return {
        id: row.friend_id,
        name: profile?.name ?? 'Friend',
        avatarSeed: i * 7 + 3,
        avatarUrl: profile?.avatar_url ?? null,
        online: false,
      }
    })
  }

  async searchPlayers(query: string): Promise<PlayerSearchResult[]> {
    const q = query.trim()
    if (!q) return []
    const { data, error } = await this.client
      .from('profiles')
      .select('id, name, avatar_url')
      .ilike('name', `%${q}%`)
      .limit(10)
    if (error) return []
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url as string | null,
    }))
  }

  async addFriend(friendId: string): Promise<void> {
    const { error } = await this.client.rpc('add_friend', { p_friend_id: friendId })
    if (error) throw new BackendError(error.message)
  }

  async removeFriend(friendId: string): Promise<void> {
    const { error } = await this.client.rpc('remove_friend', { p_friend_id: friendId })
    if (error) throw new BackendError(error.message)
  }

  async listMessages(): Promise<ChatMessage[]> {
    if (!this.roomCode) return []
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('room_code', this.roomCode)
      .order('id', { ascending: false })
      .limit(50)
    if (error) return []
    return (data ?? [])
      .map((row) => mapChatMessage(row as Record<string, unknown>))
      .filter((m): m is ChatMessage => m !== null)
      .reverse()
  }

  async sendMessage(text: string): Promise<void> {
    const { error } = await this.client.rpc('send_message', { p_text: text })
    if (error) throw new BackendError(error.message)
  }

  subscribeChat(listener: (m: ChatMessage) => void): () => void {
    this.chatListeners.add(listener)
    return () => this.chatListeners.delete(listener)
  }

  async getHistory(): Promise<GameRecord[]> {
    const { data, error } = await this.client
      .from('game_history')
      .select('*')
      .order('played_at', { ascending: false })
      .limit(40)
    if (error) return []
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      playedAt: new Date(row.played_at).getTime(),
      mode: row.mode,
      winner: row.winner,
      yourRole: row.your_role,
      rounds: row.rounds,
      players: row.players ?? [],
    }))
  }

  /* ---------------- room ---------------- */

  async createRoom(input: CreateRoomInput): Promise<void> {
    const settings = { ...DEFAULT_SETTINGS, ...input.settings }
    const { data, error } = await this.client.rpc('create_room', {
      p_mode: input.mode,
      p_name: input.name,
      p_settings: settings,
      p_fill_bots: input.fillBots ?? false,
      p_pass_names: input.passNames ?? null,
    })
    if (error) throw new BackendError(error.message)
    this.roomCode = data as string
    await this.refresh()
    this.subscribeRealtime()
  }

  async joinRoom(code: string, name: string): Promise<void> {
    const { error } = await this.client.rpc('join_room', {
      p_code: code.toUpperCase(),
      p_name: name,
    })
    if (error) throw new BackendError(error.message)
    this.roomCode = code.toUpperCase()
    await this.refresh()
    this.subscribeRealtime()
  }

  async leaveRoom(): Promise<void> {
    await this.client.rpc('leave_room')
    this.generation++
    this.leaveChannel()
    this.roomCode = null
    this.snapshot.room = null
    this.snapshot.me = null
    this.emit()
  }

  async setReady(ready: boolean): Promise<void> {
    await this.client.rpc('set_ready', { p_ready: ready })
    await this.refresh()
  }

  async updateSettings(settings: Partial<GameSettings>): Promise<void> {
    const merged = { ...(this.snapshot.room?.settings ?? DEFAULT_SETTINGS), ...settings }
    await this.client.rpc('update_settings', { p_settings: merged })
    await this.refresh()
  }

  async startGame(): Promise<void> {
    await this.run('start_game')
  }

  async acknowledgeRole(): Promise<void> {
    await this.run('ack_role')
  }

  async submitClue(text: string): Promise<void> {
    await this.run('submit_clue', { p_text: text.trim().slice(0, 30) })
  }

  async castVote(targetId: string | null): Promise<void> {
    await this.run('cast_vote', { p_target: targetId })
  }

  async submitMrWhiteGuess(word: string): Promise<void> {
    await this.run('submit_mrwhite_guess', { p_word: word })
  }

  async advance(): Promise<void> {
    await this.run('advance_phase')
  }

  async nextRound(skipClues: boolean): Promise<void> {
    await this.run('next_round', { p_skip_clues: skipClues })
  }

  async skipTurn(): Promise<void> {
    await this.run('skip_turn')
  }

  async runPassTurn(): Promise<void> {
    await this.run('pass_turn')
  }

  async replay(): Promise<void> {
    await this.run('replay')
  }

  async returnToLobby(): Promise<void> {
    await this.run('return_to_lobby')
  }

  private async run(fn: string, args: Record<string, unknown> = {}): Promise<void> {
    const { error } = await this.client.rpc(fn, args)
    if (error) throw new BackendError(error.message)
    await this.refresh()
  }

  /* ---------------- realtime ---------------- */

  private subscribeRealtime(): void {
    this.leaveChannel()
    if (!this.roomCode) return
    const code = this.roomCode
    const channel = this.client
      .channel(`room-${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
        () => void this.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_code=eq.${code}` },
        () => void this.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clues', filter: `room_code=eq.${code}` },
        () => void this.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `room_code=eq.${code}` },
        () => void this.refresh(),
      )
      .subscribe((status) => {
        this.snapshot.connected = status === 'SUBSCRIBED'
        this.emit()
      })
    this.channel = channel
    this.subscribeChatRealtime()
    this.startPolling()
  }

  private subscribeChatRealtime(): void {
    this.removeChatChannel()
    if (!this.roomCode) return
    const code = this.roomCode
    this.chatChannel = this.client
      .channel(`chat-${code}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_code=eq.${code}`,
        },
        (payload) => {
          const msg = mapChatMessage((payload.new ?? {}) as Record<string, unknown>)
          if (!msg) return
          this.chatListeners.forEach((l) => l(msg))
        },
      )
      .subscribe()
  }

  private removeChatChannel(): void {
    if (this.chatChannel) {
      void this.client.removeChannel(this.chatChannel)
      this.chatChannel = null
    }
  }

  private startPolling(): void {
    if (this.poll) return
    this.poll = setInterval(() => void this.refresh(), 1000)
  }

  private leaveChannel(): void {
    if (this.poll) {
      clearInterval(this.poll)
      this.poll = null
    }
    if (this.channel) {
      void this.client.removeChannel(this.channel)
      this.channel = null
    }
    this.removeChatChannel()
    this.chatListeners.clear()
  }

  private async refresh(): Promise<void> {
    if (!this.roomCode || this.refreshing) return
    const gen = this.generation
    const code = this.roomCode
    this.refreshing = true
    try {
      const { data, error } = await this.client.rpc('get_room_state', {
        p_code: code,
      })
      if (error || !data || this.generation !== gen || this.roomCode !== code) return
      const state = data as RoomStateRow
      this.snapshot.room = normalizeRoom(state, code)
      const { data: secret } = await this.client.rpc('get_my_secret', {
        p_code: code,
      })
      if (this.generation !== gen || this.roomCode !== code) return
      const info = (secret as (SecretInfo & { playerId?: string }) | null) ?? null
      this.snapshot.me = {
        playerId: info?.playerId ?? this.snapshot.user?.id ?? '',
        secret: info ? { role: info.role, word: info.word } : null,
      }
      this.snapshot.connected = true
      this.emit()
    } finally {
      this.refreshing = false
    }
  }
}

function mapUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
} | null): SessionUser | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  return {
    id: user.id,
    name: (meta.full_name as string) ?? (meta.name as string) ?? 'Player',
    avatarUrl: (meta.avatar_url as string) ?? null,
    isGuest: Boolean(meta.guest) || !user.email,
    email: user.email ?? null,
  }
}

function mapChatMessage(row: Record<string, unknown>): ChatMessage | null {
  if (!row || typeof row.id === 'undefined' || typeof row.player_id !== 'string') {
    return null
  }
  return {
    id: String(row.id),
    playerId: row.player_id,
    name: (row.name as string) ?? 'Player',
    text: (row.text as string) ?? '',
    createdAt:
      typeof row.created_at === 'string' ? Date.parse(row.created_at) : Date.now(),
  }
}

function normalizeRoom(state: RoomStateRow, code: string): RoomSnapshot {
  return {
    code,
    mode: state.mode ?? 'online',
    phase: state.phase ?? 'lobby',
    round: state.round ?? 0,
    hostId: state.hostId ?? '',
    players: state.players ?? [],
    settings: state.settings ?? DEFAULT_SETTINGS,
    eliminatedIds: state.eliminatedIds ?? [],
    clues: state.clues ?? [],
    submittedIds: state.submittedIds ?? [],
    votes: state.votes ?? [],
    tally: state.tally ?? null,
    runoffIds: state.runoffIds ?? null,
    deadline: state.deadline ?? null,
    timerSeconds: state.timerSeconds ?? null,
    mrWhiteGuessingId: state.mrWhiteGuessingId ?? null,
    mrWhiteGuessCorrect: state.mrWhiteGuessCorrect ?? null,
    lastEliminated: state.lastEliminated ?? null,
    winner: state.winner ?? null,
    reveal: state.reveal ?? null,
    passIndex: state.passIndex ?? 0,
    passRevealed: state.passRevealed ?? false,
    passOrder: state.passOrder ?? [],
  }
}
