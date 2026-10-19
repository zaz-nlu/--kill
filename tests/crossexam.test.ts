import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { addLog, toggleNote } from '../src/engine/log'
import type { ExamDef, Line } from '../src/engine/types'
import {
  startExam, present, press, chooseOption, availableSteps, computePersuasion,
} from '../src/engine/crossexam'

const line = (text: string): Line => ({ speaker: 'limo', text })
const OWNED = ['E06', 'E13', 'T06', 'T06a', 'E99', 'E12']

function makeDef(): ExamDef {
  return {
    id: 't', title: 't', startPersuasion: 5,
    wrongReply: [line('你拿这个出来，是想说明什么？')],
    statements: [{
      id: 's', text: '陈述',
      steps: [
        { kind: 'present', id: 'a', accepts: ['E06'], reply: [line('a')] },
        { kind: 'press', id: 'b', after: ['a'], reply: [line('b')] },
        { kind: 'present', id: 'c', accepts: ['E13'], after: ['b'], reply: [line('c')] },
        { kind: 'present', id: 'd', accepts: ['T06', 'T06a'], after: ['c'], reply: [line('d')], replyFor: { T06a: [line('d-vague')] } },
        {
          kind: 'argument', id: 'e', after: ['d'], prompt: '为什么？',
          options: [
            { text: '错', correct: false, reply: [line('e-wrong')] },
            { text: '对', correct: true, reply: [line('e-right')] },
          ],
        },
      ],
    }],
  }
}

