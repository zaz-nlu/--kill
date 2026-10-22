import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { availableActions, DAY_START, endDay, slotsLeft } from '../src/engine/calendar'
import { skipEvents } from './helpers'
import type { GameState } from '../src/engine/types'

const data = loadData()
const at = (day: number, hour: number, setup: (s: GameState) => void = () => {}): GameState => {
  const s = createInitialState()
  s.day = day
  s.hour = hour
  setup(s)
  return s
}
const offered = (s: GameState) => availableActions(s, data.actions).map(a => a.id)

function finishScene(store: ReturnType<typeof useGameStore>, pick = 0) {
  let guard = 0
  while (store.screen === 'scene') {
    if (guard++ > 200) throw new Error('scene never ended')
    store.advance(store.currentNode?.type === 'choice' ? pick : undefined)
  }
}

describe('the days are evened out: an early hour from day 2 on', () => {
  it('days 2 to 5 open at 08:00; day 1 still starts after the morning questioning', () => {
    expect(DAY_START).toBe(8)
    const s = createInitialState()
    endDay(s, { rested: true })
    expect(s.day).toBe(2)
    expect(s.hour).toBe(8)
  })

  it('with the 21:00 hour after the lights go out, that is twelve hours to act in on days 2-4, four on day 5, eight on day 1', () => {
    expect(slotsLeft(at(1, 13))).toBe(8)
    expect(slotsLeft(at(2, 8))).toBe(12)
    expect(slotsLeft(at(3, 8))).toBe(12)
    expect(slotsLeft(at(4, 8))).toBe(12)
    expect(slotsLeft(at(5, 8))).toBe(4)
  })

  it('the early scenes are on offer at 08:00 of their day only', () => {
    const early: [string, number][] = [['2-20', 2], ['2-21', 2], ['3-20', 3], ['3-21', 3], ['4-17', 4], ['4-18', 4], ['5-10', 5], ['5-11', 5]]
    for (const [id, day] of early) {
      expect(offered(at(day, 8)), id).toContain(id)
      expect(offered(at(day, 9)), id).not.toContain(id)
      expect(offered(at(day === 5 ? 4 : day + 1, 8)), `${id} on another day`).not.toContain(id)
    }
  })

  it('the 09:00 events still come after the early hour', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.day = 3
    store.state.hour = 8
    store.screen = 'hub'
    expect(store.screen).toBe('hub')
    store.waitAnHour()
    expect(store.screen).toBe('scene') // the morning's fixed events
  })
})

describe('the new story scenes', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function run(id: string, day: number, hour: number, setup: (s: GameState) => void = () => {}, pick = 0) {
    const store = useGameStore()
    store.state.day = day
    store.state.hour = hour
    skipEvents(store, day)
    setup(store.state)
    store.screen = 'hub'
    store.startAction(id)
    finishScene(store, pick)
    return store
  }

  it('2-20: sharing breakfast earns the most trust, saying the polite thing the least', () => {
    expect(run('2-20', 2, 8, () => {}, 0).state.affinity.mengyao).toBe(58)
    setActivePinia(createPinia())
    expect(run('2-20', 2, 8, () => {}, 1).state.affinity.mengyao).toBe(53)
    setActivePinia(createPinia())
    expect(run('2-20', 2, 8, () => {}, 2).state.affinity.mengyao).toBe(56)
  })

  it('2-21: the old guard mentions the boss at the seal; 2-24: the missing archive box', () => {
    const wang = run('2-21', 2, 8)
    expect(wang.state.flags.boss_at_seal).toBe(true)
    expect(wang.state.hour).toBe(9)
    setActivePinia(createPinia())
    const archive = run('2-24', 2, 10)
    expect(archive.state.flags.archive_missing).toBe(true)
    expect(archive.state.affinity.mengyao).toBe(60)
  })

  it("3-20 and 3-21: Su Wen's leg, and the boss's driver who asks about 'something' she left you", () => {
    const suwen = run('3-20', 3, 8)
    expect(suwen.state.affinity.suwen).toBe(68)
    setActivePinia(createPinia())
    const liu = run('3-21', 3, 8)
    expect(liu.state.flags.met_laoliu).toBe(true)
    expect(liu.state.danger).toBe(5)
    expect(liu.state.backlog.map(l => l.text).join('\n')).toContain('檀香')
  })

  it('4-17, 4-18, 5-10 and 5-11 give small rewards and no evidence', () => {
    const before = (s: GameState) => s.evidence.length + s.testimony.length
    const flowers = run('4-17', 4, 8)
    expect(flowers.state.affinity.shaoxy).toBe(55)
    expect(before(flowers.state)).toBe(0)
    setActivePinia(createPinia())
    const breakfast = run('4-18', 4, 8)
    expect(breakfast.state.trust).toBe(25)
    setActivePinia(createPinia())
    const han = run('5-10', 5, 8)
    expect(han.state.trust).toBe(28)
    setActivePinia(createPinia())
    const review = run('5-11', 5, 8)
    expect(before(review.state)).toBe(0)
    expect(review.state.backlog.map(l => l.text).join('\n')).toContain('我还没找到它')
  })

  it("5-11 notices what you hold: with the trophy and the recording it says so, and nothing else changes", () => {
    const store = run('5-11', 5, 8, s => s.evidence.push('E21', 'E39', 'E36'))
    const said = store.state.backlog.map(l => l.text).join('\n')
    expect(said).toContain('指纹报告下午出来')
    expect(said).toContain('一格一格看过了')
    expect(said).not.toContain('我还没找到它')
  })

  it('none of them names Limo: the player is left to connect things', () => {
    for (const id of ['act_2_20', 'act_2_21', 'act_2_24', 'act_3_20', 'act_3_21', 'act_4_17', 'act_4_18', 'act_5_10', 'act_5_11']) {
      expect(data.scenes[id], id).toBeDefined()
      expect(JSON.stringify(data.scenes[id]), id).not.toContain('黎默')
    }
  })
})

