import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ExamDef, Line } from '../src/engine/types'
import { chooseOption, present, startExam } from '../src/engine/crossexam'
import { nudgeLine, shouldNudge } from '../src/engine/examHint'
import { useGameStore } from '../src/engine/store'

const line = (text: string): Line => ({ speaker: 'limo', text })
const OWNED = ['E06', 'E13', 'E99']
const META = { E06: { type: '记录' } }
const kindOf = (id: string): 'evidence' | 'testimony' | 'other' => (OWNED.includes(id) ? 'evidence' : 'other')

// One line with two weak points; only the first can be broken, by E06.
function makeDef(): ExamDef {
  return {
    id: 'h', title: 'h', startPersuasion: 8,
    wrongReply: [line('你拿这个出来，是想说明什么？')],
    statements: [{
      id: 's', text: '我那天{{m1:一直在办公室}}，{{m2:没出去过}}。',
      steps: [{ kind: 'present', id: 'a', accepts: ['E06'], target: 'm1', reply: [line('a')] }],
    }],
  }
}

function pressOnly(): ExamDef {
  return {
    id: 'p', title: 'p', startPersuasion: 8,
    wrongReply: [line('什么？')],
    statements: [{
      id: 's', text: '没什么好说的。',
      steps: [{ kind: 'press', id: 'q', reply: [line('q')] }],
    }],
  }
}

describe('shouldNudge', () => {
  it('speaks up on the second failure, then on every other one after that', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(shouldNudge)).toEqual([0, 0, 1, 0, 2, 0, 2, 0])
  })
})

describe('the stuck tally', () => {
  it('counts failed presentations on the same line and is wiped by the right one', () => {
    const ex = startExam(makeDef(), 8)
    expect(present(ex, 's', 'E99', OWNED).stuck).toBe(1)
    expect(present(ex, 's', 'E99', OWNED).stuck).toBe(2)
    expect(present(ex, 's', 'E99', OWNED).stuck).toBe(3)
    expect(ex.stuck?.s).toBe(3)
    const right = present(ex, 's', 'E06', OWNED)
    expect(right.outcome).toBe('correct')
    expect(right.stuck).toBeUndefined()
    expect(ex.stuck?.s).toBe(0)
  })

  it('a wrong argument option does not count', () => {
    const def: ExamDef = {
      id: 'arg', title: 'arg', startPersuasion: 8, wrongReply: [],
      statements: [{
        id: 's', text: 'x',
        steps: [{
          kind: 'argument', id: 'a', prompt: '为什么？',
          options: [{ text: '错', correct: false, reply: [line('no')] }, { text: '对', correct: true, reply: [line('yes')] }],
        }],
      }],
    }
    const ex = startExam(def, 8)
    const r = chooseOption(ex, 's', 'a', 0)
    expect(r.outcome).toBe('wrong')
    expect(r.stuck).toBeUndefined()
    expect(ex.stuck?.s ?? 0).toBe(0)
  })
})

describe('nudgeLine', () => {
  it('first points at the words that do not hold up, never naming the piece', () => {
    const ex = startExam(makeDef(), 8)
    present(ex, 's', 'E99', OWNED)
    const hit = present(ex, 's', 'E99', OWNED)
    expect(shouldNudge(hit.stuck!)).toBe(1)
    const n = nudgeLine(ex, 's', 1, META, kindOf)!
    expect(n.speaker).toBe('laohan')
    expect(n.expr).toBe('soft')
    expect(n.text).toContain('一直在办公室')
    expect(n.text).not.toMatch(/E\d\d/)
  })

  it('then says what kind of piece would break it, still without naming it', () => {
    const ex = startExam(makeDef(), 8)
    for (let i = 0; i < 4; i++) present(ex, 's', 'E99', OWNED)
    const n = nudgeLine(ex, 's', 2, META, kindOf)!
    expect(n.text).toContain('一直在办公室')
    expect(n.text).toContain('大概得拿一份记录出来')
    expect(n.text).not.toMatch(/E\d\d/)
  })

  it('falls back to testimony when the file has no type but the piece is something somebody said', () => {
    const def = makeDef()
    def.statements[0].steps = [{ kind: 'present', id: 'a', accepts: ['T06'], target: 'm1', reply: [line('a')] }]
    const ex = startExam(def, 8)
    const n = nudgeLine(ex, 's', 2, {}, () => 'testimony')!
    expect(n.text).toContain('大概得翻翻谁说过的话')
  })

  it('tells the player to press when that is all the line has left', () => {
    const ex = startExam(pressOnly(), 8)
    const n = nudgeLine(ex, 's', 1, META, kindOf)!
    expect(n.text).toContain('追问过吗')
    expect(nudgeLine(ex, 's', 2, META, kindOf)!.text).toContain('追问过吗')
  })

  it('says nothing when there is nothing to present or press', () => {
    const def = makeDef()
    def.statements[0].steps = []
    const ex = startExam(def, 8)
    expect(nudgeLine(ex, 's', 1, META, kindOf)).toBeNull()
  })
})

describe('store: Lao Han speaks up after the line keeps resisting', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('appends his nudge to the failure reply, and keeps it out of the log', () => {
    const store = useGameStore()
    store.data.exams.h = makeDef()
    store.state.evidence.push('E06', 'E99')
    store.startExamById('h')
    const logsBefore = store.state.backlog.length
    store.examPresent('E99')
    const r = store.examPresent('E99')
    expect(r.stuck).toBe(2)
    expect(r.lines.at(-1)?.speaker).toBe('laohan')
    expect(r.lines.at(-1)?.text).toContain('一直在办公室')
    expect(store.state.backlog.length).toBe(logsBefore)
  })
})
