import type { GameState } from './types'
import { loadSave, type LoadResult } from './save'

// Ten manual slots and one automatic one. Slot 1 keeps the key the single-slot save always used, so an old save is
// simply slot 1.
export const SLOT_COUNT = 10
export type SlotId = number | 'auto'

export interface SlotMeta {
  day: number
  hour: number
  evidence: number
  testimony: number
  at: number
  timeline?: { uid: string; node: number }   // the rewind-tree node this save was taken at, if it still exists
}

export function slotKey(slot: SlotId): string {
  if (slot === 'auto') return 'jiudian-auto'
  return slot === 1 ? 'jiudian-save' : `jiudian-save-${slot}`
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readSlotRaw(slot: SlotId): string | null {
  return read(slotKey(slot))
}

export function readSlot(slot: SlotId): LoadResult {
  return loadSave(readSlotRaw(slot))
}

export function slotInfo(slot: SlotId): SlotMeta | null {
  const raw = readSlotRaw(slot)
  if (raw === null) return null
  const r = loadSave(raw)
  if (!r.ok) return null
  let meta: Partial<SlotMeta> = {}
  try {
    meta = (JSON.parse(raw) as { meta?: Partial<SlotMeta> }).meta ?? {}
  } catch { /* the state parsed a moment ago; this cannot fail */ }
  return {
    day: meta.day ?? r.state.day,
    hour: meta.hour ?? r.state.hour,
    evidence: meta.evidence ?? r.state.evidence.length,
    testimony: meta.testimony ?? r.state.testimony.length,
    at: meta.at ?? 0,
    timeline: meta.timeline,
  }
}

export function writeSlot(slot: SlotId, state: GameState, timeline?: SlotMeta['timeline'], now: number = Date.now()): boolean {
  const meta: SlotMeta = {
    day: state.day, hour: state.hour, evidence: state.evidence.length, testimony: state.testimony.length, at: now, timeline,
  }
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify({ version: 1, state, meta }))
    return true
  } catch {
    return false
  }
}

export function clearSlot(slot: SlotId): void {
  try {
    localStorage.removeItem(slotKey(slot))
  } catch { /* nothing to clear */ }
}

export function allSlots(): { slot: number; meta: SlotMeta | null }[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, meta: slotInfo(i + 1) }))
}

export function anySave(): boolean {
  return slotInfo('auto') !== null || allSlots().some(s => s.meta !== null) || readSlotRaw(1) !== null
}
