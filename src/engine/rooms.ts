import type { Condition, GameState } from './types'
import { evalCondition } from './script'

export interface Hotspot {
  id: string
  label: string
  rect: [number, number, number, number]   // x, y, width, height in % of the 16:9 background
  scene: string
  requires?: Condition
}

export interface RoomDef {
  id: string
  label: string
  bg: string
  hotspots: Hotspot[]
  intro?: string    // scene played on the way in, before the hotspots appear
  budget?: number   // a sneaked search: you only get to look at this many spots before you have to leave (no timer)
  cutoff?: string   // scene played when the budget runs out
}

const seenKey = (id: string) => `seen:${id}`

export function isSeen(state: GameState, hotspotId: string): boolean {
  return state.flags[seenKey(hotspotId)] === true
}

export function markSeen(state: GameState, hotspotId: string): void {
  state.flags[seenKey(hotspotId)] = true
}

export function visibleHotspots(state: GameState, room: RoomDef): (Hotspot & { seen: boolean })[] {
  return room.hotspots
    .filter(h => !h.requires || evalCondition(state, h.requires))
    .map(h => ({ ...h, seen: isSeen(state, h.id) }))
}
