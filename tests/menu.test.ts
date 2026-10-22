import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { availableActions, menuFor, MENU_SIZE, slotsLeft, type ActionDef } from '../src/engine/calendar'
import { useGameStore } from '../src/engine/store'
import { loadData } from '../src/engine/data'
import { playOut } from './helpers'

const make = (id: string, kind: ActionDef['kind'], extra: Partial<ActionDef> = {}): ActionDef => ({
  id, label: id, location: 'x', days: [1], scene: 's', costHours: 1, kind, ...extra,
})

const pool: ActionDef[] = [
  make('k1', 'key'), make('k2', 'key'), make('k3', 'key'), make('k4', 'key'),
  make('a1', 'aux'), make('a2', 'aux'), make('f1', 'affinity'),
  make('u1', 'useless'), make('t1', 'trap'), make('p1', 'key', { pinned: true }),
]

describe('one menu per hour (spec 6.1: three to five options)', () => {
  it('offers at most five', () => {
    const s = createInitialState()
    s.hour = 13
    expect(menuFor(s, pool).length).toBe(MENU_SIZE)
    expect(MENU_SIZE).toBe(5)
  })

  it('shows everything when the pool is already small', () => {
    const s = createInitialState()
    expect(menuFor(s, pool.slice(0, 4))).toEqual(pool.slice(0, 4))
    expect(menuFor(s, [])).toEqual([])
  })

  it('always has a key action and a useless-or-trap action, and never drops a pinned one', () => {
    for (let day = 1; day <= 4; day++) {
      for (const hour of [9, 10, 11, 13, 14, 15, 16, 17, 19, 20]) {
        const s = createInitialState()
        s.day = day
        s.hour = hour
        const menu = menuFor(s, pool)
        expect(menu.some(a => a.kind === 'key'), `${day}/${hour} key`).toBe(true)
        expect(menu.some(a => a.kind === 'useless' || a.kind === 'trap'), `${day}/${hour} trap`).toBe(true)
        expect(menu.map(a => a.id), `${day}/${hour} pinned`).toContain('p1')
      }
    }
  })

  it('is the same every time you look at the same hour, and changes from hour to hour', () => {
    const s = createInitialState()
    s.hour = 13
    const a = menuFor(s, pool).map(x => x.id)
    expect(menuFor(s, pool).map(x => x.id)).toEqual(a)
    const seen = new Set<string>()
    for (const h of [13, 14, 15, 16, 17]) {
      s.hour = h
      seen.add(menuFor(s, pool).map(x => x.id).join())
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('keeps the order of the original list', () => {
    const s = createInitialState()
    s.hour = 14
    const ids = menuFor(s, pool).map(a => a.id)
    expect(ids).toEqual(pool.map(a => a.id).filter(id => ids.includes(id)))
  })

  it('an action that does not show up this hour is still there for the next one', () => {
    const s = createInitialState()
    const everShown = new Set<string>()
    for (const h of [13, 14, 15, 16, 17, 19, 20]) {
      s.hour = h
      for (const a of menuFor(s, pool)) everShown.add(a.id)
    }
    expect(everShown.size).toBeGreaterThanOrEqual(8)
  })
})

describe('time left today', () => {
  it('counts only the hours you can act in', () => {
    const s = createInitialState()
    s.day = 1
    s.hour = 13
    expect(slotsLeft(s)).toBe(8)      // 13 14 15 16 17 19 20 21
    s.hour = 18
    expect(slotsLeft(s)).toBe(3)
    s.hour = 20
    expect(slotsLeft(s)).toBe(2)
    s.hour = 21
    expect(slotsLeft(s)).toBe(1)
    s.hour = 22
    expect(slotsLeft(s)).toBe(0)
    s.day = 2
    s.hour = 9
    expect(slotsLeft(s)).toBe(11)     // 9 10 11 13 14 15 16 17 19 20 21
  })
})

describe('the real data', () => {
  const data = loadData()

  it('every action is classified', () => {
    for (const a of data.actions) expect(a.kind, a.id).toBeDefined()
  })

  it('the evening appointment is pinned so it can never be hidden', () => {
    expect(data.actions.find(a => a.id === '1-11')?.pinned).toBe(true)
  })

  it('day 1 afternoon: the twenty-four possible actions shrink to five', () => {
    const s = createInitialState()
    s.hour = 13
    expect(availableActions(s, data.actions).length).toBe(24)
    expect(menuFor(s, availableActions(s, data.actions)).length).toBe(5)
  })
})

describe('store: the hub shows the menu, not the pool', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('five options at 13:00 on day 1, and the hour counter', () => {
    const store = useGameStore()
    store.newGame()
    playOut(store)
    expect(store.actions.length).toBe(5)
    expect(store.slotsLeft).toBe(8)
  })

  it('doing one lets the next hour draw a fresh menu', () => {
    const store = useGameStore()
    store.newGame()
    playOut(store)
    const first = store.actions[0].id
    store.startAction(first)
    playOut(store)
    expect(store.state.hour).toBe(14)
    expect(store.actions.map(a => a.id)).not.toContain(first)
    expect(store.slotsLeft).toBe(7)
  })
})
