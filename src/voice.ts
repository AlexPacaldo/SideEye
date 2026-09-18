import Peer from 'peerjs'
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
let localStream: MediaStream | null = null
let dataConn: DataConnection | null = null
let waitingForRoster = false

const guestConns = new Map<string, DataConnection>()
const outgoing = new Map<string, MediaConnection>()
const incoming = new Map<string, MediaConnection>()
const remotes = new Map<string, MediaStream>()
const listeners = new Set<() => void>()

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

function setState(patch: Partial<VoiceState>): void {
  state = { ...state, ...patch }
  emit()
}

/* ---------------- remote audio ---------------- */

export interface RemoteEntry {
  id: string
  stream: MediaStream
}

let remoteList: RemoteEntry[] = []

export function getVoiceRemotes(): RemoteEntry[] {
  return remoteList
}

function addRemote(id: string, stream: MediaStream): void {
  remotes.set(id, stream)
  remoteList = [...remoteList, { id, stream }]
  setState({ connected: remotes.size })
}

function removeRemote(id: string): void {
  if (!remotes.delete(id)) return
  remoteList = remoteList.filter((r) => r.id !== id)
  setState({ connected: remotes.size })
}

/* ---------------- data channel ---------------- */

function onData(raw: unknown): void {
  if (!peer || !localStream) return
  const msg = raw as { type?: string; peers?: string[] }
  if (msg?.type !== 'roster' || !Array.isArray(msg.peers)) return
  waitingForRoster = false
  setState({ linking: false })
  for (const id of msg.peers) {
    if (id === ownId) continue
    if (outgoing.has(id) || incoming.has(id)) continue
    const call = peer.call(id, localStream)
    outgoing.set(id, call)
    call.on('stream', (stream) => {
      setState({ issue: null })
      addRemote(id, stream)
    })
    call.on('close', () => {
      outgoing.delete(id)
      removeRemote(id)
    })
    call.on('error', () => {
      outgoing.delete(id)
      removeRemote(id)
      setState({
        issue: 'Audio link to a party member failed — try having everyone re-join voice chat.',
      })
    })
  }
}

/* ---------------- peer wiring ---------------- */

function onPeerOpen(): void {
  if (!peer) return
  setState({ status: 'live', error: null, hosting, selfId: ownId })
  if (hosting || !roomCode) return
  waitingForRoster = true
  setState({ linking: true })
  dataConn = peer.connect(`${PEER_PREFIX}-${roomCode}`, { reliable: true })
  dataConn.on('data', onData)
  dataConn.on('open', () => {
    /* roster arrives over 'data' — listener attached up front */
  })
  dataConn.on('error', () => {
    if (state.status === 'error') return
    failVoice('Could not reach the host\u2019s voice chat.')
  })
  dataConn.on('close', () => {
    if (waitingForRoster) failVoice('The host isn\u2019t on voice chat yet.')
    else if (state.status === 'live') failVoice('The host left voice chat.')
  })
}

function onHostConnection(conn: DataConnection): void {
  conn.on('open', () => {
    guestConns.set(conn.peer, conn)
    conn.send({
      type: 'roster',
      peers: [ownId!, ...Array.from(guestConns.keys())],
    })
  })
  conn.on('close', () => {
    guestConns.delete(conn.peer)
  })
  conn.on('error', () => {
    guestConns.delete(conn.peer)
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
  let message: string
  if (type === 'unavailable-id') {
    message = 'Another voice chat is already running for this room.'
  } else if (type === 'peer-unavailable') {
    message = 'The voice host isn\u2019t connected yet.'
  } else if (type === 'browser-incompatible') {
    message = 'This browser doesn\u2019t support voice chat.'
  } else if (
    type === 'network' ||
    type === 'socket-error' ||
    type === 'socket-closed' ||
    type === 'server-error'
  ) {
    message = 'Could not reach the voice server. Check your connection and try again.'
  } else {
    message = 'Voice chat hit an error. Try again.'
  }
  failVoice(message)
}

/* ---------------- lifecycle ---------------- */

function cleanup(): void {
  roomCode = null
  hosting = false
  ownId = null
  waitingForRoster = false
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
  remotes.clear()
  remoteList = []
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
}

function failVoice(message: string): void {
  if (peer) {
    try {
      peer.destroy()
    } catch {
      /* noop */
    }
    peer = null
  }
  cleanup()
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
  if (peer) {
    try {
      peer.destroy()
    } catch {
      /* noop */
    }
    peer = null
  }
  cleanup()
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

export async function joinVoice(code: string, isHost: boolean): Promise<void> {
  if (peer || state.status === 'joining') return
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

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch {
    roomCode = null
    hosting = false
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

  const id = isHost
    ? `${PEER_PREFIX}-${code}`
    : `${PEER_PREFIX}-${code}-${Math.random().toString(36).slice(2, 10)}`
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