import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import type { GameState } from '../src/engine/types'

const data = loadData()

function play(state: GameState, sceneId: string, choices: number[] = []): void {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error('scene did not terminate')
    const node = runner.current()!
    runner.advance(node.type === 'choice' ? queue.shift() ?? 0 : undefined)
  }
}

const poolAt = (day: number, hour: number) => {
  const s = createInitialState()
  s.day = day
  s.hour = hour
  s.evidence.push('E07')
  return availableActions(s, data.actions)
}

const said = (s: GameState) => s.backlog.map(l => l.text).join('\n')

describe('there is always something to do', () => {
  it('no action hour is thin: every one has at least six things on offer, evenings included', () => {
    const hours: Record<number, number[]> = { 1: [13, 14, 15, 16, 17, 19, 20], 2: [9, 10, 11, 13, 14, 15, 16, 17, 19, 20] }
    for (const day of [1, 2]) for (const h of hours[day]) expect(poolAt(day, h).length, `day ${day} hour ${h}`).toBeGreaterThanOrEqual(6)
  })

  it('the meal hours have things to do as well: three at lunch and dinner on day 2, two at dinner on day 1', () => {
    expect(poolAt(2, 12).map(a => a.id)).toEqual(['m2-1', 'm2-2', 'm2-3'])
    expect(poolAt(2, 18).map(a => a.id)).toEqual(['m2-4', 'm2-5', 'm2-6'])
    expect(poolAt(1, 18).map(a => a.id)).toEqual(['m1-1', 'm1-2'])
    expect(poolAt(1, 12)).toEqual([])
  })

  it('every meal action is a real scene that plays to its end', () => {
    for (const a of data.actions.filter(x => x.meal)) {
      expect(a.scene, a.id).toBeDefined()
      expect(() => play(createInitialState(), a.scene!), a.id).not.toThrow()
    }
  })

  it("lunch with the outsourcers warms both of them up, and shows a 舅舅 on Lu Cheng's phone", () => {
    const s = createInitialState()
    play(s, 'm2_lunch_outsourcers')
    expect(s.affinity.shaoxy).toBe(50)
    expect(s.affinity.lucheng).toBe(55)
    expect(said(s)).toContain('舅舅')
  })

  it('bringing Meng Yao something to eat makes her like you more, at lunch or at dinner', () => {
    for (const id of ['m2_lunch_mengyao', 'm2_dinner_mengyao']) {
      const s = createInitialState()
      play(s, id)
      expect(s.affinity.mengyao, id).toBe(55)
    }
  })

  it('the meal hour can take a gift for the person you are with', () => {
    expect(data.actions.find(a => a.id === 'm2-3')?.npc).toBe('mengyao')
    expect(data.actions.find(a => a.id === 'm2-6')?.npc).toBe('mengyao')
  })
})

describe('more places to look at', () => {
  it('the street below the office is a place of its own, open on both days', () => {
    const street = data.rooms.find(r => r.id === 'street')!
    expect(street.hotspots.map(h => h.id)).toEqual(['st_subway', 'st_shops', 'st_road'])
    expect(data.actions.find(a => a.id === '1-13')).toMatchObject({ room: 'street', days: [1] })
    expect(data.actions.find(a => a.id === '2-19')).toMatchObject({ room: 'street', days: [2] })
  })

  it('the office has gained your own desk and the filing cabinet', () => {
    const ids = data.rooms.find(r => r.id === 'office')!.hotspots.map(h => h.id)
    expect(ids).toEqual(expect.arrayContaining(['of_hr', 'of_window', 'of_limo', 'of_myseat', 'of_cabinet']))
  })

  it('the subway exit confirms the eight-minute walk that clears Meng Yao', () => {
    const s = createInitialState()
    play(s, 'inspect_st_subway')
    expect(said(s)).toContain('八分钟')
  })

  it('the filing cabinet quietly supports the reason Limo gave for being let in', () => {
    const s = createInitialState()
    play(s, 'inspect_of_cabinet')
    expect(said(s)).toContain('纸质存档')
  })
})

describe('the scenes fit the hour they can happen at', () => {
  it('an action open all day does not force a daytime picture, so the evening looks like evening', () => {
    for (const a of data.actions.filter(x => x.scene && !x.meal && x.minHour === undefined && x.maxHour === 20)) {
      for (const n of data.scenes[a.scene!]) if (n.type === 'bg') expect(n.time, `${a.id} bg`).toBeUndefined()
    }
  })

  it('after the murder nobody walks into the picture with the trophy on the shelf', () => {
    for (const id of Object.keys(data.scenes)) {
      if (/^(act_2_|inspect_|day2_|m2_|attack)/.test(id)) {
        for (const n of data.scenes[id]) if (n.type === 'bg') expect(n.id, id).not.toBe('hr_office')
      }
    }
  })
})
