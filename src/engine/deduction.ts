import type { GameState } from './types'

// The nightly reasoning (spec 6.7): put two or three clues together and reach the day's conclusion.
export interface DeductionDef {
  id: string
  prompt: string
  pick: number                 // how many clues fit in the slots (at least two must be chosen)
  answer: string[]             // the right set, in any order
  hints: string[]              // shown one at a time after each wrong guess
  trap?: { items: string[]; flag: string; line: string }  // a tempting wrong theory: never marked wrong, it just ends the evening
}

export const MAX_MISSES = 3

export interface DeductionSession { def: DeductionDef; misses: number }

export type DeductionOutcome =
  | { kind: 'incomplete' }
  | { kind: 'solved' }
  | { kind: 'wrong'; hint: string; left: number }
  | { kind: 'forced' }
  | { kind: 'trap'; line: string }

export function startDeduction(def: DeductionDef): DeductionSession {
  return { def, misses: 0 }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

// If you never found one of the pieces the reasoning simply does not happen (and costs you nothing).
export function canDeduce(state: GameState, def: DeductionDef): boolean {
  return def.answer.every(id => state.evidence.includes(id) || state.testimony.includes(id))
}

export function submitDeduction(state: GameState, session: DeductionSession, picked: string[]): DeductionOutcome {
  const d = session.def
  if (picked.length < 2 || picked.length > d.pick || new Set(picked).size !== picked.length) return { kind: 'incomplete' }
  if (sameSet(picked, d.answer)) {
    state.flags[`deduce:${d.id}:solved`] = true
    return { kind: 'solved' }
  }
  if (d.trap && sameSet(picked, d.trap.items)) {
    state.flags[d.trap.flag] = true
    return { kind: 'trap', line: d.trap.line }
  }
  session.misses += 1
  if (session.misses >= MAX_MISSES) {
    state.flags[`deduce:${d.id}:solved`] = true
    state.flags[`deduce:${d.id}:forced`] = true // you were handed the answer: it will cost persuasion in the finale
    return { kind: 'forced' }
  }
  return { kind: 'wrong', hint: d.hints[Math.min(session.misses - 1, d.hints.length - 1)] ?? '再想想。', left: MAX_MISSES - session.misses }
}

export function forcedCount(state: GameState): number {
  return Object.keys(state.flags).filter(k => /^deduce:.+:forced$/.test(k) && state.flags[k]).length
}
