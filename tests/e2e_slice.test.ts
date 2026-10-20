import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'

// Drives the store exactly the way the UI does, from the title screen to the end of the slice.
describe('the whole slice, title to end', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function runScene(store: ReturnType<typeof useGameStore>, pick: (optionCount: number) => number) {
    let guard = 0
    while (store.currentNode) {
      if (guard++ > 1000) throw new Error('runaway')
      const n = store.currentNode
      if (n.type === 'choice') store.advance(pick(n.options.length))
      else store.advance()
    }
  }

  // Day 1: morning questioning (first option), then jump the clock to the evening coffee shop.
  function dayOne(store: ReturnType<typeof useGameStore>, press: boolean, tellAll: boolean) {
    store.newGame()
    runScene(store, () => 0)                      // prologue + morning questioning
    expect(store.screen).toBe('hub')
    expect(store.state.day).toBe(1)
    expect(store.state.hour).toBe(13)
    store.startAction('1-1')                      // 13 -> 14: the 14:30 WeChat arrives
    runScene(store, () => 0)
    expect(store.screen).toBe('hub')
    store.state.hour = 18
    store.waitAnHour()                            // 19:00
    store.startAction('1-11')
    const picks = [press ? 0 : 1, tellAll ? 0 : 1]
    runScene(store, () => picks.shift() ?? 0)
    store.restAtHome()                            // day 2 morning events
    runScene(store, () => 0)
    store.state.hour = 11
    store.waitAnHour()                            // lunch
    runScene(store, o => (o > 1 ? 0 : tellAll ? 0 : 1))
    expect(store.screen).toBe('hub')
    expect(store.state.day).toBe(2)
    expect(store.state.hour).toBe(12)
  }

  it('can be played start to finish, including shop, gift, save, load and the finale', () => {
    const store = useGameStore()
    dayOne(store, true, false)

    // 12:00: shop, buy the cigarettes Lu Cheng likes, then give them during his scene
    store.goShop()
    expect(store.buy('hongtashan')).toEqual({ ok: true })
    store.leaveShop()
    store.waitAnHour()
    store.startAction('2-6', 'hongtashan')
    runScene(store, () => 0)
    expect(store.state.affinity.lucheng).toBe(65)

    store.startAction('2-9')
    runScene(store, () => 0)
    expect(store.state.testimony).toContain('T32')

    // save, wreck the state, load it back
    expect(store.saveGame()).toBe(true)
    store.state.money = 0
    store.loadGame()
    expect(store.state.money).toBe(150 - 22)
    expect(store.screen).toBe('hub')

    store.restAtHome()
    expect(store.screen).toBe('end')
    expect(store.canJumpToFinale).toBe(true)

    // finale act 1
    store.jumpToFinale()
    runScene(store, () => 0)
    expect(store.screen).toBe('exam')
    store.examGoto(1)
    for (const step of ['E06', 'PRESS', 'E13', 'E15', 'T06']) {
      const r = step === 'PRESS' ? store.examPress() : store.examPresent(step)
      expect(r.outcome).toBe('correct')
    }
    store.examGoto(3)
    store.examPresent('E14')
    store.examPresent('E03')
    store.examPress()
    expect(store.screen).toBe('scene')
    runScene(store, () => 0)
    expect(store.screen).toBe('end')
    expect(store.examFailed).toBe(false)
    expect(store.state.backlog.at(-1)?.text).toContain('切片到此结束')
  })

  it('the leaky route also reaches the end of the slice', () => {
    const store = useGameStore()
    dayOne(store, false, true)
    expect(store.state.intel.phone).toBe('leaked')
    expect(store.state.backlog.some(l => l.tag === 'T26')).toBe(false)
    store.restAtHome()
    store.jumpToFinale()
    runScene(store, () => 0)
    expect(store.screen).toBe('exam')
  })
})
