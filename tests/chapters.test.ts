import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { loadData, mergeScenes } from '../src/engine/data'
import { createInitialState } from '../src/engine/state'
import { slotsLeft } from '../src/engine/calendar'
import { migrateLegacySaves, readSlot, slotKey, writeSlot } from '../src/engine/saves'
import { serializeState } from '../src/engine/save'
import { isUnlocked, loadProfile, markCleared, markRecapSeen } from '../src/engine/profile'
import { useGameStore } from '../src/engine/store'

const data = loadData()

describe('chapter definitions', () => {
  it('loads case 1 as c1, with the whole definition it used to carry in code', () => {
    const c1 = data.chapters.c1
    expect(c1.id).toBe('c1')
    expect(c1.title).toBe('案一·熄灯')
    expect(c1.order).toBe(1)
    expect(c1.calendar).toHaveLength(5)
    expect(c1.calendar.map(d => d.date)).toEqual(['9 月 15 日', '9 月 16 日', '9 月 17 日', '9 月 18 日', '9 月 19 日'])
    expect(c1.lastDay).toBe(5)
    expect(c1.prologue).toBe('prologue')
    expect(c1.trial).toEqual({ scene: 'finale_intro', firstExam: 'finale_act1' })
    expect(Object.keys(c1.endings).sort()).toEqual(['a', 'b', 'bad2', 'bad3', 'c', 'hidden', 'hp', 'true'])
    expect(c1.endings.hp.clears).toBe(false)
    expect(c1.endings.bad2.clears).toBe(false)
    expect(c1.endings.bad3.clears).toBe(false)
    for (const id of ['true', 'a', 'b', 'c', 'hidden']) expect(c1.endings[id].clears, id).toBe(true)
    expect(c1.recap).toEqual([])      // case 1 opens cold
  })

  it('keeps case 1 what is on the scenes and exams it points at', () => {
    const c1 = data.chapters.c1
    expect(data.scenes[c1.prologue]).toBeDefined()
    expect(data.scenes[c1.trial.scene]).toBeDefined()
    expect(data.exams[c1.trial.firstExam]).toBeDefined()
  })

  it('case 2 is a placeholder: its definition loads, its scenes do not exist yet', () => {
    const c2 = data.chapters.c2
    expect(c2.order).toBe(2)
    expect(c2.calendar).toHaveLength(3)
    expect(c2.lastDay).toBe(3)
    expect(c2.recap).toHaveLength(6)
    expect(data.scenes[c2.prologue]).toBeUndefined()
  })

  it('case 1 keeps the hours a day had before chapters', () => {
    const s = createInitialState(data.chapters.c1)
    s.day = 1
    s.hour = 13
    expect(slotsLeft(s, data.chapters.c1)).toBe(8)
    s.day = 5
    s.hour = 8
    expect(slotsLeft(s, data.chapters.c1)).toBe(4)
    s.day = 3
    s.hour = 8
    expect(slotsLeft(s, data.chapters.c1)).toBe(12)
    // and the default is case 1
    s.day = 5
    s.hour = 8
    expect(slotsLeft(s)).toBe(4)
  })

  it('a new state starts from its chapter and names it', () => {
    const s = createInitialState()
    expect(s.version).toBe(2)
    expect(s.chapter).toBe('c1')
    expect(s.hour).toBe(9)
    expect(s.money).toBe(150)
    expect(s.hp).toBe(3)
    expect(s.trust).toBe(20)
    expect(s.intel.phone).toBe('unknown')
  })

  it('refuses two scene files that disagree about the same id', () => {
    expect(() => mergeScenes({
      a: { s: [] },
      b: { s: [{ type: 'say', speaker: 'lyc', text: '另一份' }] },
    })).toThrow(/duplicate scene id "s"/)
  })

  it('keeps one copy of a scene two files agree on', () => {
    expect(mergeScenes({ a: { s: [] }, b: { s: [] } })).toEqual({ s: [] })
  })
})

