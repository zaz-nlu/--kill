import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import {
  canDeduce, pendingMerge, startDeduction, submitDeduction, type DeductionDef,
} from '../src/engine/deduction'
import { aliasOf, foldedIds, ownedConclusions } from '../src/engine/conclusions'
import { present, startExam } from '../src/engine/crossexam'
import type { ExamDef, Line } from '../src/engine/types'
import { useGameStore } from '../src/engine/store'

const data = loadData()
const defs = Object.values(data.deductions)
const line = (text: string): Line => ({ speaker: 'limo', text })

// A state that holds the pieces of m01 (the first tier-1 merge question).
function withMergePieces() {
  const s = createInitialState()
  s.evidence.push('E03', 'E04')
  s.testimony.push('T02')
  return s
}

describe('the conclusion data', () => {
  it('every conclusion is earned by a real question (or the archive) and folds real pieces', () => {
    for (const c of data.conclusions) {
      expect(c.via === 'archive' || data.deductions[c.via] !== undefined, `${c.id} via ${c.via}`).toBe(true)
      for (const id of c.fold) {
        const known = data.evidence.some(e => e.id === id) || data.testimony.some(t => t.id === id)
        expect(known, `${c.id} folds ${id}`).toBe(true)
      }
    }
  })

  it('a question every answer of which is folded into its card', () => {
    for (const c of data.conclusions) {
      const d = data.deductions[c.via]
      if (!d) continue
      for (const id of d.answer) expect(c.fold, `${c.id} misses ${id}`).toContain(id)
    }
  })

  it('every merge question is free, so being handed the answer costs nothing', () => {
    for (const d of Object.values(data.deductions)) {
      if (d.tier === undefined) continue
      expect(d.free, d.id).toBe(true)
    }
  })

  it('the name of the real culprit never appears in a conclusion or a merge question', () => {
    for (const c of data.conclusions) expect(c.name + c.desc, c.id).not.toContain('黎默')
    for (const d of Object.values(data.deductions)) {
      if (d.tier === undefined) continue
      expect([d.prompt, ...d.hints].join(''), d.id).not.toContain('黎默')
    }
  })
})

describe('pendingMerge', () => {
  it('asks the first merge question whose tier has come and whose pieces you hold', () => {
    const s = withMergePieces()
    expect(pendingMerge(s, defs, 1)?.id).toBe('m01')
  })

  it('a solved question is never asked again', () => {
    const s = withMergePieces()
    s.flags['deduce:m01:solved'] = true
    expect(pendingMerge(s, defs, 1)).toBeNull()
  })

  it('a question does not come up before its tier', () => {
    const s = withMergePieces()
    expect(pendingMerge(s, defs, 0)).toBeNull()
  })

  it('without the pieces, the question waits', () => {
    const s = createInitialState()
    expect(canDeduce(s, data.deductions.m01)).toBe(false)
    expect(pendingMerge(s, defs, 1)).toBeNull()
  })
})

describe('a free merge question', () => {
  const freeDef: DeductionDef = {
    id: 'free1',
    tier: 1,
    free: true,
    prompt: '连起来',
    pick: 2,
    answer: ['E03', 'E04'],
    hints: ['再想想'],
  }

  it('three misses hand the answer over, but never mark it forced', () => {
    const s = createInitialState()
    const session = startDeduction(freeDef)
    submitDeduction(s, session, ['E01', 'E02'])
    submitDeduction(s, session, ['E05', 'E06'])
    const last = submitDeduction(s, session, ['E08', 'E10'])
    expect(last.kind).toBe('forced')
    expect(s.flags['deduce:free1:solved']).toBe(true)
    expect(s.flags['deduce:free1:forced']).toBeUndefined()
  })
})

describe('conclusion cards', () => {
  it('are owned once their question is solved', () => {
    const s = createInitialState()
    expect(ownedConclusions(s, data.conclusions)).toEqual([])
    s.flags['deduce:m01:solved'] = true
    expect(ownedConclusions(s, data.conclusions).map(c => c.id)).toEqual(['C05'])
  })

  it('fold every clue they stand for', () => {
    const s = createInitialState()
    s.flags['deduce:m01:solved'] = true
    expect([...foldedIds(s, data.conclusions)].sort()).toEqual(['E03', 'E04', 'T02'])
  })

  it('answer for the pieces they fold that you hold, and only while owned', () => {
    const s = createInitialState()
    s.evidence.push('E03', 'E04')
    s.testimony.push('T02')
    expect(aliasOf(s, data.conclusions, 'C05')).toEqual([])
    s.flags['deduce:m01:solved'] = true
    expect(aliasOf(s, data.conclusions, 'C05')).toEqual(['E03', 'E04', 'T02'])
    expect(aliasOf(s, data.conclusions, 'E03')).toEqual([])
  })

  it('never stand in for a piece that was never found', () => {
    const s = createInitialState()
    s.evidence.push('E03', 'E04')
    s.testimony.push('T02')
    s.flags['deduce:m03:solved'] = true // folds the autopsy, the press release, T30 and the slips; none of them held here
    expect(aliasOf(s, data.conclusions, 'C07')).toEqual([])
  })
})