describe('cross-examination', () => {
  it('walks a full chain in order and clears the exam without losing persuasion', () => {
    const ex = startExam(makeDef(), 5)
    expect(present(ex, 's', 'E06', OWNED).outcome).toBe('correct')
    expect(press(ex, 's').outcome).toBe('correct')
    expect(present(ex, 's', 'E13', OWNED).outcome).toBe('correct')
    expect(present(ex, 's', 'T06', OWNED).outcome).toBe('correct')
    const last = chooseOption(ex, 's', 'e', 1)
    expect(last.outcome).toBe('correct')
    expect(last.statementCleared).toBe(true)
    expect(last.examCleared).toBe(true)
    expect(ex.persuasion).toBe(5)
  })

  it('evidence no step accepts is wrong: -1 and the wrongReply', () => {
    const ex = startExam(makeDef(), 5)
    const r = present(ex, 's', 'E99', OWNED)
    expect(r.outcome).toBe('wrong')
    expect(r.persuasion).toBe(4)
    expect(r.lines).toEqual(makeDef().wrongReply)
  })

  it('right evidence at the wrong time is premature: no penalty, no lines', () => {
    const ex = startExam(makeDef(), 5)
    const r = present(ex, 's', 'E13', OWNED)
    expect(r.outcome).toBe('premature')
    expect(r.persuasion).toBe(5)
    expect(r.lines).toEqual([])
  })

  it('repeating evidence for a finished step is ignored, not punished', () => {
    const ex = startExam(makeDef(), 5)
    present(ex, 's', 'E06', OWNED)
    expect(present(ex, 's', 'E06', OWNED).outcome).toBe('ignored')
    expect(ex.persuasion).toBe(5)
  })

  it('ignores evidence the player does not own, with no penalty', () => {
    const ex = startExam(makeDef(), 5)
    const r = present(ex, 's', 'E06', [])
    expect(r.outcome).toBe('ignored')
    expect(r.persuasion).toBe(5)
    expect(availableSteps(ex, 's').map(s => s.id)).toEqual(['a'])
  })

  it('press with nothing to press is ignored and free', () => {
    const ex = startExam(makeDef(), 5)
    expect(press(ex, 's').outcome).toBe('ignored')
    expect(ex.persuasion).toBe(5)
  })

  it('persuasion hits zero: exam fails and every later input is ignored', () => {
    const ex = startExam(makeDef(), 5)
    let last = present(ex, 's', 'E99', OWNED)
    for (let i = 0; i < 4; i++) last = present(ex, 's', 'E99', OWNED)
    expect(last.failed).toBe(true)
    expect(last.persuasion).toBe(0)
    expect(present(ex, 's', 'E99', OWNED).persuasion).toBe(0)
    expect(present(ex, 's', 'E06', OWNED).outcome).toBe('ignored')
    expect(press(ex, 's').outcome).toBe('ignored')
    expect(ex.failed).toBe(true)
  })

  it("a wrong argument option costs one point and plays that option's reply", () => {
    const ex = startExam(makeDef(), 5)
    present(ex, 's', 'E06', OWNED)
    press(ex, 's')
    present(ex, 's', 'E13', OWNED)
    present(ex, 's', 'T06', OWNED)
    const wrong = chooseOption(ex, 's', 'e', 0)
    expect(wrong.outcome).toBe('wrong')
    expect(wrong.persuasion).toBe(4)
    expect(wrong.lines).toEqual([line('e-wrong')])
    expect(chooseOption(ex, 's', 'e', 1).outcome).toBe('correct')
  })

  it('chooseOption on a step that is not available is ignored', () => {
    const ex = startExam(makeDef(), 5)
    expect(chooseOption(ex, 's', 'e', 1).outcome).toBe('ignored')
    expect(chooseOption(ex, 's', 'a', 0).outcome).toBe('ignored')
    expect(ex.persuasion).toBe(5)
  })

  it('replyFor overrides the reply for a specific presented id', () => {
    const run = (id: string) => {
      const ex = startExam(makeDef(), 5)
      present(ex, 's', 'E06', OWNED)
      press(ex, 's')
      present(ex, 's', 'E13', OWNED)
      return present(ex, 's', id, OWNED)
    }
    expect(run('T06').lines).toEqual([line('d')])
    const vague = run('T06a')
    expect(vague.outcome).toBe('correct')
    expect(vague.lines).toEqual([line('d-vague')])
  })

  it('a statement with no required steps is cleared from the start; the exam needs every statement', () => {
    const def: ExamDef = {
      id: 'u', title: 'u', startPersuasion: 5, wrongReply: [],
      statements: [
        { id: 'p', text: 'press only', steps: [{ kind: 'press', id: 'x', reply: [line('x')] }] },
        { id: 'q', text: 'needs evidence', steps: [{ kind: 'present', id: 'y', accepts: ['E06'], reply: [line('y')] }] },
      ],
    }
    const ex = startExam(def, 5)
    expect(ex.cleared).toBe(false)
    const r = present(ex, 'q', 'E06', OWNED)
    expect(r.statementCleared).toBe(true)
    expect(r.examCleared).toBe(true)
    expect(ex.cleared).toBe(true)
  })

  it('anything after the exam is cleared is ignored', () => {
    const def: ExamDef = {
      id: 'u', title: 'u', startPersuasion: 5, wrongReply: [],
      statements: [{ id: 'q', text: 'q', steps: [{ kind: 'present', id: 'y', accepts: ['E06'], reply: [] }] }],
    }
    const ex = startExam(def, 5)
    present(ex, 'q', 'E06', OWNED)
    expect(present(ex, 'q', 'E99', OWNED).outcome).toBe('ignored')
    expect(ex.persuasion).toBe(5)
  })
})

describe('computePersuasion', () => {
  it('is 5 by default, +1 for noticing a slip, +1 for a perfect challenge, capped at 7', () => {
    const s = createInitialState()
    expect(computePersuasion(s)).toBe(5)
    const slip = addLog(s, { speaker: 'limo', text: 'x', tag: 'T26' })
    toggleNote(s, slip.id)
    expect(computePersuasion(s)).toBe(6)
    s.flags.challengeAllCorrect = true
    expect(computePersuasion(s)).toBe(7)
  })
})
