import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { availableActions, menuFor } from '../src/engine/calendar'
import { evalCondition } from '../src/engine/script'
import { skipEvents } from './helpers'
import type { GameState } from '../src/engine/types'

const data = loadData()
type Store = ReturnType<typeof useGameStore>

function finishScene(store: Store) {
  let guard = 0
  while (store.screen === 'scene') {
    if (guard++ > 200) throw new Error('scene never ended')
    store.advance(store.currentNode?.type === 'choice' ? 0 : undefined)
  }
}

// Opens the action's room with the given state, and plays the way in.
function enter(actionId: string, day: number, hour: number, setup: (s: GameState) => void = () => {}): Store {
  const store = useGameStore()
  store.state.day = day
  store.state.hour = hour
  skipEvents(store, day)
  setup(store.state)
  store.screen = 'hub'
  store.startAction(actionId)
  finishScene(store) // the intro
  return store
}

function look(store: Store, hotspot: string) {
  store.inspect(hotspot)
  finishScene(store)
}

const at = (day: number, hour: number, setup: (s: GameState) => void = () => {}): GameState => {
  const s = createInitialState()
  s.day = day
  s.hour = hour
  setup(s)
  return s
}
const offered = (s: GameState) => availableActions(s, data.actions).map(a => a.id)

describe('the investigation rooms: the data', () => {
  const ids = ['hr_night', 'hr_outer', 'server_room', 'security', 'outsource', 'boss_office', 'vp_office', 'parking', 'pantry', 'smoking', 'lobby']

  it('all eleven rooms exist, each with a way in and something to look at', () => {
    for (const id of ids) {
      const r = data.rooms.find(x => x.id === id)
      expect(r, id).toBeDefined()
      expect(r!.hotspots.length, id).toBeGreaterThanOrEqual(3)
      expect(r!.intro && data.scenes[r!.intro], `${id} intro`).toBeDefined()
      if (r!.cutoff) expect(data.scenes[r!.cutoff], `${id} cutoff`).toBeDefined()
      expect(data.actions.some(a => a.room === id), `${id} action`).toBe(true)
    }
  })

  it('a sneaked search never lets you see everything: the budget is smaller than the room', () => {
    for (const id of ['hr_night', 'hr_outer', 'server_room', 'security', 'outsource', 'boss_office', 'vp_office', 'parking']) {
      const r = data.rooms.find(x => x.id === id)!
      expect(r.budget, id).toBeDefined()
      expect(r.budget!, id).toBeLessThan(r.hotspots.length)
      expect(r.cutoff, id).toBeDefined()
    }
  })

  it('the night searches are dangerous, in the right way', () => {
    expect(data.actions.find(a => a.id === 'r-hr-night')).toMatchObject({ risk: 'high', attack: 'attack_office_night', minHour: 19 })
    expect(data.actions.find(a => a.id === 'r-hr-outer')).toMatchObject({ risk: 'high', attack: 'attack_office_night', minHour: 19 })
    expect(data.actions.find(a => a.id === 'r-parking')).toMatchObject({ risk: 'high', attack: 'attack_parking', minHour: 19 })
  })
})

describe('when each room can be entered', () => {
  it('the sticky notes: only at night on days 3 and 4, and not if you already have them', () => {
    expect(offered(at(3, 19))).toContain('r-hr-night')
    expect(offered(at(4, 20))).toContain('r-hr-night')
    expect(offered(at(3, 15))).not.toContain('r-hr-night')
    expect(offered(at(2, 19))).not.toContain('r-hr-night')
    expect(offered(at(3, 19, s => s.evidence.push('E36')))).not.toContain('r-hr-night')
  })

  it("the machine room: in the afternoon, once you know the phone is missing, and not once you hold the router log", () => {
    expect(offered(at(3, 14))).not.toContain('r-server')
    expect(offered(at(3, 14, s => s.evidence.push('E07')))).toContain('r-server')
    expect(offered(at(3, 19, s => s.evidence.push('E07')))).not.toContain('r-server')
    expect(offered(at(3, 14, s => s.evidence.push('E07', 'E14')))).not.toContain('r-server')
  })

  it('the offices of the boss, the vice president and the outsourcing area open in the afternoon only', () => {
    for (const id of ['r-boss', 'r-vp', 'r-outsource']) {
      expect(offered(at(3, 14)), id).toContain(id)
      expect(offered(at(3, 19)), id).not.toContain(id)
    }
  })

  it('the five rooms that replaced the old hand-outs are always on the menu until you hold what they hold', () => {
    const menu = (s: GameState) => menuFor(s, availableActions(s, data.actions)).map(a => a.id)
    expect(menu(at(3, 19))).toEqual(expect.arrayContaining(['r-hr-night', 'r-hr-outer', 'r-security']))
    expect(menu(at(3, 14, s => s.evidence.push('E07')))).toEqual(expect.arrayContaining(['r-server', 'r-outsource']))
    expect(menu(at(3, 19, s => s.evidence.push('E36')))).not.toContain('r-hr-night')
    expect(menu(at(4, 19))).toEqual(expect.arrayContaining(['r-hr-night', 'r-hr-outer', 'r-security']))
    for (const h of [13, 14, 15, 16, 17, 19, 20]) expect(menu(at(3, h)).length, `hour ${h}`).toBeLessThanOrEqual(5)
  })

  it('looking around the lobby, pantry and smoking corner is always possible by day', () => {
    expect(offered(at(1, 14))).toContain('r-lobby')
    for (const id of ['r-pantry', 'r-smoking', 'r-lobby']) expect(offered(at(3, 10)), id).toContain(id)
  })
})

