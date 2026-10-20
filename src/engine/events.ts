import type { Condition, GameState } from './types'
import { evalCondition } from './script'

// A scene that fires by itself once the clock reaches `hour` on `day` (14:30 WeChat, lunch, the 19:00 call…).
export interface EventDef { id: string; day: number; hour: number; scene: string; requires?: Condition }

const key = (id: string) => `event:${id}`

export function markEventDone(state: GameState, id: string): void {
  state.flags[key(id)] = true
}

// The first event (in file order) that is due and has not fired yet.
export function nextEvent(state: GameState, events: EventDef[]): EventDef | null {
  for (const e of events) {
    if (e.day !== state.day || state.hour < e.hour || state.flags[key(e.id)]) continue
    if (e.requires && !evalCondition(state, e.requires)) continue
    return e
  }
  return null
}
