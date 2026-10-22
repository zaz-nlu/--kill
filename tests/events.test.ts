import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { applyEffect } from '../src/engine/effects'
import { evalCondition } from '../src/engine/script'
import { availableActions, markActionDone, type ActionDef } from '../src/engine/calendar'
import { markEventDone, nextEvent, type EventDef } from '../src/engine/events'
import { useGameStore } from '../src/engine/store'
import { skipEvents } from './helpers'

describe('new conditions and effects', () => {
  it('flag and trustAtLeast conditions', () => {
    const s = createInitialState()
    expect(evalCondition(s, { kind: 'flag', key: 'x' })).toBe(false)
    s.flags.x = true
    expect(evalCondition(s, { kind: 'flag', key: 'x' })).toBe(true)
    expect(evalCondition(s, { kind: 'trustAtLeast', value: 20 })).toBe(true)
    expect(evalCondition(s, { kind: 'trustAtLeast', value: 21 })).toBe(false)
  })

  it('time effect jumps forward and never back', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'time', hour: 13 })
    expect(s.hour).toBe(13)
    applyEffect(s, { kind: 'time', hour: 10 })
    expect(s.hour).toBe(13)
  })
})

describe('action availability', () => {
  const base: ActionDef = { id: 'a', label: 'A', location: 'x', days: [1], scene: 's', costHours: 1 }

  it('an action can be done once', () => {
    const s = createInitialState()
    s.hour = 13
    expect(availableActions(s, [base]).map(a => a.id)).toEqual(['a'])
    markActionDone(s, 'a')
    expect(availableActions(s, [base])).toEqual([])
  })

  it('honours a generic requires condition', () => {
    const s = createInitialState()
    s.hour = 13
    const gated: ActionDef = { ...base, requires: { kind: 'affinityAtLeast', npc: 'lucheng', value: 60 } }
    expect(availableActions(s, [gated])).toEqual([])
    s.affinity.lucheng = 60
    expect(availableActions(s, [gated])).toHaveLength(1)
  })

  it('offers nothing at the fixed-event hours 12 and 18', () => {
    const s = createInitialState()
    for (const h of [12, 18]) {
      s.hour = h
      expect(availableActions(s, [base]), `hour ${h}`).toEqual([])
    }
    s.hour = 13
    expect(availableActions(s, [base])).toHaveLength(1)
  })

  it('meal actions are the only things on offer at 12 and 18, and are never offered at other hours', () => {
    const lunch: ActionDef = { ...base, id: 'lunch', meal: true, minHour: 12, maxHour: 12 }
    const dinner: ActionDef = { ...base, id: 'dinner', meal: true, minHour: 18, maxHour: 18 }
    const s = createInitialState()
    s.hour = 12
    expect(availableActions(s, [base, lunch, dinner]).map(a => a.id)).toEqual(['lunch'])
    s.hour = 18
    expect(availableActions(s, [base, lunch, dinner]).map(a => a.id)).toEqual(['dinner'])
    s.hour = 15
    expect(availableActions(s, [base, lunch, dinner]).map(a => a.id)).toEqual(['a'])
  })

  it('a meal action is used up once done, like any other', () => {
    const lunch: ActionDef = { ...base, id: 'lunch', meal: true, minHour: 12, maxHour: 12 }
    const s = createInitialState()
    s.hour = 12
    markActionDone(s, 'lunch')
    expect(availableActions(s, [lunch])).toEqual([])
  })
})

describe('fixed events', () => {
  const evs: EventDef[] = [
    { id: 'e1', day: 1, hour: 9, scene: 's1' },
    { id: 'e2', day: 1, hour: 14, scene: 's2' },
    { id: 'e3', day: 2, hour: 9, scene: 's3', requires: { kind: 'flag', key: 'go' } },
  ]

  it('fires in order once the clock reaches it, once only', () => {
    const s = createInitialState()
    expect(nextEvent(s, evs)?.id).toBe('e1')
    markEventDone(s, 'e1')
    expect(nextEvent(s, evs)).toBeNull()          // e2 is at 14
    s.hour = 14
    expect(nextEvent(s, evs)?.id).toBe('e2')
    markEventDone(s, 'e2')
    expect(nextEvent(s, evs)).toBeNull()
  })

  it('belongs to its own day and respects requires', () => {
    const s = createInitialState()
    s.day = 2
    expect(nextEvent(s, evs)).toBeNull()          // e3 needs the flag
    s.flags.go = true
    expect(nextEvent(s, evs)?.id).toBe('e3')
  })
})

describe('store: the day flows through events', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function skipScene(store: ReturnType<typeof useGameStore>) {
    let guard = 0
    while (store.screen === 'scene') {
      if (guard++ > 400) throw new Error('scene never ended')
      const n = store.currentNode
      store.advance(n?.type === 'choice' ? 0 : undefined)
    }
  }

  it('after the prologue, day 1 plays its morning and lands on the hub at 13:00', () => {
    const store = useGameStore()
    store.newGame()
    skipScene(store)
    expect(store.screen).toBe('hub')
    expect(store.state.day).toBe(1)
    expect(store.state.hour).toBe(13)
  })

  it('the 14:30 message arrives when the clock passes 14, once', () => {
    const store = useGameStore()
    store.newGame()
    skipScene(store)
    store.startAction('1-1')                       // 13 -> 14
    skipScene(store)                               // the action itself
    skipScene(store)                               // the 14:30 event
    expect(store.state.flags['event:day1_wechat']).toBe(true)
    expect(store.screen).toBe('hub')
    expect(store.state.backlog.some(l => l.tag === 'G1')).toBe(true)
  })

  it('waiting at an event hour moves on one hour', () => {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 12
    skipEvents(store, 2)
    store.screen = 'hub'
    store.waitAnHour()
    expect(store.state.hour).toBe(13)
    expect(store.screen).toBe('hub')
  })

  it('an action disappears from the hub once done', () => {
    const store = useGameStore()
    store.newGame()
    skipScene(store)
    expect(store.actions.map(a => a.id)).toContain('1-1')
    store.startAction('1-1')
    skipScene(store)
    skipScene(store)
    expect(store.actions.map(a => a.id)).not.toContain('1-1')
  })
})

describe('the "any" condition', () => {
  it('is true when at least one of its parts is, and false for an empty list', () => {
    const s = createInitialState()
    const c = { kind: 'any' as const, conds: [{ kind: 'hasTestimony' as const, id: 'T10' }, { kind: 'affinityAtLeast' as const, npc: 'suwen' as const, value: 70 }] }
    expect(evalCondition(s, c)).toBe(false)
    s.affinity.suwen = 70
    expect(evalCondition(s, c)).toBe(true)
    s.affinity.suwen = 60
    s.testimony.push('T10')
    expect(evalCondition(s, c)).toBe(true)
    expect(evalCondition(s, { kind: 'any', conds: [] })).toBe(false)
  })

  it('can gate an action: either way in', () => {
    const gated: ActionDef = {
      id: 'g', label: 'g', location: 'x', days: [1], scene: 's', costHours: 1,
      requires: { kind: 'any', conds: [{ kind: 'hasTestimony', id: 'T10' }, { kind: 'affinityAtLeast', npc: 'suwen', value: 70 }] },
    }
    const s = createInitialState()
    s.hour = 13
    expect(availableActions(s, [gated])).toEqual([])
    s.affinity.suwen = 75
    expect(availableActions(s, [gated])).toHaveLength(1)
  })
})
