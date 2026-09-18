import { describe, expect, it, beforeEach } from 'vitest'
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

let timers: Map<ReturnType<typeof setInterval>, true>

beforeEach(() => {
  timers = new Map()
  ;(globalThis as Record<string, unknown>).localStorage = new LS()
  ;(globalThis as Record<string, unknown>).window = {
    setInterval(cb: () => void, ms: number) {
      const id = setInterval(cb, ms)
      timers.set(id, true)
      return id
    },
    clearInterval(id: ReturnType<typeof setInterval>) {
      clearInterval(id)
      timers.delete(id)
    },
  }
})

function advanceTickerFinishes(ms = 5000): void {
  // no-op: ticker only fires on deadline expiry via real timers
  void ms
}

async function playPassAndPlay() {
  const backend = new LocalBackend()
  await backend.continueAsGuest('Host')
  await backend.createRoom({
    mode: 'passplay',
    name: 'Host',
    passNames: ['A', 'B', 'C', 'D'],
    settings: {
      clueSeconds: 30,
      voteSeconds: 30,
      discussionSeconds: 30,
    },
  })
  await backend.startGame()
  return backend
}

describe('pass & play', () => {
  it('reveals each player their own word exactly once in order (roleReveal)', async () => {
    const backend = await playPassAndPlay()
    let s = backend.getSnapshot()
    const room = s.room!
    expect(room.phase).toBe('roleReveal')
    expect(room.mode).toBe('passplay')

    const order: string[] = []
    const seen = new Map<string, unknown>()
    // passIndex is private; derive order by observing me.playerId at each gate
    for (let i = 0; i < 4; i += 1) {
      // GATE: proceed
      expect(s.me?.secret).toBeNull()
      expect(s.room!.passRevealed).toBe(false)
      const gatePlayer = s.me!.playerId
      await backend.runPassTurn()
      s = backend.getSnapshot()
      // REVEAL
      expect(s.room!.passRevealed).toBe(true)
      expect(s.me!.playerId).toBe(gatePlayer)
      expect(s.me!.secret).not.toBeNull()
      seen.set(gatePlayer, s.me!.secret!.word)
      // HIDE & PASS
      await backend.runPassTurn()
      s = backend.getSnapshot()
      expect(s.room!.passRevealed).toBe(false)
      order.push(gatePlayer)
    }

    expect(order).toHaveLength(4)
    expect(new Set(order).size).toBe(4)
    expect(s.room!.phase).toBe('discussion')
    expect(s.room!.passOrder).toEqual(order)
    void advanceTickerFinishes
  })

  it('skips clue typing: shows the speak order, then votes by tapping names', async () => {
    const backend = await playPassAndPlay()
    let s = backend.getSnapshot()
    // roleReveal: pass through all without assertions
    for (let i = 0; i < 4; i += 1) {
      await backend.runPassTurn()
      await backend.runPassTurn()
      s = backend.getSnapshot()
    }
    expect(s.room!.phase).toBe('discussion')
    expect(s.me!.secret).toBeNull()
    expect(s.room!.clues).toHaveLength(0)
    const order = [...s.room!.passOrder]
    expect(order).toHaveLength(4)

    // no clue phase ever appears; straight into voting from the order screen
    await backend.advance()
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('voting')

    // no pass gate during voting: anyone taps a name directly
    for (let i = 0; i < 4; i += 1) {
      const voter = s.me!.playerId
      const target = order[(i + 1) % order.length]
      expect(target).not.toBe(voter)
      await backend.castVote(target)
      s = backend.getSnapshot()
    }

    expect(s.room!.phase).toBe('voteReveal')
    expect(s.room!.tally).toHaveLength(4)
  })
})