import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import {
  fullBacklog, flatten, isImportantChoice, newTimeline, parseTimeline, pathTo, record, restoreState, serializeTimeline,
} from '../src/engine/timeline'

const line = (n: number) => ({ id: `L${n}`, speaker: 'narration' as const, text: `line ${n}`, day: 1, hour: 9 })

function stateWithLog(n: number, hour = 9) {
  const s = createInitialState()
  s.hour = hour
  for (let i = 1; i <= n; i++) s.backlog.push(line(i))
  return s
}

describe('rewind tree: nodes', () => {
  it('each node keeps only the log lines added since its parent, and the whole log is rebuilt on the way back', () => {
    const tl = newTimeline('t')
    const a = record(tl, stateWithLog(3), { kind: 'hub', label: 'a' })
    const b = record(tl, stateWithLog(5, 10), { kind: 'hub', label: 'b' })
    expect(a.logDelta).toHaveLength(3)
    expect(b.logDelta).toHaveLength(2)
    expect(b.parent).toBe(a.id)
    expect(fullBacklog(tl, b.id).map(l => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5'])
    const back = restoreState(tl, b.id)
    expect(back.backlog).toHaveLength(5)
    expect(back.hour).toBe(10)
  })

  it('restoring gives a copy: changing it does not change the node', () => {
    const tl = newTimeline('t')
    const a = record(tl, stateWithLog(1), { kind: 'hub', label: 'a' })
    const s = restoreState(tl, a.id)
    s.evidence.push('E01')
    s.backlog.pop()
    expect(restoreState(tl, a.id).evidence).toEqual([])
    expect(restoreState(tl, a.id).backlog).toHaveLength(1)
  })

  it('a hub entered again in the same hour refreshes the node instead of adding one', () => {
    const tl = newTimeline('t')
    const first = record(tl, stateWithLog(2), { kind: 'hub', label: 'a', refreshSameHub: true })
    const s = stateWithLog(2)
    s.money = 99
    const again = record(tl, s, { kind: 'hub', label: 'b', refreshSameHub: true })
    expect(again.id).toBe(first.id)
    expect(tl.nodes).toHaveLength(1)
    expect(restoreState(tl, first.id).money).toBe(99)
  })

  it('a different hour does add a node', () => {
    const tl = newTimeline('t')
    record(tl, stateWithLog(2, 9), { kind: 'hub', label: 'a', refreshSameHub: true })
    record(tl, stateWithLog(2, 10), { kind: 'hub', label: 'b', refreshSameHub: true })
    expect(tl.nodes).toHaveLength(2)
  })
})

describe('rewind tree: branches', () => {
  function branched() {
    const tl = newTimeline('t')
    const a = record(tl, stateWithLog(1, 9), { kind: 'hub', label: 'a' })
    const b = record(tl, stateWithLog(2, 10), { kind: 'hub', label: 'b' })
    tl.head = a.id // rewind to a, then do something else
    const c = record(tl, stateWithLog(3, 10), { kind: 'hub', label: 'c' })
    return { tl, a, b, c }
  }

  it('going back and recording grows a branch off the node you went back to', () => {
    const { tl, a, b, c } = branched()
    expect(b.parent).toBe(a.id)
    expect(c.parent).toBe(a.id)
    expect(tl.head).toBe(c.id)
    expect(pathTo(tl, c.id)).toEqual([a.id, c.id])
  })

  it('the log of a branch does not contain the other branch', () => {
    const { tl, b, c } = branched()
    expect(fullBacklog(tl, b.id)).toHaveLength(2)
    expect(fullBacklog(tl, c.id)).toHaveLength(3)
    expect(fullBacklog(tl, c.id).map(l => l.id)).toEqual(['L1', 'L2', 'L3'])
  })

  it('flatten lists the oldest branch first, indents the later one and marks the current line', () => {
    const { tl, a, b, c } = branched()
    const rows = flatten(tl)
    expect(rows.map(r => r.id)).toEqual([a.id, b.id, c.id])
    expect(rows.map(r => r.depth)).toEqual([0, 0, 1])
    expect(rows[0].forks).toBe(true)
    expect(rows.find(r => r.id === c.id)!.isHead).toBe(true)
    expect(rows.find(r => r.id === b.id)!.onPath).toBe(false)
    expect(rows.find(r => r.id === a.id)!.onPath).toBe(true)
  })
})

describe('rewind tree: which choices are worth a node', () => {
  const opt = (extra: object = {}) => ({ text: 'x', ...extra })
  it('a choice with effects or a leak is', () => {
    expect(isImportantChoice({ options: [opt({ effects: [{}] }), opt()] }, 'act_x')).toBe(true)
    expect(isImportantChoice({ options: [opt({ leak: 'x' }), opt()] }, 'tk_a')).toBe(true)
  })
  it('a plain question is, a topic menu or the stamina stairs is not', () => {
    expect(isImportantChoice({ options: [opt({ goto: 'a' }), opt({ goto: 'b' })] }, 'act_1_8')).toBe(true)
    expect(isImportantChoice({ options: [opt({ goto: 'a' }), opt({ goto: 'b' })] }, 'tk_lu_t2')).toBe(false)
    expect(isImportantChoice({ options: [opt({ goto: 'a' }), opt({ goto: 'b' })] }, 'stm_3_2')).toBe(false)
  })
  it('a single option is never one, and the scene can force either way', () => {
    expect(isImportantChoice({ options: [opt({ effects: [{}] })] }, 'act_x')).toBe(false)
    expect(isImportantChoice({ options: [opt(), opt()], important: true }, 'tk_a')).toBe(true)
    expect(isImportantChoice({ options: [opt({ effects: [{}] }), opt()], important: false }, 'act_x')).toBe(false)
  })
})

describe('rewind tree: storage', () => {
  it('survives a round trip, and rejects garbage', () => {
    const tl = newTimeline('t')
    record(tl, stateWithLog(2), { kind: 'hub', label: 'a' })
    const back = parseTimeline(serializeTimeline(tl))
    expect(back?.nodes).toHaveLength(1)
    expect(back?.uid).toBe('t')
    expect(parseTimeline(null)).toBeNull()
    expect(parseTimeline('{"version":1')).toBeNull()
    expect(parseTimeline('{"version":2,"uid":"t","nodes":[],"head":null}')).toBeNull()
    expect(parseTimeline('{"version":1,"uid":"t","nodes":[],"head":3}')).toBeNull()
  })
})
