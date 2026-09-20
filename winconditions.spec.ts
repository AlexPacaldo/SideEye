import { describe, expect, it, beforeEach } from 'vitest'
import { LocalBackend } from './src/backend/local'
import { checkWin } from './src/game/logic'
import type { GameSettings, Role } from './src/game/types'

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

type RoleMap = Record<string, Role>

function check(state: {
  aliveIds: string[]
  roles: RoleMap
  pendingMrWhiteGuess?: boolean
  mrWhiteGuessCorrect?: boolean | null
}) {
  return checkWin({
    aliveIds: state.aliveIds,
    roles: state.roles,
    pendingMrWhiteGuess: state.pendingMrWhiteGuess ?? false,
    mrWhiteGuessCorrect: state.mrWhiteGuessCorrect ?? null,
  })
}

describe('checkWin — win conditions', () => {
  it('TEST 1: last Undercover eliminated, no Mr. White left -> civilians win', () => {
    const result = check({
      aliveIds: ['c1', 'c2', 'c3'],
      roles: { c1: 'civilian', c2: 'civilian', c3: 'civilian' },
    })
    expect(result.gameOver).toBe(true)
    expect(result.winner).toBe('civilians')
    expect(result.needsMrWhiteGuess).toBe(false)
  })

  it('TEST 2: 2 civilians vs 1 Undercover + 1 Mr. White -> infiltrators win on parity', () => {
    const result = check({
      aliveIds: ['a', 'b', 'c', 'd'],
      roles: {
        a: 'civilian',
        b: 'civilian',
        c: 'undercover',
        d: 'mrwhite',
      },
    })
    expect(result.gameOver).toBe(true)
    expect(result.winner).toBe('infiltrators')
  })

  it('TEST 3: 1 civilian vs 1 Undercover -> infiltrators win immediately', () => {
    const result = check({
      aliveIds: ['a', 'b'],
      roles: { a: 'civilian', b: 'undercover' },
    })
    expect(result.gameOver).toBe(true)
    expect(result.winner).toBe('infiltrators')
  })

  it('TEST 4: voted-out Mr. White pauses the game for a final guess', () => {
    const alive = ['c1', 'c2', 'c3', 'c4']
    const roles: RoleMap = {
      c1: 'civilian',
      c2: 'civilian',
      c3: 'civilian',
      c4: 'civilian',
    }

    const pending = check({ aliveIds: alive, roles, pendingMrWhiteGuess: true })
    expect(pending.gameOver).toBe(false)
    expect(pending.winner).toBeNull()
    expect(pending.needsMrWhiteGuess).toBe(true)

    const correct = check({
      aliveIds: alive,
      roles,
      pendingMrWhiteGuess: false,
      mrWhiteGuessCorrect: true,
    })
    expect(correct.gameOver).toBe(true)
    expect(correct.winner).toBe('mr_white')

    const wrong = check({
      aliveIds: alive,
      roles,
      pendingMrWhiteGuess: false,
      mrWhiteGuessCorrect: false,
    })
    expect(wrong.gameOver).toBe(true)
    expect(wrong.winner).toBe('civilians')
  })

  it('TEST 5: wrong Mr. White guess with a surviving Undercover keeps the game going', () => {
    const result = check({
      aliveIds: ['a', 'b', 'c', 'd', 'e'],
      roles: {
        a: 'civilian',
        b: 'civilian',
        c: 'civilian',
        d: 'civilian',
        e: 'undercover',
      },
      mrWhiteGuessCorrect: false,
    })
    expect(result.gameOver).toBe(false)
    expect(result.winner).toBeNull()
    expect(result.needsMrWhiteGuess).toBe(false)
  })

  it('TEST 6: one of two Undercovers eliminated, another remains -> keep playing', () => {
    const result = check({
      aliveIds: ['a', 'b', 'c', 'd'],
      roles: {
        a: 'civilian',
        b: 'civilian',
        c: 'civilian',
        d: 'undercover',
      },
    })
    expect(result.gameOver).toBe(false)
    expect(result.winner).toBeNull()
  })

  it('TEST 7: 2 civilians vs 2 Undercover -> infiltrators win on parity', () => {
    const result = check({
      aliveIds: ['a', 'b', 'c', 'd'],
      roles: {
        a: 'civilian',
        b: 'civilian',
        c: 'undercover',
        d: 'undercover',
      },
    })
    expect(result.gameOver).toBe(true)
    expect(result.winner).toBe('infiltrators')
  })

  it('supports multiple Mr. White players in the infiltrator count', () => {
    const result = check({
      aliveIds: ['a', 'b', 'c'],
      roles: { a: 'civilian', b: 'mrwhite', c: 'mrwhite' },
    })
    expect(result.gameOver).toBe(true)
    expect(result.winner).toBe('infiltrators')
  })
})