describe('finding the clues yourself', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('E36: the sticky notes on her laptop, at night, when the police are gone', () => {
    const store = enter('r-hr-night', 3, 19)
    look(store, 'hn_notes')
    expect(store.state.evidence).toContain('E36')
    expect(store.state.danger).toBeGreaterThanOrEqual(10)
  })

  it('the search is cut short: four other looks, and the notes are missed this time, at the price of the hour', () => {
    const store = enter('r-hr-night', 3, 19)
    for (const h of ['hn_shelf', 'hn_papers', 'hn_drawer', 'hn_cabinet']) look(store, h)
    expect(store.screen).toBe('hub')
    expect(store.state.evidence).not.toContain('E36')
    expect(store.state.hour).toBe(20)
    expect(offered(store.state)).toContain('r-hr-night')   // it stays on offer until the notes are found
  })

  it('a second try only has the places you have not looked at, and finding the notes ends the search for good', () => {
    const store = enter('r-hr-night', 3, 19)
    for (const h of ['hn_shelf', 'hn_papers', 'hn_drawer', 'hn_cabinet']) look(store, h)
    store.startAction('r-hr-night')
    finishScene(store)
    expect(store.looksLeft).toBe(4)
    store.inspect('hn_shelf')                               // already looked at: no look is spent
    expect(store.looksLeft).toBe(4)
    look(store, 'hn_notes')
    expect(store.state.evidence).toContain('E36')
    store.leaveRoom()
    expect(offered(store.state)).not.toContain('r-hr-night')
  })

  it('the night searches run until 21:00, after the lights go out', () => {
    for (const id of ['r-hr-night', 'r-hr-outer', 'r-security', 'r-parking']) {
      expect(offered(at(3, 21)), id).toContain(id)
      expect(offered(at(3, 22)), id).not.toContain(id)
    }
  })

  it("E42: Meng Yao's crumpled loss report; the register on paper gives E18 only if you lack it", () => {
    const store = enter('r-hr-outer', 3, 19)
    look(store, 'ho_trash')
    look(store, 'ho_drawer')
    expect(store.state.evidence).toEqual(expect.arrayContaining(['E42', 'E18']))
    const again = useGameStore()
    expect(again.state.flags.knows_card_story).toBe(true)
  })

  it('the access box tells you whom to ask if you have not read it yet', () => {
    const store = enter('r-hr-outer', 3, 19)
    look(store, 'ho_box')
    expect(store.state.backlog.map(l => l.text).join('\n')).toContain('找懂行的人')
  })

  it('E14 from the router, E12 from his screen (unless it has been wiped), E28 from the gloves (with E27)', () => {
    const store = enter('r-server', 3, 14, s => s.evidence.push('E07', 'E27'))
    look(store, 'sr_router')
    look(store, 'sr_pc')
    look(store, 'sr_gloves')
    expect(store.state.evidence).toEqual(expect.arrayContaining(['E14', 'E12', 'E28']))
  })

  it('after noon on day 3 the draft log is gone from his screen', () => {
    const store = enter('r-server', 3, 14, s => { s.evidence.push('E07'); s.flags.e12_lost = true })
    look(store, 'sr_pc')
    expect(store.state.evidence).not.toContain('E12')
  })

  it('the gloves mean nothing before you know about the fibres', () => {
    const store = enter('r-server', 3, 14, s => s.evidence.push('E07'))
    look(store, 'sr_gloves')
    expect(store.state.evidence).not.toContain('E28')
  })

  it('E15 and E37/E41 from the guard room; E16 only with the key, and the key has to be found first', () => {
    const store = enter('r-security', 3, 19)
    look(store, 'sc_panel')                 // locked
    expect(store.state.evidence).not.toContain('E16')
    look(store, 'sc_pc')
    look(store, 'sc_book')
    look(store, 'sc_keys')
    expect(store.state.evidence).toEqual(expect.arrayContaining(['E15', 'E41', 'E37']))
    expect(store.state.flags.sec_key).toBe(true)
  })

  it('with the key, a later visit to the panel gives E16', () => {
    const store = enter('r-security', 3, 19, s => { s.flags.sec_key = true })
    look(store, 'sc_panel')
    expect(store.state.evidence).toContain('E16')
  })

  it('E33 from the board, E28 from the box (with E27)', () => {
    const store = enter('r-outsource', 3, 14, s => s.evidence.push('E27'))
    look(store, 'os_board')
    look(store, 'os_gloves')
    expect(store.state.evidence).toEqual(expect.arrayContaining(['E33', 'E28']))
  })

  it('the boss, the vice president and the car park each have one thing to find', () => {
    const boss = enter('r-boss', 3, 14)
    look(boss, 'bo_desk')
    expect(boss.state.evidence).toContain('E43')

    setActivePinia(createPinia())
    const vp = enter('r-vp', 3, 14)
    look(vp, 'vo_shred')
    expect(vp.state.evidence).toContain('E44')

    setActivePinia(createPinia())
    const car = enter('r-parking', 3, 19)
    look(car, 'pk_gate')
    expect(car.state.evidence).toContain('E37')
  })

  it('nothing in the pantry, the smoking corner or the lobby is handed over as evidence', () => {
    for (const [action, spots] of [['r-pantry', ['pa_fridge', 'pa_trash']], ['r-smoking', ['sm_ash', 'sm_lighter']], ['r-lobby', ['lb_book', 'lb_cam']]] as const) {
      setActivePinia(createPinia())
      const store = enter(action, 3, 10)
      const before = store.state.evidence.length
      for (const h of spots) look(store, h)
      expect(store.state.evidence.length, action).toBe(before)
    }
  })

  it('a hotspot you already looked at gives no second reward', () => {
    const store = enter('r-vp', 3, 14)
    look(store, 'vo_shred')
    const danger = store.state.danger
    store.inspect('vo_shred')
    expect(store.state.danger).toBe(danger)
  })
})