describe('the rooms spread over the days', () => {
  it('the machine room, the outsourcing area and the two offices open from day 2', () => {
    const s = at(2, 14, st => st.evidence.push('E07'))
    for (const id of ['r-server', 'r-outsource', 'r-boss', 'r-vp']) expect(offered(s), id).toContain(id)
    expect(offered(at(1, 14, st => st.evidence.push('E07')))).not.toContain('r-server')
  })

  it('the night searches stay on days 3 and 4', () => {
    for (const id of ['r-hr-night', 'r-hr-outer', 'r-security', 'r-parking']) {
      expect(offered(at(2, 19)), id).not.toContain(id)
      expect(offered(at(3, 19)), id).toContain(id)
    }
  })

  it('on day 1 the 17th floor is sealed: the smoking corner and the lobby can be looked at, the pantry cannot', () => {
    for (const id of ['r-smoking', 'r-lobby', 'r-store']) expect(offered(at(1, 14)), id).toContain(id)
    expect(offered(at(1, 14))).not.toContain('r-pantry')
    expect(offered(at(2, 14))).toContain('r-pantry')
  })

  it('day 1 has its own rooms: the flat (day 1 only) and the store (every day)', () => {
    expect(offered(at(1, 13))).toContain('1-24')
    expect(offered(at(2, 13))).not.toContain('1-24')
    for (const d of [1, 2, 3, 4]) expect(offered(at(d, 14)), `day ${d}`).toContain('r-store')
  })
})

describe('day 1: the flat teaches the hotspots', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function enterFlat() {
    const store = useGameStore()
    store.state.day = 1
    store.state.hour = 13
    skipEvents(store, 1)
    store.screen = 'hub'
    store.startAction('1-24')
    finishScene(store)
    return store
  }

  it('the calendar gives the Friday memory (T03) if you never worked it out, and nothing twice', () => {
    const store = enterFlat()
    store.inspect('lh_laptop'); finishScene(store)
    expect(store.state.testimony).toContain('T03')
    expect(store.state.testimony.filter(t => t === 'T03')).toHaveLength(1)
  })

  it('the 21:08 message: she never writes without “亲爱的” — you notice it yourself', () => {
    const store = enterFlat()
    store.inspect('lh_phone'); finishScene(store)
    expect(store.state.flags.noticed_no_dear).toBe(true)
    expect(store.state.backlog.map(l => l.text).join('\n')).toContain('亲爱的')
  })

  it('it is a safe place: no budget, no danger, no evidence handed over', () => {
    const store = enterFlat()
    const room = data.rooms.find(r => r.id === 'lyc_home')!
    expect(room.budget).toBeUndefined()
    for (const h of room.hotspots) { store.inspect(h.id); finishScene(store) }
    expect(store.state.danger).toBe(0)
    expect(store.state.evidence).toEqual([])
    expect(store.looksLeft).toBeNull()
  })

  it('the store is atmosphere and a few hints, never evidence', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.day = 1
    store.state.hour = 14
    skipEvents(store, 1)
    store.screen = 'hub'
    store.startAction('r-store')
    finishScene(store)
    const room = data.rooms.find(r => r.id === 'convenience')!
    for (const h of room.hotspots) { store.inspect(h.id); finishScene(store) }
    expect(store.state.evidence).toEqual([])
    expect(store.state.testimony).toEqual([])
  })
})
