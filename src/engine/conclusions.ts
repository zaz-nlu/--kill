import type { GameState } from './types'
import type { ConclusionDef } from './data'

// A conclusion card is earned by solving the reasoning that folds its clues together.
export function ownedConclusions(state: GameState, list: ConclusionDef[]): ConclusionDef[] {
  return list.filter(c => state.flags[`deduce:${c.via}:solved`])
}

// Everything the player's conclusion cards stand for, whether or not the original piece was ever found.
export function foldedIds(state: GameState, list: ConclusionDef[]): Set<string> {
  const out = new Set<string>()
  for (const c of ownedConclusions(state, list)) for (const id of c.fold) out.add(id)
  return out
}

// Showing a conclusion card is showing any clue it folds into itself — but only the clues the player really holds, so a
// card never stands in for a piece that was never found. Not owned (or not a conclusion): nothing.
export function aliasOf(state: GameState, list: ConclusionDef[], itemId: string): string[] {
  const card = ownedConclusions(state, list).find(c => c.id === itemId)
  return card ? card.fold.filter(id => state.evidence.includes(id) || state.testimony.includes(id)) : []
}
