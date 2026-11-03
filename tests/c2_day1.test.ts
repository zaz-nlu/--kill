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

describe('case 2 content', () => {
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
    const c2Rooms = data.rooms.filter(r => r.id.startsWith('c2_'))
    expect(c2Rooms.length).toBeGreaterThanOrEqual(2)
    for (const sceneId of c2Rooms.flatMap(room => [room.intro!, room.cutoff!, ...room.hotspots.map(h => h.scene)])) {
      const s = createInitialState(c2)
      expect(() => play(s, sceneId), sceneId).not.toThrow()
      for (const id of [...s.evidence, ...s.testimony]) expect(known.has(id), id).toBe(true)
    }
  })

  it('closes day 1 with the garbage-day line and opens day 2 and day 3 with their own scenes', () => {
    const s = createInitialState(c2)
    s.hour = 21
    expect(nextEvent(s, data.events)?.id).toBe('c2_day1_night')
    play(s, 'c2_day1_night')
    expect(s.flags['ending:true']).toBeUndefined()
    const s2 = createInitialState(c2)
    s2.day = 2
    expect(nextEvent(s2, data.events)?.id).toBe('c2_day2_start')
    const s4 = createInitialState(c2)
    s4.day = 3
    expect(nextEvent(s4, data.events)?.id).toBe('c2_day3_start')
  })

  it('the final scene of the confrontation raises the true ending', () => {
    const s = createInitialState(c2)
    play(s, 'c2_act4_end')
    expect(s.flags['ending:true']).toBe(true)
    expect(c2.endings.true).toBeDefined()
  })

  it('every record the four acts ask for can be picked up somewhere in case 2, and the trial gate is reachable', () => {
    const granted = new Set<string>()
    const walk = (nodes: unknown[]): void => {
      for (const n of nodes as { type?: string; effects?: { kind: string; id?: string }[] }[]) {
        if (n.type === 'effect') for (const e of n.effects ?? []) if ((e.kind === 'evidence' || e.kind === 'testimony') && e.id) granted.add(e.id)
      }
    }
    for (const [id, nodes] of Object.entries(data.scenes)) if (id.startsWith('c2_')) walk(nodes)
    const wanted = new Set<string>()
    for (const id of ['c2_act1', 'c2_act2', 'c2_act3', 'c2_act4']) {
      for (const st of data.exams[id].statements) for (const step of st.steps) if (step.kind === 'present') step.accepts.forEach(a => wanted.add(a))
    }
    for (const w of wanted) expect(granted.has(w), w).toBe(true)
    const gate = data.actions.find(a => a.id === 'c2-3-4')!
    for (const w of gate.requiresEvidence ?? []) expect(granted.has(w), w).toBe(true)
    expect(data.exams.c2_act1.onClear).toBe('c2_act1_end')
    expect(data.exams.c2_act4.onClear).toBe('c2_act4_end')
  })

  it('day 2 chain: the platform check needs the torn slip, and the bin hints at Saturday collection', () => {
    const s = createInitialState(c2)
    s.day = 2
    s.hour = 14
    const ids = () => availableActions(s, data.actions).map(a => a.id)
    expect(ids()).not.toContain('c2-2-5')
    play(s, 'c2_inspect_trash')
    expect(s.evidence).toContain('2E08d')
    expect(ids()).toContain('c2-2-5')
    play(s, 'c2_act_platform')
    expect(s.evidence).toContain('2E08e')
    const text = JSON.stringify(data.scenes.c2_inspect_trash) + JSON.stringify(data.scenes.c2_talk_clerk)
    expect(text).toContain('周六')
    expect(text).toContain('05:30')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { playOut } from './helpers'

describe('case 2 through the real store', () => {
  it('starts, plays the opening, reaches the hub with a case 2 menu, and opens day 3', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.startChapter('c2')
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.chapter).toBe('c2')
    expect(store.actions.length).toBeGreaterThan(0)
    expect(store.actions.every(a => a.id.startsWith("c2-"))).toBe(true)
    store.state.day = 3
    store.state.hour = 7
    store.waitAnHour()
    playOut(store)
    expect(store.screen).toBe('hub')
  })
})

import { startExam, availableSteps, present as examPresent, chooseOption, press as examPress, isStatementCleared } from '../src/engine/crossexam'

describe('case 2 confrontation, played through the exam engine', () => {
  const owned = [...data.evidence.filter(e => e.id.startsWith('2E')).map(e => e.id), ...data.testimony.filter(t => t.id.startsWith('2T')).map(t => t.id)]

  for (const id of ['c2_act1', 'c2_act2', 'c2_act3', 'c2_act4']) {
    it(`${id} can be cleared by presenting the right records in order`, () => {
      const exam = startExam(data.exams[id], 8, 0, 0)
      let guard = 0
      while (!exam.cleared && !exam.failed) {
        if (guard++ > 80) throw new Error('exam did not finish')
        let moved = false
        for (const st of data.exams[id].statements) {
          if (isStatementCleared(exam, st.id)) continue
          const steps = availableSteps(exam, st.id)
          const step = steps.find(x => x.kind !== 'press')
          if (!step) {
            if (steps.some(x => x.kind === 'press')) { examPress(exam, st.id); moved = true }
            continue
          }
          if (step.kind === 'present') examPresent(exam, st.id, step.accepts[0], owned)
          else if (step.kind === 'argument') chooseOption(exam, st.id, step.id, step.options.findIndex(o => o.correct))
          moved = true
          break
        }
        if (!moved) break
      }
      expect(exam.failed).toBe(false)
      expect(exam.cleared).toBe(true)
    })
  }
})
