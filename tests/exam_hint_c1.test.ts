import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'

// Case 1, act 1: statement s2 (index 1) is broken by E06 on weak point m1; s4 (index 3) is a line never missed.
function startAct1() {
  const store = useGameStore()
  store.state.evidence.push('E01', 'E06', 'E14')
  store.startExamById('finale_act1')
  store.examGoto(1)
  return store
}

describe('case 1 hint ids', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('after a wrong presentation on a line, points at the piece that would land', () => {
    const store = startAct1()
    store.examPresent('E01', 'm1')
    const ids = store.examHintIds()
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain('E06')
  })

  it('stays empty on a line that has never been missed', () => {
    const store = startAct1()
    store.examPresent('E01', 'm1')
    store.examGoto(3)
    expect(store.examHintIds()).toEqual([])
  })

  it('never hints from case 2 on', () => {
    const store = startAct1()
    store.examPresent('E01', 'm1')
    store.state.chapter = 'c2'
    expect(store.examHintIds()).toEqual([])
  })
})
