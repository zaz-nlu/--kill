import type { GameState } from './types'

export type DangerTier = 'calm' | 'uneasy' | 'tense' | 'critical'
export type Risk = 'high' | 'normal' | 'safe'

// Spec 6.8: the player never sees the number, only these four moods.
export function dangerTier(danger: number): DangerTier {
  if (danger >= 90) return 'critical'
  if (danger >= 60) return 'tense'
  if (danger >= 30) return 'uneasy'
  return 'calm'
}

// Only the top tier can actually hurt (spec 6.4, v4.1): below it a wrong answer just loses the clue.
export function isFatal(state: GameState): boolean {
  return dangerTier(state.danger) === 'critical'
}

// Spec 6.4. "high" = stairwell / car park / the office at night; "safe" = police station, subway car, a policeman at your side.
const CHANCE: Record<Exclude<DangerTier, 'calm'>, Record<Exclude<Risk, 'safe'>, number>> = {
  uneasy: { high: 0.15, normal: 0 },
  tense: { high: 0.3, normal: 0.1 },
  critical: { high: 0.5, normal: 0.2 },
}

export function attackChance(danger: number, risk: Risk): number {
  const tier = dangerTier(danger)
  if (tier === 'calm' || risk === 'safe') return 0
  return CHANCE[tier][risk]
}

export function rollAttack(state: GameState, risk: Risk, rng: () => number): boolean {
  return rng() < attackChance(state.danger, risk)
}

// Consistency rule: in the hour somebody attacks you, Limo's desk is empty. A player who checks will find that out.
const awayKey = (day: number, hour: number) => `limo_away:${day}:${hour}`

export function recordLimoAway(state: GameState, hour: number): void {
  state.flags[awayKey(state.day, hour)] = true
}

export function wasLimoAway(state: GameState, day: number, hour: number): boolean {
  return state.flags[awayKey(day, hour)] === true
}
