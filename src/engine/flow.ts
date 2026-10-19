import type { GameState, IntelId, LeakTrigger } from './types'

export const SLIP_FOR_INTEL: Record<IntelId, string> = {
  phone: 'T26',
  draft: 'T27',
  trophy: 'T28',
  card: 'T29',
  attack: 'T22',
}

const OUTSOURCERS = ['shaoxy', 'lucheng']

export function learnIntel(state: GameState, intel: IntelId): void {
  if (state.intel[intel] === 'unknown') state.intel[intel] = 'clean'
}

export function leakIntel(state: GameState, intel: IntelId[]): IntelId[] {
  const newlyLeaked: IntelId[] = []
  for (const i of intel) {
    if (state.intel[i] === 'clean') {
      state.intel[i] = 'leaked'
      newlyLeaked.push(i)
    }
  }
  return newlyLeaked
}

export function isSlipAvailable(state: GameState, intel: IntelId): boolean {
  return state.intel[intel] === 'clean'
}

export function triggerLeak(state: GameState, t: LeakTrigger): IntelId[] {
  if (t === 'lunchTellAll') return leakIntel(state, ['phone', 'draft', 'trophy'])
  if (t === 'groupPost' || t === 'coffeeTellAll') return leakIntel(state, ['phone', 'draft'])
  if (t === 'tellAllToLimo') {
    const known = (Object.keys(state.intel) as IntelId[]).filter(i => state.intel[i] !== 'unknown')
    return leakIntel(state, known)
  }
  // told to one person
  if (OUTSOURCERS.includes(t.toNpc)) return leakIntel(state, t.intel)
  if (t.toNpc !== 'laohan' && t.intel.includes('attack')) return leakIntel(state, ['attack'])
  return []
}
