import Peer from 'peerjs'
import { useSyncExternalStore } from 'react'
import type { DataConnection, MediaConnection } from 'peerjs'

export type VoiceStatus = 'idle' | 'joining' | 'live' | 'error' | 'left'

export interface VoiceState {
  status: VoiceStatus
  error: string | null
  muted: boolean
  connected: number
  hosting: boolean
  selfId: string | null
  linking: boolean
  issue: string | null
}

export interface VoiceParticipant {
  playerId: string
  name: string
}

interface RosterEntry {
  id: string
  playerId: string
  name: string
}

const PEER_PREFIX = 'sideeye'

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'peerjs',
    credential: 'peerjs',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'peerjs',
    credential: 'peerjs',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: 'peerjs',
    credential: 'peerjs',
  },
  {
    urls: 'turn:global.relay.metered.ca:443?transport=tcp',
    username: 'peerjs',
    credential: 'peerjs',
  },
]

let peer: Peer | null = null
let roomCode: string | null = null
let hosting = false
let ownId: string | null = null
let myInfo: VoiceParticipant | null = null
let localStream: MediaStream | null = null
let dataConn: DataConnection | null = null

const guestConns = new Map<string, DataConnection>()
const peerRefs = new Map<string, VoiceParticipant>()
const outgoing = new Map<string, MediaConnection>()
const incoming = new Map<string, MediaConnection>()
const remotes = new Map<string, MediaStream>()
const listeners = new Set<() => void>()

let reconnectTimer: number | null = null
let reconnectAttempts = 0
let realHost = false
let candidateHost = false
let hubHost: string | null = null

let state: VoiceState = {
  status: 'idle',
  error: null,
  muted: false,
  connected: 0,
  hosting: false,
  selfId: null,
  linking: false,
  issue: null,
}

/* ---------------- store ---------------- */

function emit(): void {
  listeners.forEach((l) => l())
}

export function getVoice(): VoiceState {
  return state
}

export function subscribeVoice(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function updateVoiceHost(hostPlayerId: string | null): void {
  hubHost = hostPlayerId
}

function setState(patch: Partial<VoiceState>): void {
  state = { ...state, ...patch }
  emit()
}

/* ---------------- remote audio ---------------- */

export interface RemoteEntry {
  id: string
  playerId: string
  name: string
  stream: MediaStream
}

let remoteList: RemoteEntry[] = []

export function getVoiceRemotes(): RemoteEntry[] {
  return remoteList
}

export function getVoiceTalking(): Record<string, boolean> {
  return talkingSnapshot
}

export function useVoiceTalking(): Record<string, boolean> {
  return useSyncExternalStore(subscribeVoice, getVoiceTalking)
}

/* ---------------- talking detection ---------------- */

const TALK_THRESHOLD = 0.012
const TALK_RELEASE_MS = 350
const talkingState = new Map<string, boolean>()
const lastSound = new Map<string, number>()
let talkingSnapshot: Record<string, boolean> = {}

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
  return audioCtx
}

interface Detector {
  stop: () => void
}

const detectors = new Map<string, Detector>()

function updateTalking(playerId: string, rms: number): void {
  const now = Date.now()
  const was = talkingState.get(playerId) ?? false
  let next = was
  if (rms >= TALK_THRESHOLD) {
    next = true
    lastSound.set(playerId, now)
  } else if (now - (lastSound.get(playerId) ?? 0) > TALK_RELEASE_MS) {
    next = false
    lastSound.delete(playerId)
  }
  if (next === was) return
  talkingState.set(playerId, next)
  const snap: Record<string, boolean> = {}
  talkingState.forEach((v, k) => {
    if (v) snap[k] = true
  })
  talkingSnapshot = snap
  emit()
}

