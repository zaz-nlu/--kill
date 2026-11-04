// The player's record across chapters: which chapters were cleared and with what ending, which recaps were seen, and
// whether the one-off "saves are per chapter now" note was shown. Nothing here affects play; it is only read by the
// chapter list and by the unlock rule.
import type { ChapterDef } from './types'
import { scopeSuffix } from './account'

// One record per account (`jiudian-profile@name`); a guest's has no suffix.
const profileKey = () => `jiudian-profile${scopeSuffix()}`

export interface ClearedRecord { ending: string; at: number }

export interface Profile {
  cleared: Record<string, ClearedRecord>
  seenRecap: Record<string, boolean>
  seenChapterNote: boolean
}

function emptyProfile(): Profile {
  return { cleared: {}, seenRecap: {}, seenChapterNote: false }
}

// Reads a profile from untrusted JSON (local storage, or the server): whatever is malformed is dropped.
export function parseProfile(p: unknown): Profile {
  const out = emptyProfile()
  if (!p || typeof p !== 'object') return out
  const { cleared, seenRecap, seenChapterNote } = p as Partial<Profile>
  if (cleared && typeof cleared === 'object') {
    for (const [id, rec] of Object.entries(cleared)) {
      if (rec && typeof rec.ending === 'string' && typeof rec.at === 'number') out.cleared[id] = { ending: rec.ending, at: rec.at }
    }
  }
  if (seenRecap && typeof seenRecap === 'object') {
    for (const [id, seen] of Object.entries(seenRecap)) if (seen === true) out.seenRecap[id] = true
  }
  out.seenChapterNote = seenChapterNote === true
  return out
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(profileKey())
    return raw === null ? emptyProfile() : parseProfile(JSON.parse(raw))
  } catch {
    return emptyProfile()
  }
}

// Whoever keeps the profile elsewhere (the cloud) hears about every change made through this module.
const listeners: (() => void)[] = []
export function onProfileChange(fn: () => void): void {
  listeners.push(fn)
}

function writeProfile(p: Profile): void {
  try {
    localStorage.setItem(profileKey(), JSON.stringify(p))
  } catch { /* storage blocked: the record lives on in memory this session */ }
}

function saveProfile(p: Profile): void {
  writeProfile(p)
  for (const fn of listeners) fn()
}

// Two copies of one player's record become one that has everything either knew: a chapter cleared on either, a recap
// seen on either, and for a chapter cleared on both the later clear. The server merges the same way.
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const out = emptyProfile()
  for (const p of [a, b]) {
    for (const [id, rec] of Object.entries(p.cleared)) {
      if (!out.cleared[id] || rec.at > out.cleared[id].at) out.cleared[id] = rec
    }
    Object.assign(out.seenRecap, p.seenRecap)
    out.seenChapterNote ||= p.seenChapterNote
  }
  return out
}

// Folds a copy from the server into this device's record, without announcing it as a local change.
export function absorbProfile(remote: unknown): void {
  writeProfile(mergeProfiles(loadProfile(), parseProfile(remote)))
}

// Records that a chapter was finished. `endingId` is the ending that was reached; whether it counts as a clear is
// decided by `isUnlocked`, which reads the chapter's own endings table.
export function markCleared(chapter: string, endingId: string, now: number = Date.now()): void {
  const p = loadProfile()
  p.cleared[chapter] = { ending: endingId, at: now }
  saveProfile(p)
}

// A chapter is open when the one before it was cleared with an ending that counts (`clears`). The first is always open.
export function isUnlocked(chapter: ChapterDef, all: Record<string, ChapterDef>): boolean {
  if (chapter.order <= 1) return true
  const previous = Object.values(all).find(c => c.order === chapter.order - 1)
  if (!previous) return true
  const record = loadProfile().cleared[previous.id]
  if (!record) return false
  return previous.endings[record.ending]?.clears === true
}

export function markRecapSeen(chapter: string): void {
  const p = loadProfile()
  p.seenRecap[chapter] = true
  saveProfile(p)
}

export function markChapterNoteSeen(): void {
  const p = loadProfile()
  p.seenChapterNote = true
  saveProfile(p)
}
