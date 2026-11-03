import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import { nextEvent } from '../src/engine/events'
import type { GameState } from '../src/engine/types'

const data = loadData()
const c2 = data.chapters.c2

function play(state: GameState, sceneId: string): void {
  const runner = new SceneRunner(state, data.scenes)
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error(`${sceneId} did not terminate`)
    runner.advance()
  }
}

describe('case 2, first day preview', () => {
  it('plays the opening scene and lands at 09:00 with scene photos in hand', () => {
    const s = createInitialState(c2)
    play(s, c2.prologue)
    expect(s.chapter).toBe('c2')
    expect(s.hour).toBe(9)
    expect(s.evidence).toContain('2E34')
    expect(s.evidence).toContain('2E36')
  })

  it('offers only case 2 actions on day 1, and none of case 1', () => {
    const s = createInitialState(c2)
    play(s, c2.prologue)
    const ids = availableActions(s, data.actions).map(a => a.id)
    expect(ids).toContain('c2-1-1')
    expect(ids.every(id => id.startsWith('c2-'))).toBe(true)
  })

  it('every action scene and every room scene plays to the end and grants known records', () => {
    const known = new Set([...data.evidence.map(e => e.id), ...data.testimony.map(t => t.id)])
    for (const a of data.actions.filter(x => x.chapter === 'c2')) {
      if (a.scene) expect(() => play(createInitialState(c2), a.scene!), a.id).not.toThrow()
    }
    const room = data.rooms.find(r => r.id === 'c2_server_room')!
    for (const sceneId of [room.intro!, room.cutoff!, ...room.hotspots.map(h => h.scene)]) {
      const s = createInitialState(c2)
      expect(() => play(s, sceneId), sceneId).not.toThrow()
      for (const id of [...s.evidence, ...s.testimony]) expect(known.has(id), id).toBe(true)
    }
  })

  it('ends the preview at the end of day 1 and at the start of day 2', () => {
    const s = createInitialState(c2)
    s.hour = 21
    expect(nextEvent(s, data.events)?.id).toBe('c2_day1_night')
    play(s, 'c2_preview_end')
    expect(s.flags['ending:preview']).toBe(true)
    expect(c2.endings.preview).toBeDefined()
    const s2 = createInitialState(c2)
    s2.day = 2
    expect(nextEvent(s2, data.events)?.id).toBe('c2_day2_start')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { playOut } from './helpers'

describe('case 2 through the real store', () => {
  it('starts, plays the opening, reaches the hub with a case 2 menu, and ends the preview on day 2', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.startChapter('c2')
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.chapter).toBe('c2')
    expect(store.actions.length).toBeGreaterThan(0)
    expect(store.actions.every(a => a.id.startsWith("c2-"))).toBe(true)
    store.state.day = 2
    store.state.hour = 8
    store.waitAnHour()
    playOut(store)
    expect(store.screen).toBe('end')
  })
})
