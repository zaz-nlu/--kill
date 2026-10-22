import { describe, it, expect } from 'vitest'
import { loadData } from '../src/engine/data'
import type { ExamDef, Statement, Step } from '../src/engine/types'

const data = loadData()
const ex = (id: string): ExamDef => data.exams[id]
const stmt = (id: string, sid: string): Statement => ex(id).statements.find(s => s.id === sid)!
const present = (st: Statement) => st.steps.filter(s => s.kind === 'present') as Extract<Step, { kind: 'present' }>[]
const accepts = (st: Statement) => present(st).flatMap(s => s.accepts)
const byText = (id: string, needle: string) => ex(id).statements.find(s => s.text.includes(needle))!

describe('act 1 (script 10.1)', () => {
  it('has the five statements about that night', () => {
    expect(ex('finale_act1').statements).toHaveLength(5)
  })
  it('the 21:08 statement can be broken with either the log or the light-and-lamp combination', () => {
    const st = byText('finale_act1', '21:08')
    const first = present(st)[0]
    for (const id of ['E14', 'E12', 'T05', 'T02']) expect(first.accepts).toContain(id)
  })
  it('the washroom statement is a four-way blocking of the roads, ending with the first-day lie', () => {
    const st = byText('finale_act1', '洗手间')
    expect(accepts(st)).toEqual(expect.arrayContaining(['E06', 'E13', 'E15', 'T06', 'T06a']))
    const last = present(st).find(s => s.accepts.includes('T06'))!
    expect(last.after!.length).toBeGreaterThanOrEqual(3)
  })
})

describe('act 2 (script 10.2): the same kind of victim', () => {
  const id = 'finale_act2'
  it('opens with the five statements of "if I were the killer", in order', () => {
    const texts = ex(id).statements.map(s => s.text)
    for (const needle of ['贴着林一程名字的线', '临时卡', '防静电手套', '连宋砚办公室的门', '全公司都盯着我']) {
      expect(texts.some(t => t.includes(needle)), needle).toBe(true)
    }
  })
  it('the card is blocked in order: her confession, her alibi, then the three-piece set E18, E26, E33', () => {
    const card = byText(id, '孟遥做了卡')
    expect(present(card).map(s => s.accepts[0])).toEqual(['T13', 'E05', 'E26'])
    const three = byText(id, '凭什么说是我')
    const steps = present(three)
    expect(steps.map(s => s.accepts[0])).toEqual(['E18', 'E26', 'E33'])
    expect(steps[1].after).toContain(steps[0].id)
    expect(steps[2].after).toContain(steps[1].id)
    expect(steps.every(s => s.required !== false)).toBe(true)
  })
  it('the gloves and the door each have their own evidence', () => {
    expect(accepts(byText(id, '防静电手套'))).toEqual(expect.arrayContaining(['E13']))
    expect(accepts(byText(id, '连宋砚办公室的门'))).toEqual(expect.arrayContaining(['E17']))
  })
  it('"he keeps pushing me" is optional, needs three presentations, and the last one wins a point back', () => {
    const st = byText(id, '哪一句话')
    const steps = present(st)
    expect(steps).toHaveLength(3)
    expect(steps.every(s => s.required === false)).toBe(true)
    expect(steps.reduce((n, s) => n + (s.bonus ?? 0), 0)).toBe(1)
    for (const s of steps) expect(s.accepts.every(a => /^G[1-9]$/.test(a))).toBe(true)
  })
  it('"how did he know" has all five slips, each as claim and then rebuttal, and one of them is enough', () => {
    const st = byText(id, '知道得比别人多')
    for (const slip of ['T26', 'T27', 'T28', 'T29', 'T22']) expect(accepts(st), slip).toContain(slip)
    expect(st.anyOf).toHaveLength(5)
    const rebuts = present(st).filter(s => s.after)
    expect(rebuts).toHaveLength(5)
    expect(rebuts.every(s => s.bonus === 1)).toBe(true)
  })
  it('the T29 rebuttal and the T26 rebuttal are different evidence', () => {
    const st = byText(id, '知道得比别人多')
    const rebut = (slip: string) => present(st).find(s => s.after && present(st).find(a => a.id === s.after![0])!.accepts.includes(slip))!
    expect(rebut('T26').accepts).toEqual(expect.arrayContaining(['T04', 'T30']))
    expect(rebut('T29').accepts).toEqual(expect.arrayContaining(['T13']))
  })
})