describe('win flow — LocalBackend', () => {
  async function newRoom(
    count: number,
    settings: Partial<GameSettings> = {},
  ): Promise<LocalBackend> {
    const backend = new LocalBackend()
    await backend.continueAsGuest('Host')
    await backend.createRoom({
      mode: 'passplay',
      name: 'Host',
      passNames: Array.from({ length: count }, (_, i) => `P${i}`),
      settings: { clueSeconds: 30, voteSeconds: 30, discussionSeconds: 30, ...settings },
    })
    await backend.startGame()
    return backend
  }

  async function passThroughRoleReveal(backend: LocalBackend, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await backend.runPassTurn()
      await backend.runPassTurn()
    }
    expect(backend.getSnapshot().room!.phase).toBe('discussion')
  }

  async function voteOutAndEliminate(backend: LocalBackend, targetId: string): Promise<void> {
    await backend.advance() // discussion -> voting
    await backend.castVote(targetId)
    expect(backend.getSnapshot().room!.phase).toBe('voteReveal')
    await backend.advance() // voteReveal -> elimination
    expect(backend.getSnapshot().room!.phase).toBe('elimination')
    expect(backend.getSnapshot().room!.lastEliminated?.playerId).toBe(targetId)
    await backend.advance() // elimination -> continue / guess / game over
  }

  it('TEST 1 flow: the last Undercover is voted out -> civilians win', async () => {
    const backend = await newRoom(4, { mrWhiteEnabled: false })
    await passThroughRoleReveal(backend, 4)
    const internal = (backend as unknown as { internal: { roles: RoleMap } }).internal
    const ucId = Object.keys(internal.roles).find((id) => internal.roles[id] === 'undercover')!
    expect(ucId).toBeTruthy()

    await voteOutAndEliminate(backend, ucId)

    const room = backend.getSnapshot().room!
    expect(room.phase).toBe('gameOver')
    expect(room.winner).toBe('civilians')
  })

  it('TEST 4 flow: voted-out Mr. White guesses right -> Mr. White wins', async () => {
    const backend = await newRoom(6)
    await passThroughRoleReveal(backend, 6)
    const internal = (backend as unknown as {
      internal: { roles: RoleMap; passOrder: string[]; secretWord: string }
    }).internal
    const ids = internal.passOrder
    internal.roles = {
      [ids[0]]: 'civilian',
      [ids[1]]: 'civilian',
      [ids[2]]: 'civilian',
      [ids[3]]: 'civilian',
      [ids[4]]: 'civilian',
      [ids[5]]: 'mrwhite',
    }
    const mwId = ids[5]

    await voteOutAndEliminate(backend, mwId)

    let room = backend.getSnapshot().room!
    expect(room.phase).toBe('mrWhiteGuess')
    expect(room.mrWhiteGuessingId).toBe(mwId)
    expect(room.winner).toBeNull()

    await backend.submitMrWhiteGuess(internal.secretWord)

    room = backend.getSnapshot().room!
    expect(room.phase).toBe('gameOver')
    expect(room.winner).toBe('mr_white')
    expect(room.mrWhiteGuessCorrect).toBe(true)
  })

  it('TEST 4 flow: voted-out Mr. White guesses wrong -> civilians win', async () => {
    const backend = await newRoom(6)
    await passThroughRoleReveal(backend, 6)
    const internal = (backend as unknown as {
      internal: { roles: RoleMap; passOrder: string[] }
    }).internal
    const ids = internal.passOrder
    internal.roles = {
      [ids[0]]: 'civilian',
      [ids[1]]: 'civilian',
      [ids[2]]: 'civilian',
      [ids[3]]: 'civilian',
      [ids[4]]: 'civilian',
      [ids[5]]: 'mrwhite',
    }
    const mwId = ids[5]

    await voteOutAndEliminate(backend, mwId)
    expect(backend.getSnapshot().room!.phase).toBe('mrWhiteGuess')

    await backend.submitMrWhiteGuess('way off base')

    const room = backend.getSnapshot().room!
    expect(room.phase).toBe('gameOver')
    expect(room.winner).toBe('civilians')
    expect(room.mrWhiteGuessCorrect).toBe(false)
  })

  it('TEST 5 flow: wrong Mr. White guess with a surviving Undercover continues the game', async () => {
    const backend = await newRoom(6)
    await passThroughRoleReveal(backend, 6)
    const internal = (backend as unknown as {
      internal: { roles: RoleMap; passOrder: string[] }
    }).internal
    const ids = internal.passOrder
    internal.roles = {
      [ids[0]]: 'civilian',
      [ids[1]]: 'civilian',
      [ids[2]]: 'civilian',
      [ids[3]]: 'civilian',
      [ids[4]]: 'undercover',
      [ids[5]]: 'mrwhite',
    }
    const mwId = ids[5]

    await voteOutAndEliminate(backend, mwId)
    expect(backend.getSnapshot().room!.phase).toBe('mrWhiteGuess')

    await backend.submitMrWhiteGuess('not the secret word')

    const room = backend.getSnapshot().room!
    expect(room.phase).toBe('postElimination')
    expect(room.winner).toBeNull()
    expect(room.mrWhiteGuessCorrect).toBe(false)
    expect(room.round).toBe(2)
    expect(room.eliminatedIds).toContain(mwId)
  })

  it('TEST 6 flow: one of two Undercovers voted out -> game continues', async () => {
    const backend = await newRoom(5, { mrWhiteEnabled: false, undercoverCount: 2 })
    await passThroughRoleReveal(backend, 5)
    const internal = (backend as unknown as { internal: { roles: RoleMap } }).internal
    const ucIds = Object.keys(internal.roles).filter((id) => internal.roles[id] === 'undercover')
    expect(ucIds.length).toBe(2)

    await voteOutAndEliminate(backend, ucIds[0])

    const room = backend.getSnapshot().room!
    expect(room.phase).toBe('postElimination')
    expect(room.winner).toBeNull()
    expect(room.round).toBe(2)
  })
})