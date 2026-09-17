import type { ClueEntry } from '../components/game/ClueStack'
import type { RoomSnapshot } from './types'

export function buildClueEntries(
  room: RoomSnapshot,
  meId: string,
): ClueEntry[] {
  const alive = room.players.filter((p) => !room.eliminatedIds.includes(p.id))
  return alive.map((p) => {
    const clue = room.clues.find(
      (c) => c.playerId === p.id && c.round === room.round,
    )
    return {
      playerId: p.id,
      name: p.name,
      text: clue?.text ?? '…',
      isYou: p.id === meId,
      blank: !clue,
    }
  })
}
