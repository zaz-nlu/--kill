import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { learnIntel } from '../src/engine/flow'
import { SceneRunner, evalCondition, type Scenes } from '../src/engine/script'

const say = (text: string, tag?: string) => ({ type: 'say' as const, speaker: 'limo' as const, text, tag })

describe('SceneRunner', () => {
  it('logs each say on arrival and finishes with null', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, { a: [say('一'), say('二', 'T26')] })
    r.start('a')
    expect(r.current()).toMatchObject({ type: 'say', text: '一' })
    expect(s.backlog.map(l => l.text)).toEqual(['一'])
    r.advance()
    expect(r.current()).toMatchObject({ text: '二' })
    expect(s.backlog[1].tag).toBe('T26')
    r.advance()
    expect(r.current()).toBeNull()
    expect(s.backlog.length).toBe(2)
  })

  it('runs effect nodes without stopping', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, {
      a: [{ type: 'effect', effects: [{ kind: 'evidence', id: 'E01' }] }, say('x')],
    })
    r.start('a')
    expect(s.evidence).toEqual(['E01'])
    expect(r.current()).toMatchObject({ text: 'x' })
  })

  it('applies a choice option: effects, leak, then continues', () => {
    const s = createInitialState()
    learnIntel(s, 'phone')
    learnIntel(s, 'draft')
    learnIntel(s, 'trophy')
    const scenes: Scenes = {
      a: [
        {
          type: 'choice',
          options: [
            { text: 'B' },
            { text: 'A', effects: [{ kind: 'affinity', npc: 'limo', delta: 5 }], leak: 'lunchTellAll' },
          ],
        },
        say('after'),
      ],
    }
    const r = new SceneRunner(s, scenes)
    r.start('a')
    expect(r.current()?.type).toBe('choice')
    r.advance(1)
    expect(s.affinity.limo).toBe(75)
    expect(s.intel.phone).toBe('leaked')
    expect(r.current()).toMatchObject({ text: 'after' })
  })

  it('a choice option with goto jumps to another scene', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, {
      a: [{ type: 'choice', options: [{ text: 'go', goto: 'b' }] }, say('never')],
      b: [say('in b')],
    })
    r.start('a')
    r.advance(0)
    expect(r.current()).toMatchObject({ text: 'in b' })
  })

  it('branch picks the slip version when intel is clean, innocent when leaked', () => {
    const scenes: Scenes = {
      a: [
        {
          type: 'branch',
          when: { kind: 'intelClean', intel: 'phone' },
          then: [say('手机别是已经沉海河了吧', 'T26')],
          else: [say('你说手机不见了？')],
        },
        say('after'),
      ],
    }
    const clean = createInitialState()
    learnIntel(clean, 'phone')
    const r1 = new SceneRunner(clean, scenes)
    r1.start('a')
    expect(clean.backlog[0].tag).toBe('T26')
    r1.advance()
    expect(r1.current()).toMatchObject({ text: 'after' })

    const leaked = createInitialState()
    learnIntel(leaked, 'phone')
    leaked.intel.phone = 'leaked'
    const r2 = new SceneRunner(leaked, scenes)
    r2.start('a')
    expect(leaked.backlog[0].text).toBe('你说手机不见了？')
    expect(leaked.backlog[0].tag).toBeUndefined()
  })

  it('goto node jumps scenes', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, { a: [{ type: 'goto', scene: 'b' }], b: [say('b!')] })
    r.start('a')
    expect(r.current()).toMatchObject({ text: 'b!' })
  })

  it('ignores advance() on a pending choice without a valid index', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, { a: [{ type: 'choice', options: [{ text: 'x' }, { text: 'y' }] }, say('z')] })
    r.start('a')
    r.advance()
    expect(r.current()?.type).toBe('choice')
    r.advance(99)
    expect(r.current()?.type).toBe('choice')
    r.advance(-1)
    expect(r.current()?.type).toBe('choice')
  })

  it('end node finishes the scene', () => {
    const s = createInitialState()
    const r = new SceneRunner(s, { a: [say('x'), { type: 'end' }, say('never')] })
    r.start('a')
    r.advance()
    expect(r.current()).toBeNull()
  })

  it('throws on an unknown scene id', () => {
    const r = new SceneRunner(createInitialState(), {})
    expect(() => r.start('nope')).toThrow(/nope/)
  })
})

describe('evalCondition', () => {
  it('evaluates every condition kind', () => {
    const s = createInitialState()
    learnIntel(s, 'phone')
    s.evidence.push('E06')
    s.testimony.push('T02')
    expect(evalCondition(s, { kind: 'intelClean', intel: 'phone' })).toBe(true)
    expect(evalCondition(s, { kind: 'intelClean', intel: 'draft' })).toBe(false)
    expect(evalCondition(s, { kind: 'affinityAtLeast', npc: 'limo', value: 60 })).toBe(true)
    expect(evalCondition(s, { kind: 'affinityAtLeast', npc: 'boss', value: 60 })).toBe(false)
    expect(evalCondition(s, { kind: 'hasEvidence', id: 'E06' })).toBe(true)
    expect(evalCondition(s, { kind: 'hasTestimony', id: 'T99' })).toBe(false)
    expect(evalCondition(s, { kind: 'not', cond: { kind: 'hasEvidence', id: 'E06' } })).toBe(false)
  })
})