describe('saves are per chapter', () => {
  beforeEach(() => localStorage.clear())

  it('names the keys by chapter', () => {
    expect(slotKey(1, 'c1')).toBe('jiudian-save:c1:1')
    expect(slotKey(3, 'c2')).toBe('jiudian-save:c2:3')
    expect(slotKey('auto', 'c2')).toBe('jiudian-auto:c2')
  })

  it('writes version 2 with the chapter in state and meta', () => {
    const s = createInitialState()
    expect(writeSlot(2, s, undefined, 0)).toBe(true)
    const raw = JSON.parse(localStorage.getItem('jiudian-save:c1:2')!) as { version: number; state: { chapter: string }; meta: { chapter: string } }
    expect(raw.version).toBe(2)
    expect(raw.state.chapter).toBe('c1')
    expect(raw.meta.chapter).toBe('c1')
    expect(readSlot(2, 'c1').ok).toBe(true)
  })

  it('refuses a slot that holds another chapters run', () => {
    const s = createInitialState()
    writeSlot(2, s, undefined, 0)
    localStorage.setItem(slotKey(2, 'c2'), localStorage.getItem(slotKey(2, 'c1'))!)
    expect(readSlot(2, 'c2')).toEqual({ ok: false, reason: 'chapter' })
  })

  it('moves a version-1 save into case 1, leaving the old key alone', () => {
    const legacy = JSON.parse(serializeState(createInitialState())) as { version: number; state: Record<string, unknown> }
    legacy.version = 1
    legacy.state.version = 1
    delete legacy.state.chapter
    localStorage.setItem('jiudian-save', JSON.stringify(legacy))

    expect(readSlot(1, 'c1').ok).toBe(false)   // nothing there yet
    migrateLegacySaves()

    const r = readSlot(1, 'c1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.chapter).toBe('c1')
    expect(localStorage.getItem('jiudian-save')).not.toBeNull()
    expect(localStorage.getItem('jiudian-migrated-v2')).not.toBeNull()
  })

  it('only migrates once', () => {
    localStorage.setItem('jiudian-auto', JSON.stringify({ version: 1, state: createInitialState() }))
    migrateLegacySaves()
    localStorage.removeItem(slotKey('auto', 'c1'))
    migrateLegacySaves()
    expect(localStorage.getItem(slotKey('auto', 'c1'))).toBeNull()
  })
})

describe('the rewind tree is per chapter', () => {
  it('moves the old single tree to case 1', () => {
    localStorage.clear()
    const tree = JSON.stringify({ version: 1, uid: 'u1', nodes: [], head: null })
    localStorage.setItem('jiudian-timeline', tree)
    setActivePinia(createPinia())
    useGameStore()
    expect(localStorage.getItem('jiudian-timeline:c1')).toBe(tree)
    expect(localStorage.getItem('jiudian-timeline')).toBeNull()
  })
})

describe('the profile', () => {
  beforeEach(() => localStorage.clear())
  const c1 = data.chapters.c1
  const c2 = data.chapters.c2

  it('always has case 1 open', () => {
    expect(isUnlocked(c1, data.chapters)).toBe(true)
  })

  it('a BAD ending does not open case 2', () => {
    markCleared('c1', 'bad2')
    expect(isUnlocked(c2, data.chapters)).toBe(false)
  })

  it('no record at all does not open case 2', () => {
    expect(isUnlocked(c2, data.chapters)).toBe(false)
  })

  it.each(['true', 'a', 'b', 'c', 'hidden'])('a %s ending opens case 2', ending => {
    localStorage.clear()
    markCleared('c1', ending)
    expect(isUnlocked(c2, data.chapters)).toBe(true)
  })

  it('remembers which recaps were seen', () => {
    markRecapSeen('c2')
    expect(loadProfile().seenRecap.c2).toBe(true)
  })
})
