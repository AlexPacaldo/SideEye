import type { Role, Winner } from './types'

/**
 * EXP economy:
 *  +10   finish a game
 *  +20   win as a civilian
 *  +40   win as an infiltrator (Undercover or Mr. White)
 *  +120  MR. WHITE WINS (rare — solo win from the final guess)
 *  +5    survived the game
 *  +5    per round played (capped at +25)
 * Levels: every 100 EXP = 1 level.
 */
export const EXP = {
  playBonus: 10,
  winBonus: { civilians: 20, infiltrators: 40, mr_white: 120 } as Record<Winner, number>,
  survivorBonus: 5,
  roundBonus: 5,
  maxRoundBonus: 25,
} as const

export const EXP_PER_LEVEL = 100

/** Roles that belong to the winning side for a given winner. */
export function winningRole(winner: Winner): Role[] {
  if (winner === 'civilians') return ['civilian']
  if (winner === 'mr_white') return ['mrwhite']
  return ['undercover', 'mrwhite']
}

export function levelInfo(exp: number): { level: number; intoLevel: number } {
  return {
    level: Math.floor(exp / EXP_PER_LEVEL) + 1,
    intoLevel: exp % EXP_PER_LEVEL,
  }
}

export interface ExpBreakdown {
  play: number
  win: number
  survivor: number
  rounds: number
  total: number
}

export function breakdownExp(
  winner: Winner,
  role: Role,
  survived: boolean,
  rounds: number,
): ExpBreakdown {
  const play = EXP.playBonus
  const win = winningRole(winner).includes(role) ? EXP.winBonus[winner] : 0
  const survivor = survived ? EXP.survivorBonus : 0
  const roundsBonus = Math.min(EXP.maxRoundBonus, Math.max(0, rounds) * EXP.roundBonus)
  return { play, win, survivor, rounds: roundsBonus, total: play + win + survivor + roundsBonus }
}