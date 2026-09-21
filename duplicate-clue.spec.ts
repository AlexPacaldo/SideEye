import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalBackend } from './src/backend/local'

class LS {
  private m = new Map<string, string>()
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v)
  }
  removeItem(k: string): void {
    this.m.delete(k)
  }
  clear(): void {
    this.m.clear()
  }
}

let timeouts: Set<ReturnType<typeof setInterval>>
let intervals: Set<ReturnType<typeof setInterval>>

beforeEach(() => {
  timeouts = new Set()
  intervals = new Set()
  ;(globalThis as Record<string, unknown>).localStorage = new LS()
  ;(globalThis as Record<string, unknown>).window = {
    setTimeout(cb: () => void, ms: number) {
      const id = setTimeout(cb, ms)
      timeouts.add(id)
      return id
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) {
      clearTimeout(id)
      timeouts.delete(id)
    },
    setInterval(cb: () => void, ms: number) {
      const id = setInterval(cb, ms)
      intervals.add(id)
      return id
    },
    clearInterval(id: ReturnType<typeof setInterval>) {
      clearInterval(id)
      intervals.delete(id)
    },
  }
})

afterEach(() => {
  timeouts.forEach((id) => clearTimeout(id))
  intervals.forEach((id) => clearInterval(id))
  timeouts.clear()
  intervals.clear()
})

async function onlineRoom(): Promise<LocalBackend> {
  const backend = new LocalBackend()
  await backend.continueAsGuest('Host')
  await backend.createRoom({
    mode: 'online',
    name: 'Host',
    fillBots: true,
    settings: { clueSeconds: 60, voteSeconds: 60, discussionSeconds: 60 },
  })
  await backend.startGame()
  return backend
}

type ClueBackend = { submitClueFor: (id: string, text: string) => void }
type PhaseBackend = { enterPhase: (phase: 'clue', timerSeconds: number | null) => void }

function forceCluePhase(backend: LocalBackend): string[] {
  ;(backend as unknown as PhaseBackend).enterPhase('clue', 60)
  return (backend as LocalBackend).getSnapshot().room!.players.map((p) => p.id)
}

describe('online duplicate clues', () => {
  it('rejects a clue word that is already on the board', async () => {
    const backend = await onlineRoom()
    const ids = forceCluePhase(backend)
    const b = backend as unknown as ClueBackend

    b.submitClueFor(ids[0], 'fire')
    expect(() => b.submitClueFor(ids[1], 'fire')).toThrow(/already/)
    expect(() => b.submitClueFor(ids[1], '  FIRE ')).toThrow(/already/)

    b.submitClueFor(ids[1], 'smoke')
    const clues = backend
      .getSnapshot()
      .room!.clues.filter((c) => c.round === 1)
    expect(clues.map((c) => c.playerId).sort()).toEqual([ids[0], ids[1]].sort())
    expect(clues.map((c) => c.text).sort()).toEqual(['fire', 'smoke'])
  })

  it('lets the skip filler repeat across different players', async () => {
    const backend = await onlineRoom()
    const ids = forceCluePhase(backend)
    const b = backend as unknown as ClueBackend

    b.submitClueFor(ids[0], '…')
    b.submitClueFor(ids[1], '…')
    const clues = backend.getSnapshot().room!.clues.filter((c) => c.round === 1)
    expect(clues).toHaveLength(2)
  })

  it('lets pass & play reuse the same word', async () => {
    const backend = new LocalBackend()
    await backend.continueAsGuest('H')
    await backend.createRoom({
      mode: 'passplay',
      name: 'H',
      passNames: ['A', 'B', 'C'],
      settings: { clueSeconds: 60, voteSeconds: 60, discussionSeconds: 60 },
    })
    ;(backend as unknown as PhaseBackend).enterPhase('clue', null)
    const ids = backend.getSnapshot().room!.players.map((p) => p.id)
    const b = backend as unknown as ClueBackend

    b.submitClueFor(ids[0], 'fire')
    expect(() => b.submitClueFor(ids[1], 'fire')).not.toThrow()
    const round = backend.getSnapshot().room!.round
    expect(
      backend.getSnapshot().room!.clues.filter((c) => c.round === round),
    ).toHaveLength(2)
  })
})