function attachDetector(peerId: string, playerId: string, stream: MediaStream): void {
  if (detectors.has(peerId)) return
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.35
    source.connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i]
      updateTalking(playerId, Math.sqrt(sum / buffer.length))
    }, 120)
    detectors.set(peerId, {
      stop: () => {
        window.clearInterval(timer)
        try {
          source.disconnect()
          analyser.disconnect()
        } catch {
          /* noop */
        }
      },
    })
  } catch {
    /* noop */
  }
}

function detachDetector(peerId: string): void {
  const det = detectors.get(peerId)
  if (!det) return
  det.stop()
  detectors.delete(peerId)
}

function addRemote(peerId: string, stream: MediaStream): void {
  remotes.set(peerId, stream)
  refreshEntry(peerId)
  setState({ connected: remotes.size })
}

function refreshEntry(peerId: string): void {
  const stream = remotes.get(peerId)
  if (!stream) return
  const ref = peerRefs.get(peerId)
  const entry: RemoteEntry = {
    id: peerId,
    playerId: ref?.playerId ?? peerId,
    name: ref?.name ?? 'Guest',
    stream,
  }
  remoteList = [...remoteList.filter((r) => r.id !== peerId), entry]
  attachDetector(peerId, entry.playerId, stream)
  emit()
}

function removeRemote(peerId: string, playerId?: string): void {
  if (!remotes.delete(peerId)) return
  remoteList = remoteList.filter((r) => r.id !== peerId)
  detachDetector(peerId)
  if (playerId && talkingState.get(playerId)) {
    talkingState.set(playerId, false)
    const snap: Record<string, boolean> = {}
    talkingState.forEach((v, k) => {
      if (v) snap[k] = true
    })
    talkingSnapshot = snap
  }
  setState({ connected: remotes.size })
}

function dropPeer(peerId: string): void {
  const call = outgoing.get(peerId) ?? incoming.get(peerId)
  if (call) {
    try {
      call.close()
    } catch {
      /* noop */
    }
  }
  outgoing.delete(peerId)
  incoming.delete(peerId)
  const ref = peerRefs.get(peerId)
  removeRemote(peerId, ref?.playerId)
  peerRefs.delete(peerId)
}

/* ---------------- data channel ---------------- */

function onData(raw: unknown): void {
  if (!peer || !localStream) return
  const msg = raw as {
    type?: string
    me?: RosterEntry
    peers?: RosterEntry[]
  }
  if (msg?.type !== 'roster' || !Array.isArray(msg.peers)) return
  setState({ linking: false })
  const all = msg.me ? [msg.me, ...msg.peers] : msg.peers
  for (const ent of all) {
    if (!ent?.id) continue
    peerRefs.set(ent.id, { playerId: ent.playerId || ent.id, name: ent.name || 'Guest' })
    refreshEntry(ent.id)
    if (ent.id === ownId) continue
    if (outgoing.has(ent.id) || incoming.has(ent.id)) continue
    const call = peer.call(ent.id, localStream)
    outgoing.set(ent.id, call)
    call.on('stream', (stream) => {
      setState({ issue: null })
      addRemote(ent.id, stream)
    })
    call.on('close', () => {
      outgoing.delete(ent.id)
      removeRemote(ent.id)
    })
    call.on('error', () => {
      outgoing.delete(ent.id)
      removeRemote(ent.id)
      setState({
        issue: 'Audio link to a party member failed — they may need to re-join voice chat.',
      })
    })
  }
}

/* ---------------- peer wiring ---------------- */

function hubIdFor(code: string, hostPlayerId: string): string {
  const slug = hostPlayerId
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 12)
  return `${PEER_PREFIX}-${code}-h-${slug || 'host'}`
}

