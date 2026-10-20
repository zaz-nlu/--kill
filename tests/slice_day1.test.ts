import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import type { GameState } from '../src/engine/types'
import { playOut } from './helpers'

const data = loadData()

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
    } else runner.advance()
  }
}

// A player who has just walked out of the questioning room.
function afterMorning(choice = 0): GameState {
  const s = createInitialState()
  play(s, 'day1_morning', [choice])
  return s
}

describe('day 1 morning: the questioning', () => {
  it('hands over the police file, tells the player about the missing phone and the draft, and ends at 13:00', () => {
    const s = afterMorning()
    for (const id of ['E01', 'E02', 'E03', 'E04', 'E07', 'E30', 'E38']) expect(s.evidence, id).toContain(id)
    expect(s.intel).toMatchObject({ phone: 'clean', draft: 'clean', trophy: 'unknown' })
    expect(s.hour).toBe(13)
  })

  it('quiet or truthful answers cost no trust; blaming Mengyao costs 15', () => {
    expect(afterMorning(0).trust).toBe(20)
    expect(afterMorning(2).trust).toBe(20)
    expect(afterMorning(1).trust).toBe(5)
  })
})

describe('day 1 flow', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function atHub() {
    const store = useGameStore()
    store.newGame()
    playOut(store)
    return store
  }

  it('starts with the ten afternoon actions', () => {
    const store = atHub()
    expect(store.state.hour).toBe(13)
    const ids = store.actions.map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10']))
    expect(ids).not.toContain('1-11')
    expect(ids).not.toContain('1-12')
  })

  it('has exactly seven action hours: 13–17, then 19 and 20; 18 is dinner with the shop', () => {
    const s = createInitialState()
    const open = (h: number) => { s.hour = h; return availableActions(s, data.actions).length > 0 }
    for (const h of [13, 14, 15, 16, 17, 19, 20]) expect(open(h), `hour ${h}`).toBe(true)
    for (const h of [12, 18, 21]) expect(open(h), `hour ${h}`).toBe(false)
  })

  it('the evening: coffee only at 19, the stairs at 19 or 20', () => {
    const s = createInitialState()
    s.hour = 19
    expect(availableActions(s, data.actions).map(a => a.id).sort()).toEqual(['1-11', '1-12'])
    s.hour = 20
    expect(availableActions(s, data.actions).map(a => a.id)).toEqual(['1-12'])
  })

  it('the shop opens at 18 on day 1', () => {
    const store = atHub()
    store.state.hour = 17
    store.state.flags['event:day1_wechat'] = true
    store.waitAnHour()
    expect(store.canShop).toBe(true)
    expect(store.actions).toEqual([])
  })

  it('every day 1 action plays to its end with the first option', () => {
    for (const a of data.actions.filter(x => x.days.includes(1))) {
      const s = afterMorning()
      expect(() => play(s, a.scene!, [0, 0, 0, 0]), a.id).not.toThrow()
    }
  })
})

describe('day 1 actions', () => {
  it('1-2 the monitor room: the log always, the elevator and the car only if asked, and a little danger', () => {
    const all = afterMorning()
    play(all, 'act_1_2', [0, 0])
    expect(all.evidence).toEqual(expect.arrayContaining(['E05', 'E06', 'E37']))
    expect(all.danger).toBe(5)
    const none = afterMorning()
    play(none, 'act_1_2', [1, 1])
    expect(none.evidence).toContain('E05')
    expect(none.evidence).not.toContain('E06')
    expect(none.evidence).not.toContain('E37')
  })

  it('1-4 texting Mengyao: kindness gets the first-reaction testimony, accusation loses her', () => {
    const kind = afterMorning()
    play(kind, 'act_1_4', [0])
    expect(kind.testimony).toContain('T04')
    expect(kind.affinity.mengyao).toBe(55)
    const rude = afterMorning()
    play(rude, 'act_1_4', [1])
    expect(rude.testimony).not.toContain('T04')
    expect(rude.affinity.mengyao).toBe(40)
  })

  it('1-5 the news shows the police statement left out the head wound', () => {
    const s = afterMorning()
    play(s, 'act_1_5')
    expect(s.evidence).toContain('E08')
  })

  it('1-6 the long post costs trust and goodwill, and leaks the phone and the draft', () => {
    const s = afterMorning()
    play(s, 'act_1_6')
    expect(s.trust).toBe(15)
    expect(s.affinity.limo).toBe(65)
    expect(s.affinity.boss).toBe(20)
    expect(s.intel).toMatchObject({ phone: 'leaked', draft: 'leaked' })
  })

  it('1-9 calling Lu Cheng needs his goodwill: the long post closes that door', () => {
    const s = afterMorning()
    s.hour = 13
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('1-9')
    play(s, 'act_1_6')
    expect(availableActions(s, data.actions).map(a => a.id)).not.toContain('1-9')
  })

  it('1-10 at the police station: the umbrella earns trust once, blaming loses it', () => {
    const good = afterMorning()
    play(good, 'act_1_10', [0])
    expect(good.trust).toBe(30)
    const bad = afterMorning()
    play(bad, 'act_1_10', [1])
    expect(bad.trust).toBe(5)
  })

  it('1-12 the stairs: the magnet is free, crouching finds the card at the price of more danger', () => {
    const quick = afterMorning()
    play(quick, 'act_1_12', [1])
    expect(quick.evidence).toContain('E10')
    expect(quick.evidence).not.toContain('E32')
    expect(quick.danger).toBe(10)
    const look = afterMorning()
    play(look, 'act_1_12', [0])
    expect(look.evidence).toEqual(expect.arrayContaining(['E10', 'E32']))
    expect(look.danger).toBe(15)
  })
})
