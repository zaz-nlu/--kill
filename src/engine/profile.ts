// The player's record across chapters: which chapters were cleared and with what ending, which recaps were seen, and
// whether the one-off "saves are per chapter now" note was shown. Nothing here affects play; it is only read by the
// chapter list and by the unlock rule.
import type { ChapterDef } from './types'

const PROFILE_KEY = 'jiudian-profile'

export interface ClearedRecord { ending: string; at: number }

export interface Profile {
  cleared: Record<string, ClearedRecord>
  seenRecap: Record<string, boolean>
  seenChapterNote: boolean
}

function emptyProfile(): Profile {
  return { cleared: {}, seenRecap: {}, seenChapterNote: false }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw === null) return emptyProfile()
    const p = JSON.parse(raw) as Partial<Profile>
    const out = emptyProfile()
    if (p && typeof p === 'object') {
      if (p.cleared && typeof p.cleared === 'object') {
        for (const [id, rec] of Object.entries(p.cleared)) {
          if (rec && typeof rec.ending === 'string' && typeof rec.at === 'number') out.cleared[id] = { ending: rec.ending, at: rec.at }
        }
      }
      if (p.seenRecap && typeof p.seenRecap === 'object') {
        for (const [id, seen] of Object.entries(p.seenRecap)) if (seen === true) out.seenRecap[id] = true
      }
      out.seenChapterNote = p.seenChapterNote === true
    }
    return out
  } catch {
    return emptyProfile()
  }
}

function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch { /* storage blocked: the record lives on in memory this session */ }
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
