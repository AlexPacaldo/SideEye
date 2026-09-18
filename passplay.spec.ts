import { describe, expect, it, beforeEach } from 'vitest'
import { LocalBackend } from './src/backend/local'
import type { Role } from './src/game/types'

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

async function playPassAndPlay(count = 4) {
  const backend = new LocalBackend()
  await backend.continueAsGuest('Host')
  await backend.createRoom({
    mode: 'passplay',
    name: 'Host',
    passNames: ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, count),
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

    // no per-player voting: the group picks one name, one tap locks it in.
    // everyone is listed, including the holder of the phone
    const voter = s.me!.playerId
    await backend.castVote(voter)
    s = backend.getSnapshot()

    expect(s.room!.phase).toBe('voteReveal')
    const mine = s.room!.tally?.find((t) => t.playerId === voter)
    expect(mine?.count).toBe(1)
  })

  it('offers another clue round or a straight vote after an elimination', async () => {
    const backend = await playPassAndPlay(5)
    let s = backend.getSnapshot()
    for (let i = 0; i < 5; i += 1) {
      await backend.runPassTurn()
      await backend.runPassTurn()
      s = backend.getSnapshot()
    }
    expect(s.room!.phase).toBe('discussion')

    const roles = (backend as unknown as {
      internal: { roles: Record<string, Role> }
    }).internal.roles
    expect(s.me).not.toBeNull()
    const voter = s.me!.playerId
    const civilianId = Object.keys(roles).find(
      (id) => roles[id] === 'civilian' && id !== voter,
    )
    expect(civilianId).toBeTruthy()

    await backend.advance() // discussion -> voting
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('voting')

    await backend.castVote(civilianId!)
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('voteReveal')
    expect(s.room!.tally?.find((t) => t.playerId === civilianId)?.count).toBe(1)

    await backend.advance() // resolve -> elimination
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('elimination')
    expect(s.room!.lastEliminated?.playerId).toBe(civilianId)

    ;(backend as unknown as { room: { deadline: number } }).room.deadline = Date.now() - 1
    await backend.advance() // continue -> decision
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('postElimination')
    expect(s.room!.round).toBe(2)

    // pick: another round of clues
    await backend.nextRound(false)
    s = backend.getSnapshot()
    expect(s.room!.phase).toBe('discussion')
    expect(s.room!.round).toBe(2)
    const alive = s.room!.passOrder
    expect(alive).toHaveLength(4)
    expect(alive).not.toContain(civilianId)
  })
})
