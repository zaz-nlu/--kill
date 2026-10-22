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

  it('offers five of the ten afternoon actions, and the full ten can all be done over the afternoon', () => {
    const store = atHub()
    expect(store.state.hour).toBe(13)
    expect(store.actions.length).toBe(5)
    const pool = availableActions(store.state, data.actions).map(a => a.id)
    expect(pool).toEqual(expect.arrayContaining(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10']))
    expect(pool).not.toContain('1-11')
    expect(pool).not.toContain('1-12')
  })

  it('has seven action hours (13–17, 19, 20); 18 is dinner, with only meal things to do', () => {
    const s = createInitialState()
    const at = (h: number) => { s.hour = h; return availableActions(s, data.actions) }
    for (const h of [13, 14, 15, 16, 17, 19, 20]) expect(at(h).length, `hour ${h}`).toBeGreaterThan(0)
    expect(at(12)).toEqual([])
    expect(at(21)).toEqual([])
    expect(at(18).length).toBeGreaterThan(0)
    expect(at(18).every(a => a.meal)).toBe(true)
  })

  it('the evening: the coffee only at 19, the stairs at 19 or 20, and plenty besides', () => {
    const s = createInitialState()
    s.hour = 19
    const ids19 = availableActions(s, data.actions).map(a => a.id)
    expect(ids19).toEqual(expect.arrayContaining(['1-11', '1-12']))
    expect(ids19.length).toBeGreaterThanOrEqual(8)
    s.hour = 20
    const ids20 = availableActions(s, data.actions).map(a => a.id)
    expect(ids20).toContain('1-12')
    expect(ids20).not.toContain('1-11')
    expect(ids20.length).toBeGreaterThanOrEqual(8)
  })

  it('the shop opens at 18 on day 1, and there are meal things to do too', () => {
    const store = atHub()
    store.state.hour = 17
    store.state.flags['event:day1_wechat'] = true
    store.waitAnHour()
    expect(store.canShop).toBe(true)
    expect(store.actions.length).toBeGreaterThan(0)
    expect(store.actions.every(a => a.meal)).toBe(true)
  })

  it('every day 1 action plays to its end with the first option', () => {
    for (const a of data.actions.filter(x => x.days.includes(1) && x.scene)) {
      const s = afterMorning()
      expect(() => play(s, a.scene!, new Array(40).fill(0)), a.id).not.toThrow()
    }
  })
})

describe('day 1 actions', () => {
  it('1-2 the monitor room: the log always, the elevator and the car only if asked, and a little danger', () => {
    const all = afterMorning()
    play(all, 'act_1_2', [0, 0, 0])   // the last 0 is "nothing else to ask"
    expect(all.evidence).toEqual(expect.arrayContaining(['E05', 'E06', 'E37']))
    expect(all.danger).toBe(5)
    const none = afterMorning()
    play(none, 'act_1_2', [1, 1, 0])
    expect(none.evidence).toContain('E05')
    expect(none.evidence).not.toContain('E06')
    expect(none.evidence).not.toContain('E37')
  })

  it('1-4 texting Mengyao: kindness gets the first-reaction testimony, accusation loses her', () => {
    const kind = afterMorning()
    play(kind, 'act_1_4', [0, 0])
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
    play(good, 'act_1_10', [0, 0])
    expect(good.trust).toBe(30)
    const bad = afterMorning()
    play(bad, 'act_1_10', [1])
    expect(bad.trust).toBe(5)
  })

  it('1-12 the stairs: the magnet is free, crouching finds the card at the price of more danger (each rest on the way costs 3)', () => {
    const climb = (state: GameState, look: boolean): number => {
      const runner = new SceneRunner(state, data.scenes)
      runner.start('act_1_12')
      let rests = 0
      let guard = 0
      while (runner.current()) {
        if (guard++ > 300) throw new Error('runaway')
        const node = runner.current()!
        if (node.type !== 'choice') { runner.advance(); continue }
        const texts = node.options.map(o => o.text)
        const ups = texts.map((x, i) => (x.startsWith('上到') ? i : -1)).filter(i => i >= 0)
        if (ups.length) runner.advance(ups[ups.length - 1])           // as far as the legs allow
        else if (texts.some(x => x.startsWith('在平台'))) { rests++; runner.advance(texts.findIndex(x => x.startsWith('在平台'))) }
        else runner.advance(look ? 0 : 1)                             // at the top: crouch down, or leave
      }
      return rests
    }
    const quick = afterMorning()
    const r1 = climb(quick, false)
    expect(quick.evidence).toContain('E10')
    expect(quick.evidence).not.toContain('E32')
    expect(quick.danger).toBe(10 + 3 * r1)
    const look = afterMorning()
    const r2 = climb(look, true)
    expect(look.evidence).toEqual(expect.arrayContaining(['E10', 'E32']))
    expect(look.danger).toBe(15 + 3 * r2)
    expect(r1).toBeGreaterThanOrEqual(1)   // seven landings cannot be climbed on four breaths
  })
})
