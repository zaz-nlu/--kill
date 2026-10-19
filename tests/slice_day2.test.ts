import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { presentableIds } from '../src/engine/log'
import { availableActions } from '../src/engine/calendar'
import type { GameState } from '../src/engine/types'

const data = loadData()

// Plays one scene chain to its end. `choices` are consumed, in order, by every choice node met.
function play(state: GameState, sceneId: string, choices: number[] = []): void {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error('scene did not terminate')
    const node = runner.current()!
    if (node.type === 'choice') {
      if (queue.length === 0) throw new Error(`no scripted choice for ${sceneId}`)
      runner.advance(queue.shift())
    } else {
      runner.advance()
    }
  }
}

const tags = (s: GameState) => s.backlog.map(l => l.tag).filter(Boolean)
const text = (s: GameState) => s.backlog.map(l => l.text).join('\n')

// prologue (teach choice 0) -> day1_wechat -> day1_coffee (press?, tell?)
function day1(press: boolean, tellAll: boolean): GameState {
  const s = createInitialState()
  play(s, 'prologue', [0, press ? 0 : 1, tellAll ? 0 : 1])
  return s
}

describe('prologue and day 1', () => {
  it('plays through and grants T01 and T02, with the "亲爱的" habit in the script', () => {
    const s = day1(true, false)
    expect(s.testimony).toContain('T01')
    expect(s.testimony).toContain('T02')
    expect(text(s)).toContain('亲爱的，扣你奖金')
    expect(text(s)).not.toContain('比了个')
  })

  it('both teaching choices lead to the same office scene', () => {
    const a = createInitialState()
    play(a, 'prologue', [0, 1, 1])
    const b = createInitialState()
    play(b, 'prologue', [1, 1, 1])
    expect(a.testimony).toContain('T01')
    expect(b.testimony).toContain('T01')
  })

  it('G1 arrives by WeChat, tagged but not highlighted', () => {
    const s = day1(false, false)
    expect(tags(s)).toContain('G1')
  })

  it('pressing in the coffee shop yields the specific T06 lie', () => {
    const s = day1(true, false)
    expect(tags(s)).toContain('T06a')
    expect(tags(s)).toContain('T06')
    expect(s.testimony).toContain('T06')
    expect(presentableIds(s)).toContain('T06')
  })

  it('not pressing leaves only the vague T06a', () => {
    const s = day1(false, false)
    expect(tags(s)).toContain('T06a')
    expect(tags(s)).not.toContain('T06')
    expect(s.testimony).not.toContain('T06')
    expect(presentableIds(s)).not.toContain('T06')
  })

  it('after day 1 the player knows the intel and holds the starting evidence', () => {
    const s = day1(true, false)
    expect(s.intel).toMatchObject({ phone: 'clean', draft: 'clean', trophy: 'clean', card: 'unknown' })
    for (const id of ['E01', 'E02', 'E03', 'E04', 'E07', 'E30']) expect(s.evidence).toContain(id)
  })

  it('telling Limo everything at the coffee shop leaks phone and draft, and costs danger', () => {
    const s = day1(true, true)
    expect(s.intel.phone).toBe('leaked')
    expect(s.intel.draft).toBe('leaked')
    expect(s.intel.trophy).toBe('clean')
    expect(s.danger).toBe(10)
  })
})

describe('day 2', () => {
  it('clean route: G2, T27, T26 and G3 all land in the log and are presentable', () => {
    const s = day1(true, false)
    play(s, 'day2_desk')
    play(s, 'day2_pantry')
    play(s, 'day2_lunch', [1])
    for (const t of ['G2', 'T27', 'T26', 'G3']) expect(tags(s)).toContain(t)
    for (const t of ['G1', 'G2', 'T27', 'T26', 'G3']) expect(presentableIds(s)).toContain(t)
  })

  it('leaked route: no T26 or T27 lines, but the innocent versions are there', () => {
    const s = day1(true, true)
    play(s, 'day2_desk')
    play(s, 'day2_pantry')
    play(s, 'day2_lunch', [1])
    expect(tags(s)).not.toContain('T26')
    expect(tags(s)).not.toContain('T27')
    expect(text(s)).toContain('你说有封没发完的邮件')
    expect(text(s)).toContain('你说手机不见了')
    expect(tags(s)).toContain('G2')
    expect(tags(s)).toContain('G3')
  })

  it('lunch option A tells everything: trophy leaks too, and T26 is replaced', () => {
    const s = day1(true, false)
    play(s, 'day2_lunch', [0])
    expect(s.intel.phone).toBe('leaked')
    expect(s.intel.draft).toBe('leaked')
    expect(s.intel.trophy).toBe('leaked')
    expect(tags(s)).not.toContain('T26')
    expect(tags(s)).toContain('G3')
    expect(s.affinity.limo).toBe(70 + 5 + 5)
  })

  it('lunch option B is cold: -3 affinity', () => {
    const s = day1(true, false)
    const before = s.affinity.limo
    play(s, 'day2_lunch', [1])
    expect(s.affinity.limo).toBe(before - 3)
  })

  it('the three action scenes behave as written', () => {
    const s = createInitialState()
    play(s, 'act_2_3')
    expect(s.affinity.shaoxy).toBe(60)

    const warm = createInitialState()
    play(warm, 'act_2_9')
    expect(warm.testimony).toContain('T05')
    expect(warm.testimony).toContain('T32')

    const cold = createInitialState()
    cold.affinity.mengyao = 30
    play(cold, 'act_2_9')
    expect(cold.testimony).not.toContain('T05')

    const smoke = createInitialState()
    play(smoke, 'act_2_6')
    expect(text(smoke)).toContain('烟瘾上来了')
  })

  it('day 2 ends with a closing line', () => {
    const s = createInitialState()
    play(s, 'day2_end')
    expect(text(s)).toContain('这一天结束了')
  })
})

describe('day 2 action pool', () => {
  it('offers the three actions on day 2 morning and none on day 3', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 9
    expect(availableActions(s, data.actions).map(a => a.id).sort()).toEqual(['2-3', '2-6', '2-9'])
    s.day = 3
    expect(availableActions(s, data.actions)).toEqual([])
  })

  it('every action points at a real scene', () => {
    for (const a of data.actions) expect(data.scenes[a.scene]).toBeDefined()
  })
})
