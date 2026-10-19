import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { addLog, logLines, toggleNote, visibleLog, presentableIds, noticedSlip } from '../src/engine/log'

describe('dialogue log', () => {
  it('assigns sequential ids and stamps day/hour', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 12
    const a = addLog(s, { speaker: 'limo', text: '吃了没。' })
    const b = addLog(s, { speaker: 'lyc', text: '吃了。' })
    expect([a.id, b.id]).toEqual(['L1', 'L2'])
    expect(a.day).toBe(2)
    expect(a.hour).toBe(12)
  })

  it('logLines appends in order', () => {
    const s = createInitialState()
    logLines(s, [{ speaker: 'limo', text: 'a' }, { speaker: 'lyc', text: 'b' }])
    expect(s.backlog.map(l => l.text)).toEqual(['a', 'b'])
  })

  it('never exposes the hidden tag to the UI', () => {
    const s = createInitialState()
    addLog(s, { speaker: 'limo', text: '手机别是已经沉海河了吧', tag: 'T26' })
    const view = visibleLog(s)
    expect(Object.keys(view[0])).not.toContain('tag')
    expect(JSON.stringify(view)).not.toContain('T26')
  })

  it('toggleNote reacts only when a slip line is noted', () => {
    const s = createInitialState()
    const slip = addLog(s, { speaker: 'limo', text: 'x', tag: 'T26' })
    const plain = addLog(s, { speaker: 'limo', text: 'y' })
    expect(toggleNote(s, slip.id)).toEqual({ noted: true, reaction: '……？' })
    expect(toggleNote(s, plain.id)).toEqual({ noted: true, reaction: null })
    expect(toggleNote(s, slip.id)).toEqual({ noted: false, reaction: null })
  })

  it('guide lines are not slips', () => {
    const s = createInitialState()
    const g = addLog(s, { speaker: 'limo', text: 'g', tag: 'G2' })
    expect(toggleNote(s, g.id).reaction).toBeNull()
    expect(noticedSlip(s)).toBe(false)
  })

  it('visibleLog marks noted lines', () => {
    const s = createInitialState()
    const a = addLog(s, { speaker: 'limo', text: 'a' })
    addLog(s, { speaker: 'limo', text: 'b' })
    toggleNote(s, a.id)
    expect(visibleLog(s).map(l => l.noted)).toEqual([true, false])
  })

  it('presentableIds = evidence + testimony + tags found in the log', () => {
    const s = createInitialState()
    s.evidence.push('E06')
    s.testimony.push('T02')
    addLog(s, { speaker: 'limo', text: 'x', tag: 'T26' })
    addLog(s, { speaker: 'limo', text: 'innocent version' })
    const ids = presentableIds(s)
    expect(ids).toContain('E06')
    expect(ids).toContain('T02')
    expect(ids).toContain('T26')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a slip tag is not presentable when only the innocent version was logged', () => {
    const s = createInitialState()
    addLog(s, { speaker: 'limo', text: '你说手机不见了？' })
    expect(presentableIds(s)).not.toContain('T26')
  })

  it('noticedSlip becomes true only after noting a slip line', () => {
    const s = createInitialState()
    const slip = addLog(s, { speaker: 'limo', text: 'x', tag: 'T27' })
    expect(noticedSlip(s)).toBe(false)
    toggleNote(s, slip.id)
    expect(noticedSlip(s)).toBe(true)
  })
})
