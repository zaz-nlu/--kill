import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { attackChance, dangerTier, isFatal, recordLimoAway, rollAttack, wasLimoAway } from '../src/engine/danger'
import { affinityTier, trustLabel } from '../src/engine/affinity'
import { diffState, snapshot } from '../src/engine/changes'
import { applyEffect } from '../src/engine/effects'
import { evalCondition } from '../src/engine/script'

describe('danger tiers', () => {
  it('calm below 30, uneasy 30–59, tense 60–89, critical from 90', () => {
    expect(dangerTier(0)).toBe('calm')
    expect(dangerTier(29)).toBe('calm')
    expect(dangerTier(30)).toBe('uneasy')
    expect(dangerTier(59)).toBe('uneasy')
    expect(dangerTier(60)).toBe('tense')
    expect(dangerTier(89)).toBe('tense')
    expect(dangerTier(90)).toBe('critical')
    expect(dangerTier(100)).toBe('critical')
  })

  it('only the critical tier is fatal', () => {
    const s = createInitialState()
    s.danger = 89
    expect(isFatal(s)).toBe(false)
    s.danger = 90
    expect(isFatal(s)).toBe(true)
  })
})

describe('attack chance (spec 6.4)', () => {
  it('matches the table for risky and ordinary places', () => {
    expect(attackChance(10, 'high')).toBe(0)
    expect(attackChance(10, 'normal')).toBe(0)
    expect(attackChance(30, 'high')).toBe(0.15)
    expect(attackChance(30, 'normal')).toBe(0)
    expect(attackChance(59, 'high')).toBe(0.15)
    expect(attackChance(60, 'high')).toBe(0.3)
    expect(attackChance(60, 'normal')).toBe(0.1)
    expect(attackChance(89, 'normal')).toBe(0.1)
    expect(attackChance(90, 'high')).toBe(0.5)
    expect(attackChance(100, 'normal')).toBe(0.2)
  })

  it('never happens at safe places, whatever the danger', () => {
    for (const d of [0, 45, 75, 100]) expect(attackChance(d, 'safe')).toBe(0)
  })

  it('rolls against the chance with the injected random source', () => {
    const s = createInitialState()
    s.danger = 60
    expect(rollAttack(s, 'high', () => 0.29)).toBe(true)
    expect(rollAttack(s, 'high', () => 0.3)).toBe(false)
    expect(rollAttack(s, 'safe', () => 0)).toBe(false)
    s.danger = 10
    expect(rollAttack(s, 'high', () => 0)).toBe(false)
  })
})

describe("Limo is away while he attacks (spec 6.4 consistency rule)", () => {
  it('records the hour of the attack and nothing else', () => {
    const s = createInitialState()
    s.day = 2
    recordLimoAway(s, 15)
    expect(wasLimoAway(s, 2, 15)).toBe(true)
    expect(wasLimoAway(s, 2, 16)).toBe(false)
    expect(wasLimoAway(s, 1, 15)).toBe(false)
  })
})

describe('affinity tiers (spec 6.2)', () => {
  it('open from 60, guarded 30–59, closed below 30', () => {
    expect(affinityTier(100)).toBe('open')
    expect(affinityTier(60)).toBe('open')
    expect(affinityTier(59)).toBe('guarded')
    expect(affinityTier(30)).toBe('guarded')
    expect(affinityTier(29)).toBe('closed')
    expect(affinityTier(0)).toBe('closed')
  })

  it('a scene can branch on the tier', () => {
    const s = createInitialState()
    s.affinity.lucheng = 60
    expect(evalCondition(s, { kind: 'affinityTier', npc: 'lucheng', tier: 'open' })).toBe(true)
    expect(evalCondition(s, { kind: 'affinityTier', npc: 'lucheng', tier: 'guarded' })).toBe(false)
    s.affinity.lucheng = 45
    expect(evalCondition(s, { kind: 'affinityTier', npc: 'lucheng', tier: 'guarded' })).toBe(true)
    s.affinity.lucheng = 10
    expect(evalCondition(s, { kind: 'affinityTier', npc: 'lucheng', tier: 'closed' })).toBe(true)
  })

  it('a scene can branch on danger', () => {
    const s = createInitialState()
    s.danger = 89
    expect(evalCondition(s, { kind: 'dangerAtLeast', value: 90 })).toBe(false)
    s.danger = 90
    expect(evalCondition(s, { kind: 'dangerAtLeast', value: 90 })).toBe(true)
  })

  it("Laohan's trust has a plain-language label that follows the 40 / 50 / 60 thresholds", () => {
    expect(trustLabel(0)).toBe('戒备')
    expect(trustLabel(39)).toBe('戒备')
    expect(trustLabel(40)).toBe('愿意听')
    expect(trustLabel(50)).toBe('可以合作')
    expect(trustLabel(60)).toBe('信任')
  })

  it('affinity stays between 0 and 100', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'affinity', npc: 'limo', delta: 999 })
    expect(s.affinity.limo).toBe(100)
    applyEffect(s, { kind: 'affinity', npc: 'limo', delta: -999 })
    expect(s.affinity.limo).toBe(0)
  })
})

describe('what changed (for the on-screen feedback)', () => {
  it('lists affinity, trust, hp, danger and money changes and ignores the rest', () => {
    const s = createInitialState()
    const before = snapshot(s)
    s.affinity.mengyao += 5
    s.affinity.boss -= 20
    s.trust += 10
    s.hp -= 1
    s.danger += 10
    s.money -= 22
    s.evidence.push('E01')
    expect(diffState(before, snapshot(s))).toEqual([
      { kind: 'affinity', npc: 'boss', delta: -20 },
      { kind: 'affinity', npc: 'mengyao', delta: 5 },
      { kind: 'trust', delta: 10 },
      { kind: 'hp', delta: -1 },
      { kind: 'danger', delta: 10 },
      { kind: 'money', delta: -22 },
    ])
  })

  it('is empty when nothing changed', () => {
    const s = createInitialState()
    expect(diffState(snapshot(s), snapshot(s))).toEqual([])
  })
})