describe('act 3 (script 10.3): nine o\'clock sharp', () => {
  const id = 'finale_act3'
  it('has the five statements', () => {
    expect(ex(id).statements).toHaveLength(5)
  })
  it('the light is blocked in four steps and the fourth reaches back to what he said in act 1', () => {
    const st = byText(id, '手动开了灯')
    const steps = present(st)
    expect(steps).toHaveLength(4)
    expect(steps[1].accepts).toContain('E16')
    expect(steps[2].accepts).toEqual(expect.arrayContaining(['T02', 'E20']))
    expect(steps[3].accepts).toContain('Q-light')
    expect(steps[3].required).toBe(false)
  })
  it('the recording: the frame-check findings first, then the platform evidence, then the argument', () => {
    const st = byText(id, '一直在动')
    expect(st.steps.map(s => s.kind)).toEqual(['present', 'present', 'argument'])
    expect(present(st)[0].accepts).toContain('E19')
    expect(present(st)[1].accepts).toEqual(expect.arrayContaining(['T31', 'E39']))
  })
  it('the booking: the missing bug ticket, then the OBS layout as corroboration only', () => {
    const st = byText(id, '订会议室')
    expect(present(st)[0].accepts).toEqual(expect.arrayContaining(['E26', 'E33']))
    expect(present(st)[1].accepts).toContain('E20')
  })
  it('"why 21:08": time evidence, then the three-way argument, then the 21:06:50 recording that settles it', () => {
    const st = byText(id, '三次名')
    expect(st.steps.map(s => s.kind)).toEqual(['present', 'present', 'argument', 'present'])
    expect(present(st)[2 - 1].accepts).toContain('E14')
    const last = st.steps[3] as Extract<Step, { kind: 'present' }>
    expect(last.accepts).toContain('E19')
    expect(last.after).toContain(st.steps[2].id)
  })
})

describe('act 4 (script 10.4): the silent defendant', () => {
  const id = 'finale_act4'
  it('has the five statements', () => {
    expect(ex(id).statements).toHaveLength(5)
  })
  it('the inner room is broken by the bag with her blood on it', () => {
    expect(accepts(byText(id, '没进内间'))).toContain('E21')
  })
  it('the weapon: you must ask "knocked out?" first; then the press release, then the testimony, with the autopsy as the other way', () => {
    const st = byText(id, '砸晕')
    expect(st.steps[0].kind).toBe('press')
    const steps = present(st)
    expect(steps[0].accepts).toEqual(expect.arrayContaining(['E08', 'E30']))
    expect(steps[1].accepts).toContain('T04')
  })
  it('the fingerprints: the cup, then the report, then fingerprint-over-blood, with the torn glove fibres as a bonus', () => {
    const st = byText(id, '年会')
    expect(present(st)[0].accepts).toContain('E21')
    expect(present(st)[1].accepts).toContain('E22')
    expect(st.steps.some(s => s.kind === 'argument')).toBe(true)
    expect(present(st).some(s => s.accepts.includes('E27'))).toBe(true)
  })
  it('the attacks: who was where, then left hand and bell, then the alcohol (bonus)', () => {
    const st = byText(id, '袭击林一程')
    const steps = present(st)
    expect(steps[0].accepts).toEqual(expect.arrayContaining(['T17', 'T18']))
    expect(steps[1].accepts).toEqual(expect.arrayContaining(['T16', 'T25', 'T15']))
    expect(steps[2].bonus).toBe(1)
  })
  it('premeditation: Friday, the cable, and the wiped line are separate cards, in that order', () => {
    const st = byText(id, '预谋杀人')
    const steps = present(st)
    expect(steps.map(s => s.accepts[0])).toEqual(['T09', 'T07', 'T03', 'E01'])
    expect(steps[3].after).toEqual(expect.arrayContaining([steps[0].id, steps[1].id, steps[2].id]))
  })
})

describe('the boss road (script 10.6)', () => {
  it('his alibi, then his own true remark about searching; the gate comes between that and the rest', () => {
    expect(accepts(byText('finale_boss_a', '20:20'))).toEqual(expect.arrayContaining(['E05', 'E37', 'E38']))
    expect(ex('finale_boss_a').onClear).toBe('finale_boss_a_end')
  })
  it('breaking him: Zhou Yu (with the tape if you have it), then the driver and the car', () => {
    const zhou = byText('finale_boss_b', '周屿')
    expect(accepts(zhou)).toEqual(expect.arrayContaining(['E24', 'T13', 'E36', 'T12', 'E23']))
    const driver = byText('finale_boss_b', '老刘')
    expect(accepts(driver)).toEqual(expect.arrayContaining(['E34', 'T33', 'E35']))
  })
})

describe('the people in the room react', () => {
  it('after each act there are reactions from the others, not only from Limo', () => {
    const lines = ['finale_act2', 'finale_act3', 'finale_act4']
      .flatMap(id => ex(id).statements.flatMap(s => s.steps.flatMap(st => st.kind === 'present' ? st.reply : st.kind === 'press' ? st.reply : st.options.flatMap(o => o.reply))))
    const speakers = new Set(lines.map(l => l.speaker))
    for (const who of ['boss', 'zhengcen', 'mengyao', 'shaoxy']) expect(speakers.has(who as never) || data.scenes['finale_react_' + who] !== undefined, who).toBe(true)
  })
})
