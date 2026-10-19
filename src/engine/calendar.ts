import type { GameState, NpcId } from './types'

export interface ActionDef {
  id: string
  label: string
  location: string
  days: number[]
  minHour?: number
  maxHour?: number
  requiresEvidence?: string[]
  scene: string
  costHours: number
  npc?: NpcId   // who the action talks to; a gift can be attached to it
}

export function advanceHour(state: GameState, n = 1): void {
  state.hour += n
}

export function endDay(state: GameState, opts: { rested: boolean }): void {
  let danger = state.danger - 15
  if (opts.rested) {
    danger -= 10
    state.hp = Math.min(3, state.hp + 1)
  }
  state.danger = Math.max(0, danger)
  state.day += 1
  state.hour = 9
  state.giftedToday = []
}

export function availableActions(state: GameState, all: ActionDef[]): ActionDef[] {
  return all.filter(a => {
    if (!a.days.includes(state.day)) return false
    if (a.minHour !== undefined && state.hour < a.minHour) return false
    if (a.maxHour !== undefined && state.hour > a.maxHour) return false
    if (a.requiresEvidence && !a.requiresEvidence.every(id => state.evidence.includes(id))) return false
    return true
  })
}
