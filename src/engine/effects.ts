import type { Effect, GameState } from './types'
import { learnIntel } from './flow'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function applyEffect(state: GameState, e: Effect): void {
  switch (e.kind) {
    case 'affinity':
      state.affinity[e.npc] = clamp(state.affinity[e.npc] + e.delta, 0, 100)
      break
    case 'trust':
      state.trust = state.trust + e.delta
      break
    case 'money':
      state.money = Math.max(0, state.money + e.delta)
      break
    case 'danger':
      state.danger = clamp(state.danger + e.delta, 0, 100)
      break
    case 'hp':
      state.hp = clamp(state.hp + e.delta, 0, 3)
      break
    case 'evidence':
      if (!state.evidence.includes(e.id)) state.evidence.push(e.id)
      break
    case 'testimony':
      if (!state.testimony.includes(e.id)) state.testimony.push(e.id)
      break
    case 'flag':
      state.flags[e.key] = e.value
      break
    case 'time':
      state.hour = Math.max(state.hour, e.hour)
      break
    case 'learnIntel':
      learnIntel(state, e.intel)
      break
  }
}