function onPeerOpen(): void {
  if (!peer) return
  reconnectAttempts = 0
  if (!hosting) candidateHost = false
  setState({ status: 'live', error: null, hosting, selfId: ownId })
  if (hosting || !roomCode || !hubHost) return
  setState({ linking: true })
  dataConn = peer.connect(hubIdFor(roomCode, hubHost), { reliable: true })
  dataConn.on('data', onData)
  dataConn.on('open', () => {
    try {
      dataConn?.send({
        type: 'join',
        playerId: myInfo?.playerId ?? ownId,
        name: myInfo?.name ?? 'Guest',
      })
    } catch {
      /* noop */
    }
  })
  dataConn.on('error', () => {
    if (state.status === 'error') return
    scheduleReconnect('Could not reach the host\u2019s voice chat.')
  })
  dataConn.on('close', () => {
    if (state.status === 'error' || state.status === 'left') return
    scheduleReconnect('The voice host left — reconnecting…')
  })
}

function broadcastRoster(): void {
  if (!hosting || !ownId) return
  const entries: RosterEntry[] = [
    {
      id: ownId,
      playerId: myInfo?.playerId ?? ownId,
      name: myInfo?.name ?? 'Host',
    },
    ...Array.from(guestConns.keys()).map((pid) => {
      const ref = peerRefs.get(pid)
      return {
        id: pid,
        playerId: ref?.playerId ?? pid,
        name: ref?.name ?? 'Guest',
      }
    }),
  ]
  const payload = { type: 'roster', me: entries[0], peers: entries }
  guestConns.forEach((conn) => {
    try {
      conn.send(payload)
    } catch {
      /* noop */
    }
  })
}

function onHostConnection(conn: DataConnection): void {
  conn.on('open', () => {
    guestConns.set(conn.peer, conn)
    broadcastRoster()
  })
  conn.on('data', (raw) => {
    const msg = raw as { type?: string; playerId?: string; name?: string }
    if (msg?.type === 'join' && msg.playerId) {
      peerRefs.set(conn.peer, {
        playerId: msg.playerId,
        name: msg.name ?? msg.playerId,
      })
      broadcastRoster()
      refreshEntry(conn.peer)
    }
  })
  conn.on('close', () => {
    guestConns.delete(conn.peer)
    dropPeer(conn.peer)
    broadcastRoster()
  })
  conn.on('error', () => {
    guestConns.delete(conn.peer)
    dropPeer(conn.peer)
  })
}

function onIncomingCall(call: MediaConnection): void {
  incoming.set(call.peer, call)
  if (localStream) {
    try {
      call.answer(localStream)
    } catch {
      /* noop */
    }
  }
  call.on('stream', (stream) => {
    setState({ issue: null })
    addRemote(call.peer, stream)
  })
  call.on('close', () => {
    incoming.delete(call.peer)
    removeRemote(call.peer)
  })
  call.on('error', () => {
    incoming.delete(call.peer)
    removeRemote(call.peer)
  })
}

function onPeerError(err: { type?: string }): void {
  if (!peer) return
  const type = err?.type
  if (type === 'unavailable-id') {
    if (hosting && realHost) {
      scheduleReconnect('The voice room slot for this game is still occupied — reclaiming…')
    } else if (hosting) {
      scheduleReconnect('The voice room slot is busy — retrying shortly…')
    } else {
      failVoice('Another voice chat is already running for this room.')
    }
  } else if (type === 'peer-unavailable') {
    scheduleReconnect('Looking for the voice host…')
  } else if (type === 'browser-incompatible') {
    failVoice('This browser doesn\u2019t support voice chat.')
  } else if (
    type === 'network' ||
    type === 'socket-error' ||
    type === 'socket-closed' ||
    type === 'server-error'
  ) {
    scheduleReconnect('Could not reach the voice server. Reconnecting…')
  } else {
    failVoice('Voice chat hit an error. Try again.')
  }
}

/* ---------------- lifecycle ---------------- */