describe('the new routes feed the old story', () => {
  const state = (day: number, setup: (s: GameState) => void) => at(day, 14, setup)

  it("3-5 no longer needs Su Wen's log: her own loss report is enough", () => {
    expect(offered(state(3, () => {}))).not.toContain('3-5')
    expect(offered(state(3, s => s.evidence.push('E42')))).toContain('3-5')
    expect(offered(state(3, s => s.evidence.push('E17')))).toContain('3-5')
  })

  it('caught in the lie she gives you a day even at lukewarm trust, but not at cold', () => {
    const warm = enter('3-5', 3, 14, s => { s.evidence.push('E42'); s.affinity.mengyao = 45 })
    expect(warm.state.backlog.map(l => l.text).join('\n')).toContain('给我一天时间')
    setActivePinia(createPinia())
    const cold = enter('3-5', 3, 14, s => { s.evidence.push('E42'); s.affinity.mengyao = 30 })
    expect(cold.state.backlog.map(l => l.text).join('\n')).not.toContain('给我一天时间')
    expect(cold.state.affinity.mengyao).toBe(20)
  })

  it('the tea-house invitation on day 4 can come from the loss report too', () => {
    const news = data.scenes.day4_news
    expect(news).toBeDefined()
    const inv = JSON.stringify(news)
    expect(inv).toContain('"E42"')
    const s4 = data.actions.find(a => a.id === '4-1')!
    const base = at(4, 12, s => { s.flags.mengyao_teahouse = true; s.affinity.mengyao = 45 })
    expect(evalCondition(base, s4.requires!)).toBe(false)
    base.evidence.push('E42')
    expect(evalCondition(base, s4.requires!)).toBe(true)
  })

  it('the draft agreement (E43) is a card against the boss in the finale', () => {
    const exam = data.exams.finale_boss_b
    const accepted = exam.statements.flatMap(st => st.steps).flatMap(step => (step.kind === 'present' ? step.accepts : []))
    expect(accepted).toContain('E43')
  })

  it('every new piece of evidence is described', () => {
    for (const id of ['E42', 'E43', 'E44']) {
      const e = data.evidence.find(x => x.id === id)
      expect(e, id).toBeDefined()
      expect(e!.desc.length, id).toBeGreaterThan(20)
    }
  })
})

describe('searching a room', () => {
  it('whoever spoke in the intro (or in a hotspot scene) is not left standing in front of the room', () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const store = enter('r-outsource', 3, 14)
    expect(store.stage.left).toBeNull()
    expect(store.stage.right).toBeNull()
    store.inspect('os_board'); finishScene(store)
    expect(store.stage.left).toBeNull()
    expect(store.stage.right).toBeNull()
  })
})
