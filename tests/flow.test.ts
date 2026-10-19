import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { applyEffect } from '../src/engine/effects'
import { learnIntel, leakIntel, isSlipAvailable, triggerLeak, SLIP_FOR_INTEL } from '../src/engine/flow'

function knowing(...intel: Parameters<typeof learnIntel>[1][]) {
  const s = createInitialState()
  intel.forEach(i => learnIntel(s, i))
  return s
}

describe('intel flow', () => {
  it('maps every intel to its slip tag', () => {
    expect(SLIP_FOR_INTEL).toEqual({ phone: 'T26', draft: 'T27', trophy: 'T28', card: 'T29', attack: 'T22' })
  })

  it('learnIntel turns unknown into clean', () => {
    const s = createInitialState()
    learnIntel(s, 'phone')
    expect(s.intel.phone).toBe('clean')
    expect(isSlipAvailable(s, 'phone')).toBe(true)
  })

  it('applyEffect learnIntel goes through the same path', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'learnIntel', intel: 'draft' })
    expect(s.intel.draft).toBe('clean')
  })

  it('lunchTellAll leaks phone, draft and trophy', () => {
    const s = knowing('phone', 'draft', 'trophy', 'card')
    const leaked = triggerLeak(s, 'lunchTellAll')
    expect(leaked.sort()).toEqual(['draft', 'phone', 'trophy'])
    expect(isSlipAvailable(s, 'phone')).toBe(false)
    expect(s.intel.card).toBe('clean')
  })

  it('groupPost and coffeeTellAll leak phone and draft only', () => {
    for (const t of ['groupPost', 'coffeeTellAll'] as const) {
      const s = knowing('phone', 'draft', 'trophy')
      expect(triggerLeak(s, t).sort()).toEqual(['draft', 'phone'])
      expect(s.intel.trophy).toBe('clean')
    }
  })

  it('tellAllToLimo leaks every intel the player already knows', () => {
    const s = knowing('phone', 'card')
    expect(triggerLeak(s, 'tellAllToLimo').sort()).toEqual(['card', 'phone'])
    expect(s.intel.draft).toBe('unknown')
  })

  it('telling the outsourcers leaks, telling others does not', () => {
    let s = knowing('phone')
    expect(triggerLeak(s, { toNpc: 'zhengcen', intel: ['phone'] })).toEqual([])
    expect(s.intel.phone).toBe('clean')
    s = knowing('phone')
    expect(triggerLeak(s, { toNpc: 'shaoxy', intel: ['phone'] })).toEqual(['phone'])
    s = knowing('phone')
    expect(triggerLeak(s, { toNpc: 'lucheng', intel: ['phone'] })).toEqual(['phone'])
  })

  it('attack details leak to everyone except laohan', () => {
    let s = knowing('attack')
    expect(triggerLeak(s, { toNpc: 'suwen', intel: ['attack'] })).toEqual(['attack'])
    s = knowing('attack')
    expect(triggerLeak(s, { toNpc: 'laohan', intel: ['attack'] })).toEqual([])
    expect(s.intel.attack).toBe('clean')
  })

  it('never flips leaked back to clean, and never leaks unknown intel', () => {
    const s = createInitialState()
    expect(leakIntel(s, ['phone'])).toEqual([])        // unknown stays unknown
    expect(s.intel.phone).toBe('unknown')
    learnIntel(s, 'phone')
    leakIntel(s, ['phone'])
    learnIntel(s, 'phone')                              // learning again must not reset
    expect(s.intel.phone).toBe('leaked')
  })

  it('a trigger fired twice reports nothing the second time', () => {
    const s = knowing('phone', 'draft', 'trophy')
    expect(triggerLeak(s, 'lunchTellAll').length).toBe(3)
    expect(triggerLeak(s, 'lunchTellAll')).toEqual([])
  })
})
