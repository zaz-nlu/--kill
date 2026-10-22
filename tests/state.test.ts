import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { applyEffect } from '../src/engine/effects'
import { advanceHour, endDay, availableActions, type ActionDef } from '../src/engine/calendar'

describe('createInitialState', () => {
  it('starts with the spec values', () => {
    const s = createInitialState()
    expect(s.money).toBe(150)
    expect(s.hp).toBe(3)
    expect(s.trust).toBe(20)
    expect(s.day).toBe(1)
    expect(s.hour).toBe(9)
    expect(s.affinity.limo).toBe(70)
    expect(s.affinity.boss).toBe(25)
    expect(s.affinity.mengyao).toBe(50)
    expect(s.intel.phone).toBe('unknown')
  })
})

describe('applyEffect', () => {
  it('clamps affinity to 0..100', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'affinity', npc: 'limo', delta: 50 })
    expect(s.affinity.limo).toBe(100)
    applyEffect(s, { kind: 'affinity', npc: 'limo', delta: -500 })
    expect(s.affinity.limo).toBe(0)
  })
  it('never lets money go below zero', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'money', delta: -999 })
    expect(s.money).toBe(0)
  })
  it('clamps danger to 0..100 and hp to 0..3', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'danger', delta: 500 })
    expect(s.danger).toBe(100)
    applyEffect(s, { kind: 'hp', delta: 5 })
    expect(s.hp).toBe(3)
    applyEffect(s, { kind: 'hp', delta: -9 })
    expect(s.hp).toBe(0)
  })
  it('adds evidence and testimony only once', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'evidence', id: 'E06' })
    applyEffect(s, { kind: 'evidence', id: 'E06' })
    applyEffect(s, { kind: 'testimony', id: 'T01' })
    applyEffect(s, { kind: 'testimony', id: 'T01' })
    expect(s.evidence).toEqual(['E06'])
    expect(s.testimony).toEqual(['T01'])
  })
  it('sets flags', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'flag', key: 'x', value: true })
    expect(s.flags.x).toBe(true)
  })
})

describe('calendar', () => {
  it('advanceHour adds one hour by default', () => {
    const s = createInitialState()
    advanceHour(s)
    expect(s.hour).toBe(10)
    advanceHour(s, 2)
    expect(s.hour).toBe(12)
  })
  it('endDay without rest lowers danger by 15', () => {
    const s = createInitialState()
    s.danger = 40
    s.giftedToday = ['limo']
    endDay(s, { rested: false })
    expect(s.danger).toBe(25)
    expect(s.day).toBe(2)
    expect(s.hour).toBe(8)   // the day opens an hour before the 09:00 events
    expect(s.giftedToday).toEqual([])
  })
  it('endDay with rest lowers danger by 25 and restores 1 hp', () => {
    const s = createInitialState()
    s.danger = 40
    s.hp = 2
    endDay(s, { rested: true })
    expect(s.danger).toBe(15)
    expect(s.hp).toBe(3)
  })
  it('endDay never drops danger below zero', () => {
    const s = createInitialState()
    s.danger = 5
    endDay(s, { rested: true })
    expect(s.danger).toBe(0)
  })
})

describe('availableActions', () => {
  const all: ActionDef[] = [
    { id: 'a', label: 'A', location: 'x', days: [2], scene: 's', costHours: 1, maxHour: 17 },
    { id: 'b', label: 'B', location: 'x', days: [3], scene: 's', costHours: 1 },
    { id: 'c', label: 'C', location: 'x', days: [2], scene: 's', costHours: 1, requiresEvidence: ['E13'] },
    { id: 'd', label: 'D', location: 'x', days: [2], scene: 's', costHours: 1, minHour: 19 },
  ]
  it('filters by day, evidence and hour window', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 9
    expect(availableActions(s, all).map(a => a.id)).toEqual(['a'])
    s.evidence.push('E13')
    expect(availableActions(s, all).map(a => a.id)).toEqual(['a', 'c'])
    s.hour = 19
    expect(availableActions(s, all).map(a => a.id)).toEqual(['c', 'd'])
  })
})
