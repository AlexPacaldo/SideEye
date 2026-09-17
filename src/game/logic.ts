import type {
  GameSettings,
  PublicPlayer,
  PublicVote,
  Role,
  TallyEntry,
  Winner,
} from './types'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(length = 5): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export function clampUndercoverCount(count: number, playerCount: number): number {
  const max = Math.max(1, Math.floor((playerCount - 1) / 2))
  return Math.min(Math.max(1, count), max)
}

export function roleCounts(
  playerCount: number,
  settings: GameSettings,
): { civilian: number; undercover: number; mrwhite: number } {
  const undercover = clampUndercoverCount(settings.undercoverCount, playerCount)
  const mrwhite = settings.mrWhiteEnabled && playerCount >= 4 ? 1 : 0
  const civilian = Math.max(0, playerCount - undercover - mrwhite)
  return { civilian, undercover, mrwhite }
}

export function assignRoles(
  players: PublicPlayer[],
  settings: GameSettings,
): Record<string, Role> {
  const counts = roleCounts(players.length, settings)
  const bag: Role[] = [
    ...Array<Role>(counts.civilian).fill('civilian'),
    ...Array<Role>(counts.undercover).fill('undercover'),
    ...Array<Role>(counts.mrwhite).fill('mrwhite'),
  ]
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  const out: Record<string, Role> = {}
  players.forEach((p, i) => {
    out[p.id] = bag[i] ?? 'civilian'
  })
  return out
}

export function tallyVotes(
  votes: PublicVote[],
  round: number,
  aliveIds: string[],
): TallyEntry[] {
  const counts = new Map<string, number>()
  aliveIds.forEach((id) => counts.set(id, 0))
  votes
    .filter((v) => v.round === round && v.targetId)
    .forEach((v) => {
      if (!v.targetId || !aliveIds.includes(v.targetId)) return
      counts.set(v.targetId, (counts.get(v.targetId) ?? 0) + 1)
    })
  return [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count)
}

export function topVoted(
  tally: TallyEntry[],
  restrictTo?: string[],
): { leaders: string[]; max: number } {
  const entries = restrictTo
    ? tally.filter((t) => restrictTo.includes(t.playerId))
    : tally
  const max = entries.reduce((m, e) => Math.max(m, e.count), 0)
  const leaders = entries.filter((e) => e.count === max).map((e) => e.playerId)
  return { leaders, max }
}

export function livingCivilians(
  aliveIds: string[],
  roles: Record<string, Role>,
): string[] {
  return aliveIds.filter((id) => roles[id] === 'civilian')
}

export function livingUndercover(
  aliveIds: string[],
  roles: Record<string, Role>,
): string[] {
  return aliveIds.filter((id) => roles[id] === 'undercover')
}

export interface WinCheck {
  winner: Winner | null
  needsMrWhiteGuess: boolean
  reason: string
}

export interface WinContext {
  aliveIds: string[]
  roles: Record<string, Role>
  mrWhiteAlive: boolean
  undercoverAlive: boolean
  mrWhiteGuessUsed: boolean
  lastEliminatedRole: Role | null
}

export function checkWin(ctx: WinContext): WinCheck {
  const {
    aliveIds,
    roles,
    mrWhiteAlive,
    undercoverAlive,
    mrWhiteGuessUsed,
    lastEliminatedRole,
  } = ctx
  const civs = livingCivilians(aliveIds, roles)
  const ucs = livingUndercover(aliveIds, roles)

  if (
    lastEliminatedRole === 'mrwhite' &&
    !mrWhiteGuessUsed &&
    mrWhiteAlive === false
  ) {
    return {
      winner: null,
      needsMrWhiteGuess: true,
      reason: 'Mr. White gets one last shot.',
    }
  }

  if (!undercoverAlive && !mrWhiteAlive) {
    return {
      winner: 'civilians',
      needsMrWhiteGuess: false,
      reason: 'You caught them all.',
    }
  }

  if (mrWhiteAlive && ucs.length === 0 && civs.length <= 1) {
    return {
      winner: null,
      needsMrWhiteGuess: true,
      reason: 'Only Mr. White and one civilian left. He has to guess.',
    }
  }

  if (!undercoverAlive && mrWhiteAlive && civs.length === 1) {
    return {
      winner: null,
      needsMrWhiteGuess: true,
      reason: 'One civilian, one Mr. White. Guess time.',
    }
  }

  if (ucs.length >= civs.length && !(mrWhiteAlive && civs.length === 0)) {
    return {
      winner: 'undercover',
      needsMrWhiteGuess: false,
      reason: 'The undercover blended in too well.',
    }
  }

  if (civs.length === 0 && !mrWhiteAlive) {
    return {
      winner: 'undercover',
      needsMrWhiteGuess: false,
      reason: 'No civilians left standing.',
    }
  }

  return { winner: null, needsMrWhiteGuess: false, reason: '' }
}

export function resolveMrWhiteGuess(
  correct: boolean,
  aliveIds: string[],
  roles: Record<string, Role>,
): Winner {
  if (correct) return 'mrwhite'
  const ucs = livingUndercover(aliveIds, roles)
  return ucs.length > 0 ? 'undercover' : 'civilians'
}

export function clampSettingsForCount(
  settings: GameSettings,
  playerCount: number,
): GameSettings {
  return {
    ...settings,
    undercoverCount: clampUndercoverCount(
      settings.undercoverCount,
      playerCount,
    ),
    mrWhiteEnabled: settings.mrWhiteEnabled && playerCount >= 4,
  }
}