describe('presenting a conclusion card in a cross-examination', () => {
  function makeDef(): ExamDef {
    return {
      id: 't', title: 't', startPersuasion: 5,
      wrongReply: [line('你拿这个出来，是想说明什么？')],
      statements: [{
        id: 's', text: '陈述',
        steps: [{ kind: 'present', id: 'a', accepts: ['E07'], reply: [line('a')], replyFor: { E07: [line('a-e07')] } }],
      }],
    }
  }

  it('is accepted wherever a folded piece would be, at no cost', () => {
    const ex = startExam(makeDef(), 5)
    const r = present(ex, 's', 'C01', ['C01'], undefined, ['E07', 'T01'])
    expect(r.outcome).toBe('correct')
    expect(r.persuasion).toBe(5)
    expect(r.lines).toEqual([line('a-e07')])
  })

  it('without an alias it is just unknown evidence, and costs a point', () => {
    const ex = startExam(makeDef(), 5)
    const r = present(ex, 's', 'C01', ['C01'], undefined, [])
    expect(r.outcome).toBe('wrong')
    expect(r.persuasion).toBe(4)
  })

  it('still has to be owned itself', () => {
    const ex = startExam(makeDef(), 5)
    expect(present(ex, 's', 'C01', [], undefined, ['E07']).outcome).toBe('ignored')
    expect(ex.persuasion).toBe(5)
  })
})

describe('store: an evening of merge questions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function atTheEvening() {
    const store = useGameStore()
    store.state.evidence.push('E03', 'E04')
    store.state.testimony.push('T02')
    store.data.scenes['tmp_merge_night'] = [
      { type: 'deduce', id: 'tier:1' },
      { type: 'say', speaker: 'lyc', text: '夜里过去了' },
    ]
    store.screen = 'scene'
    store.playScene('tmp_merge_night')
    return store
  }

  it('asks the first merge question that has the pieces', () => {
    const store = atTheEvening()
    expect(store.deduction?.def.id).toBe('m01')
  })

  it('solving one shows its card and stays on the node until the player continues', () => {
    const store = atTheEvening()
    expect(store.submitDeduction(['E03', 'E04', 'T02']).kind).toBe('solved')
    expect(store.deduction).toBeNull()
    expect(store.deductionResult?.name).toBe('我在里面只有四分钟')
    expect(store.currentNode).toMatchObject({ type: 'deduce', id: 'tier:1' })
  })

  it('continuing with nothing left to ask moves past the node', () => {
    const store = atTheEvening()
    store.submitDeduction(['E03', 'E04', 'T02'])
    store.continueDeduction()
    expect(store.deductionResult).toBeNull()
    expect(store.currentNode).toMatchObject({ type: 'say', text: '夜里过去了' })
  })
})

describe('the real nights ask the merge questions', () => {
  it('each night scene ends with its tier node, just before the lights go out', () => {
    for (const [scene, tier] of [['day1_night', 1], ['day2_night', 2], ['day3_night', 3], ['day4_night', 4]] as const) {
      const nodes = data.scenes[scene] as { type: string; id?: string; text?: string }[]
      const at = nodes.findIndex(n => n.type === 'deduce' && n.id === `tier:${tier}`)
      expect(at, scene).toBeGreaterThan(0)
      expect(nodes[at + 1]?.text, scene).toContain('你终于合上眼睛')
    }
  })

  it('night 4 files the loose ends into the archive card', () => {
    const nodes = data.scenes['day4_night'] as { type: string; effects?: { key?: string }[] }[]
    expect(nodes.some(n => n.type === 'effect' && n.effects?.some(e => e.key === 'deduce:archive:solved'))).toBe(true)
  })

  it('day 1 evening with the right pieces: the card, then on to sleep', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.evidence.push('E03', 'E04')
    store.state.testimony.push('T02')
    store.screen = 'scene'
    store.playScene('day1_night')
    let guard = 0
    while (store.currentNode && !store.deduction) {
      if (guard++ > 200) throw new Error('runaway')
      store.advance()
    }
    expect(store.deduction?.def.id).toBe('m01')
    expect(store.submitDeduction(['E03', 'E04', 'T02']).kind).toBe('solved')
    expect(store.collected.conclusions.map(c => c.id)).toContain('C05')
    expect(store.collected.folded).toEqual(expect.arrayContaining(['E03', 'E04', 'T02']))
    store.continueDeduction()
    expect(store.currentNode).toMatchObject({ type: 'say' })
  })
})
