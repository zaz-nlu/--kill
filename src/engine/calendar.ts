import type { Condition, GameState, NpcId } from './types'
import { evalCondition } from './script'

// 12:00 (lunch) and 18:00 (dinner) are fixed-event hours: no investigation, only the shop and moving on.
export const EVENT_HOURS = [12, 18]

export interface ActionDef {
  id: string
  label: string
  location: string
  days: number[]
  minHour?: number
  maxHour?: number
  requiresEvidence?: string[]
  requires?: Condition
  scene?: string   // a story scene, or…
  room?: string    // …a room to investigate
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

export function markActionDone(state: GameState, id: string): void {
  state.flags[`done:${id}`] = true
}

export function availableActions(state: GameState, all: ActionDef[]): ActionDef[] {
  if (EVENT_HOURS.includes(state.hour)) return []
  return all.filter(a => {
    if (state.flags[`done:${a.id}`]) return false
    if (a.requires && !evalCondition(state, a.requires)) return false
    if (!a.days.includes(state.day)) return false
    if (a.minHour !== undefined && state.hour < a.minHour) return false
    if (a.maxHour !== undefined && state.hour > a.maxHour) return false
    if (a.requiresEvidence && !a.requiresEvidence.every(id => state.evidence.includes(id))) return false
    return true
  })
}
