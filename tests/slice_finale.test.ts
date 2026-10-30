import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { startExam, present, press, computePersuasion } from '../src/engine/crossexam'

const data = loadData()
const def = data.exams.finale_act1
const kit = data.debugKit
const OWNED = [...kit.evidence, ...kit.testimony, 'T06']

function runToEnd(sceneId: string): string[] {
  const state = createInitialState()
  const runner = new SceneRunner(state, data.scenes)
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 200) throw new Error('did not terminate')
    runner.advance()
  }
  return state.backlog.map(l => l.text)
}

describe('finale act 1 content', () => {
  it('is loaded with five statements and the spec starting persuasion', () => {
    expect(def).toBeDefined()
    expect(def.statements.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(def.startPersuasion).toBe(5)
    expect(def.onClear).toBe('finale_act1_end')
  })

  it('the debug kit carries what act 1 needs, plus a T06 quote for the log', () => {
    expect(kit.evidence).toContain('E14')
    expect(kit.testimony).toContain('T05')
    expect(kit.backlog.some(l => l.tag === 'T06')).toBe(true)
  })

  it('statement 2 (the toilet lie) clears in the spec order', () => {
    const ex = startExam(def, 5)
    expect(present(ex, 's2', 'E06', OWNED).outcome).toBe('correct')
    expect(press(ex, 's2').outcome).toBe('correct')
    expect(present(ex, 's2', 'E13', OWNED).outcome).toBe('correct')
    expect(present(ex, 's2', 'E15', OWNED).outcome).toBe('correct')
    const last = present(ex, 's2', 'T06', OWNED)
    expect(last.outcome).toBe('correct')
    expect(last.statementCleared).toBe(true)
    expect(ex.persuasion).toBe(5)
  })

  it('T06 is premature before the three logs, and E13 is premature before the press', () => {
    const ex = startExam(def, 5)
    expect(present(ex, 's2', 'T06', OWNED).outcome).toBe('premature')
    expect(present(ex, 's2', 'E13', OWNED).outcome).toBe('premature')
    expect(ex.persuasion).toBe(5)
  })

  it('evidence that belongs to another line of the act is answered, and costs nothing', () => {
    const ex = startExam(def, 5)
    const r = present(ex, 's2', 'E12', OWNED)
    expect(r.outcome).toBe('elsewhere')
    expect(r.persuasion).toBe(5)
  })

  it('evidence that belongs nowhere in the act costs a point', () => {
    const used = new Set(def.statements.flatMap(s => s.steps.flatMap(st => (st.kind === 'present' ? st.accepts : []))))
    const junk = data.evidence.map(e => e.id).find(id => !used.has(id))!
    const ex = startExam(def, 5)
    const r = present(ex, 's2', junk, [...OWNED, junk])
    expect(r.outcome).toBe('wrong')
    expect(r.persuasion).toBe(4)
  })

  it('the vague T06a works as the capstone too, with its own line', () => {
    const owned = [...kit.evidence, ...kit.testimony, 'T06a']
    const ex = startExam(def, 5)
    present(ex, 's2', 'E06', owned)
    press(ex, 's2')
    present(ex, 's2', 'E13', owned)
    present(ex, 's2', 'E15', owned)
    const r = present(ex, 's2', 'T06a', owned)
    expect(r.outcome).toBe('correct')
    expect(r.lines.map(l => l.text).join('')).toContain('故事越编越细')
  })

  it('statement 4 (21:08) clears, and with statement 2 the exam is cleared', () => {
    const ex = startExam(def, 5)
    present(ex, 's2', 'E06', OWNED)
    press(ex, 's2')
    present(ex, 's2', 'E13', OWNED)
    present(ex, 's2', 'E15', OWNED)
    present(ex, 's2', 'T06', OWNED)
    expect(ex.cleared).toBe(false)
    expect(present(ex, 's4', 'E14', OWNED).outcome).toBe('correct')
    expect(present(ex, 's4', 'E03', OWNED).outcome).toBe('correct')
    const last = press(ex, 's4')
    expect(last.statementCleared).toBe(true)
    expect(last.examCleared).toBe(true)
  })

  it('statements 1, 3 and 5 need nothing; pressing statement 3 logs the light quote', () => {
    const ex = startExam(def, 5)
    const r = press(ex, 's3')
    expect(r.outcome).toBe('correct')
    expect(r.lines.find(l => l.tag === 'Q-light')?.text).toContain('屏幕的光')
    expect(press(ex, 's5').lines.map(l => l.text).join('')).toContain('不想你被冤枉')
  })

  it('persuasion for the finale starts from computePersuasion', () => {
    expect(computePersuasion(createInitialState())).toBe(8)
  })

  it('the intro and the act-1 ending scenes play to the end', () => {
    expect(runToEnd('finale_intro').join('\n')).toContain('我想作证')
    expect(runToEnd('finale_act1_end').join('\n')).toContain('我是周屿的未婚夫')
  })
})
