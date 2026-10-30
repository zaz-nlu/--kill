import type { GameState } from './types'
import { loadSave, type LoadResult } from './save'
import { DEFAULT_CHAPTER } from './state'

// Ten manual slots and one automatic one, per chapter: `jiudian-auto:c1`, `jiudian-save:c1:3`, …
export const SLOT_COUNT = 10
export type SlotId = number | 'auto'

export interface SlotMeta {
  chapter?: string   // which chapter the save belongs to (absent only on saves written before chapters)
  day: number
  hour: number
  evidence: number
  testimony: number
  at: number
  timeline?: { uid: string; node: number }   // the rewind-tree node this save was taken at, if it still exists
}

export function slotKey(slot: SlotId, chapter: string = DEFAULT_CHAPTER.id): string {
  if (slot === 'auto') return `jiudian-auto:${chapter}`
  return `jiudian-save:${chapter}:${slot}`
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readSlotRaw(slot: SlotId, chapter: string = DEFAULT_CHAPTER.id): string | null {
  return read(slotKey(slot, chapter))
}

// A save is only ever read back into its own chapter: a slot holding another chapter's run is refused, never merged
// into the one being played.
export function readSlot(slot: SlotId, chapter: string = DEFAULT_CHAPTER.id): LoadResult {
  const r = loadSave(readSlotRaw(slot, chapter))
  if (!r.ok) return r
  if (r.state.chapter !== chapter) return { ok: false, reason: 'chapter' }
  return r
}

export function slotInfo(slot: SlotId, chapter: string = DEFAULT_CHAPTER.id): SlotMeta | null {
  const raw = readSlotRaw(slot, chapter)
  if (raw === null) return null
  const r = loadSave(raw)
  if (!r.ok) return null
  let meta: Partial<SlotMeta> = {}
  try {
    meta = (JSON.parse(raw) as { meta?: Partial<SlotMeta> }).meta ?? {}
  } catch { /* the state parsed a moment ago; this cannot fail */ }
  return {
    chapter: meta.chapter ?? r.state.chapter,
    day: meta.day ?? r.state.day,
    hour: meta.hour ?? r.state.hour,
    evidence: meta.evidence ?? r.state.evidence.length,
    testimony: meta.testimony ?? r.state.testimony.length,
    at: meta.at ?? 0,
    timeline: meta.timeline,
  }
}

export function writeSlot(slot: SlotId, state: GameState, timeline?: SlotMeta['timeline'], now: number = Date.now(), chapter: string = state.chapter): boolean {
  const meta: SlotMeta = {
    chapter, day: state.day, hour: state.hour, evidence: state.evidence.length, testimony: state.testimony.length, at: now, timeline,
  }
  try {
    localStorage.setItem(slotKey(slot, chapter), JSON.stringify({ version: 2, state, meta }))
    return true
  } catch {
    return false
  }
}

export function clearSlot(slot: SlotId, chapter: string = DEFAULT_CHAPTER.id): void {
  try {
    localStorage.removeItem(slotKey(slot, chapter))
  } catch { /* nothing to clear */ }
}

export function allSlots(chapter: string = DEFAULT_CHAPTER.id): { slot: number; meta: SlotMeta | null }[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, meta: slotInfo(i + 1, chapter) }))
}

export function anySave(chapter: string = DEFAULT_CHAPTER.id): boolean {
  return slotInfo('auto', chapter) !== null || allSlots(chapter).some(s => s.meta !== null) || readSlotRaw(1, chapter) !== null
}

// ---- one-time move of the single-chapter save keys to the chapter-aware ones ----

const MIGRATION_KEY = 'jiudian-migrated-v2'
// What the saves were called before chapters: one automatic save and ten manual ones, all case 1.
const LEGACY_KEYS: [string, SlotId][] = [
  ['jiudian-auto', 'auto'],
  ['jiudian-save', 1],
  ...Array.from({ length: SLOT_COUNT - 1 }, (_, i): [string, SlotId] => [`jiudian-save-${i + 2}`, i + 2]),
]

// A version-1 save belongs to case 1 and carries no chapter of its own; stamp it so it loads as a chapter save.
function upgradeLegacy(raw: string): string | null {
  let parsed: { version?: unknown; state?: Record<string, unknown>; meta?: Record<string, unknown> } | null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.state) return null
  if (parsed.version === 2) return raw
  if (parsed.version !== 1) return null
  return JSON.stringify({
    version: 2,
    state: { ...parsed.state, version: 2, chapter: DEFAULT_CHAPTER.id },
    meta: { ...(parsed.meta ?? {}), chapter: DEFAULT_CHAPTER.id },
  })
}

// Copies every old-key save to case 1's new key once. The old keys are left alone.
// Returns true when at least one old save was actually copied (the chapter list says so, once).
export function migrateLegacySaves(): boolean {
  let migrated = false
  try {
    if (localStorage.getItem(MIGRATION_KEY) !== null) return false
    for (const [legacy, slot] of LEGACY_KEYS) {
      const raw = localStorage.getItem(legacy)
      if (raw === null) continue
      const target = slotKey(slot, DEFAULT_CHAPTER.id)
      const upgraded = upgradeLegacy(raw)
      if (upgraded !== null && localStorage.getItem(target) === null) {
        localStorage.setItem(target, upgraded)
        migrated = true
      }
    }
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch { /* storage blocked: try again next time */ }
  return migrated
}
