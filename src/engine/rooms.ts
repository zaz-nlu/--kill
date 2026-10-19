import type { Condition, GameState } from './types'
import { evalCondition } from './script'

export interface Hotspot {
  id: string
  label: string
  rect: [number, number, number, number]   // x, y, width, height in % of the 16:9 background
  scene: string
  requires?: Condition
}

export interface RoomDef { id: string; label: string; bg: string; hotspots: Hotspot[] }

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
