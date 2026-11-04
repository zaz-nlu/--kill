import { ref } from 'vue'
import { api, ApiError, currentUser } from './account'
import { absorbProfile, loadProfile, onProfileChange } from './profile'
import { onSlotEvent, parseSlotKey, slotKey, type SlotId } from './saves'

// Keeps the signed-in account's saves on the server. The local copy is always written first, so a failed upload
// loses nothing: the next sync sends whichever side is newer.
export const syncError = ref('')

interface Remote { chapter: string; slot: string; data: string; at: number }

const path = (chapter: string, slot: SlotId | string) => `/saves/${chapter}/${slot}`

function fail(e: unknown): void {
  // an expired login has already signed the player out; say so instead of "sync failed"
  syncError.value = e instanceof ApiError ? e.message : '云端同步失败'
}

function savedAt(raw: string): number {
  try {
    return (JSON.parse(raw) as { meta?: { at?: number } }).meta?.at ?? 0
  } catch {
    return 0
  }
}

// The chapter record (cleared chapters, seen recaps) is sent whole; the server merges it with what it has and sends
// back the union, which this device then takes in.
async function syncProfile(): Promise<void> {
  const user = currentUser.value
  const { profile } = await api<{ profile: unknown }>('PUT', '/profile', { profile: loadProfile() })
  if (currentUser.value === user) absorbProfile(profile)
}

let started = false
// Call once: from then on every save, delete and profile change made while signed in is sent to the server.
export function startCloudSync(): void {
  if (started) return
  started = true
  onProfileChange(() => {
    if (currentUser.value) syncProfile().then(() => { syncError.value = '' }, fail)
  })
  onSlotEvent(e => {
    if (!currentUser.value) return
    const call = e.type === 'write'
      ? api('PUT', path(e.chapter, e.slot), { data: e.raw, at: e.at })
      : api('DELETE', path(e.chapter, e.slot))
    call.then(() => { syncError.value = '' }, fail)
  })
}

// Merges this account's local saves with the server's: the newer copy of each slot wins, in both directions.
export async function syncNow(): Promise<boolean> {
  const user = currentUser.value
  if (!user) return false
  try {
    const { saves } = await api<{ saves: Remote[] }>('GET', '/saves')
    if (currentUser.value !== user) return false // signed out or switched while waiting
    const remote = new Map(saves.map(s => [`${s.chapter}:${s.slot}`, s]))
    const uploads: Promise<unknown>[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const id = k === null ? null : parseSlotKey(k)
      if (!k || !id || id.user !== user) continue
      const raw = localStorage.getItem(k)
      const theirs = remote.get(`${id.chapter}:${id.slot}`)
      remote.delete(`${id.chapter}:${id.slot}`)
      if (raw !== null && (!theirs || theirs.at < savedAt(raw))) {
        uploads.push(api('PUT', path(id.chapter, id.slot), { data: raw, at: savedAt(raw) }))
      } else if (raw !== null && theirs && theirs.at > savedAt(raw)) {
        localStorage.setItem(k, theirs.data)
      }
    }
    // what is left on the server has no local copy yet
    for (const s of remote.values()) {
      localStorage.setItem(slotKey(s.slot === 'auto' ? 'auto' : Number(s.slot), s.chapter), s.data)
    }
    await Promise.all(uploads)
    await syncProfile()
    syncError.value = ''
    return true
  } catch (e) {
    fail(e)
    return false
  }
}