function resetVoiceCore(): void {
  if (peer) {
    try {
      peer.destroy()
    } catch {
      /* noop */
    }
    peer = null
  }
  if (dataConn) {
    try {
      dataConn.close()
    } catch {
      /* noop */
    }
    dataConn = null
  }
  guestConns.forEach((dc) => {
    try {
      dc.close()
    } catch {
      /* noop */
    }
  })
  guestConns.clear()
  outgoing.forEach((c) => {
    try {
      c.close()
    } catch {
      /* noop */
    }
  })
  outgoing.clear()
  incoming.forEach((c) => {
    try {
      c.close()
    } catch {
      /* noop */
    }
  })
  incoming.clear()
  peerRefs.clear()
  detectors.forEach((d) => d.stop())
  detectors.clear()
  remotes.clear()
  remoteList = []
  talkingState.clear()
  lastSound.clear()
  talkingSnapshot = {}
  ownId = null
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect(reason: string): void {
  if (reconnectTimer != null) return
  if (state.status === 'error' || state.status === 'left') return
  reconnectAttempts += 1
  setState({ status: 'joining', issue: reason, linking: true })
  const delay = Math.min(10000, 500 * reconnectAttempts)
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    if (!roomCode || state.status === 'error' || state.status === 'left') return
    const code = roomCode
    const info = myInfo
    const wasHost = hosting
    const escalate = !hosting && candidateHost && reconnectAttempts >= 3
    resetVoiceCore()
    void joinVoice(
      code,
      wasHost || escalate,
      info ?? { playerId: 'guest', name: 'Guest' },
      candidateHost,
      realHost,
      hubHost ?? undefined,
    )
  }, delay)
}

function failVoice(message: string): void {
  resetVoiceCore()
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
  realHost = false
  candidateHost = false
  reconnectAttempts = 0
  hubHost = null
  roomCode = null
  hosting = false
  myInfo = null
  setState({
    status: 'error',
    error: message,
    muted: false,
    connected: 0,
    hosting: false,
    selfId: null,
    linking: false,
    issue: null,
  })
}

export function leaveVoice(): void {
  const hadPeer = Boolean(peer)
  resetVoiceCore()
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
  realHost = false
  candidateHost = false
  reconnectAttempts = 0
  hubHost = null
  roomCode = null
  hosting = false
  myInfo = null
  setState({
    status: hadPeer ? 'left' : 'idle',
    error: null,
    muted: false,
    connected: 0,
    hosting: false,
    selfId: null,
    linking: false,
    issue: null,
  })
}

export async function joinVoice(
  code: string,
  isHost: boolean,
  me: VoiceParticipant,
  canHost = true,
  designated = isHost,
  hostPlayerId?: string,
): Promise<void> {
  if (peer || state.status === 'joining') return
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  realHost = designated
  candidateHost = canHost
  hubHost = hostPlayerId ?? (isHost ? me.playerId : hubHost)
  setState({
    status: 'joining',
    error: null,
    muted: false,
    connected: 0,
    hosting: isHost,
    selfId: null,
    linking: false,
    issue: null,
  })
  roomCode = code
  hosting = isHost
  myInfo = me

  if (!localStream || localStream.getAudioTracks().every((t) => t.readyState === 'ended')) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      roomCode = null
      hosting = false
      myInfo = null
      hubHost = null
      setState({
        status: 'error',
        error:
          'Could not reach your microphone. Check the browser permission and try again.',
        connected: 0,
        hosting: false,
        selfId: null,
        linking: false,
        issue: null,
      })
      return
    }
  }

  const id = isHost
    ? hubIdFor(code, me.playerId)
    : `${PEER_PREFIX}-${code}-g-${Math.random().toString(36).slice(2, 10)}`
  ownId = id

  const p = new Peer(id, { config: { iceServers: STUN_SERVERS } })
  peer = p
  p.on('open', onPeerOpen)
  p.on('connection', onHostConnection)
  p.on('call', onIncomingCall)
  p.on('error', onPeerError)
  p.on('disconnected', () => {
    if (!peer) return
    try {
      peer.reconnect()
    } catch {
      /* noop */
    }
  })
}

/* ---------------- mutable state ---------------- */

export function toggleVoiceMute(): boolean {
  const next = !state.muted
  setState({ muted: next })
  localStream?.getAudioTracks().forEach((t) => {
    t.enabled = !next
  })
  return next
}