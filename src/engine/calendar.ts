import type { Condition, GameState, NpcId } from './types'
import { evalCondition } from './script'
import type { Risk } from './danger'

// 12:00 (lunch) and 18:00 (dinner) are fixed-event hours: no investigation, only the shop and moving on.
export const EVENT_HOURS = [12, 18]
// From day 2 on the day opens at 08:00: one hour before the 09:00 meeting that starts the fixed events, for an early arrival.
export const DAY_START = 8
// The last hour you can still act in on days 1-4: 21:00, after the lights go out. (Day 5 stops at 11:00.)
export const LAST_HOUR = 21

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
  kind?: 'key' | 'aux' | 'affinity' | 'trust' | 'useless' | 'trap'  // spec 9: what sort of action this is
  pinned?: boolean // always on the menu (the 19:00 appointment)
  meal?: boolean   // something to do at the 12:00 / 18:00 meal hours — and only then
  risk?: Risk   // 'high' (stairs, car park, night office), 'safe' (police, subway car); default ordinary
  attack?: string // scene played if an attack lands after this action
  away?: boolean  // the scene is an attack by Limo: his desk is empty in the hour it happens
  until?: string  // the action stays on offer (a try costs the hour) until this flag is set
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
  state.hour = DAY_START
  state.giftedToday = []
}

export function markActionDone(state: GameState, id: string): void {
  state.flags[`done:${id}`] = true
}

export function availableActions(state: GameState, all: ActionDef[]): ActionDef[] {
  // At the meal hours only meal actions are on offer; at every other hour they are not.
  const mealHour = EVENT_HOURS.includes(state.hour)
  return all.filter(a => {
    if (Boolean(a.meal) !== mealHour) return false
    if (state.flags[`done:${a.id}`]) return false
    if (a.requires && !evalCondition(state, a.requires)) return false
    if (!a.days.includes(state.day)) return false
    if (a.minHour !== undefined && state.hour < a.minHour) return false
    if (a.maxHour !== undefined && state.hour > a.maxHour) return false
    if (a.requiresEvidence && !a.requiresEvidence.every(id => state.evidence.includes(id))) return false
    return true
  })
}

// ---- one menu per hour (spec 6.1: 3–5 options, at least one key action and one useless-or-trap action) ----

export const MENU_SIZE = 5

// A tiny deterministic generator: the same hour on the same day always draws the same menu, so reloading does not re-roll it.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function menuFor(state: GameState, pool: ActionDef[], size = MENU_SIZE): ActionDef[] {
  if (pool.length <= size) return pool
  const rnd = mulberry32(state.day * 100 + state.hour)
  const rest = pool.filter(a => !a.pinned)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const chosen: ActionDef[] = pool.filter(a => a.pinned)
  const take = (pred: (a: ActionDef) => boolean, n: number) => {
    for (const a of rest) {
      if (n <= 0 || chosen.length >= size) break
      if (!chosen.includes(a) && pred(a)) {
        chosen.push(a)
        n -= 1
      }
    }
  }
  take(a => a.kind === 'key', 2)
  take(a => a.kind === 'useless' || a.kind === 'trap', 1)
  take(() => true, size - chosen.length)
  return pool.filter(a => chosen.includes(a)) // keep the order of the file
}

// How many more hours today you can still act in (12:00 and 18:00 are events, day 5 stops at 11:00).
export function slotsLeft(state: GameState): number {
  const first = state.day === 1 ? 13 : DAY_START
  const last = state.day === 5 ? 11 : LAST_HOUR
  let n = 0
  for (let h = Math.max(state.hour, first); h <= last; h++) if (!EVENT_HOURS.includes(h)) n += 1
  return n
}
