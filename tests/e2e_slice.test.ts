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

  it('can be played start to finish, including shop, gift, save, load and the finale', () => {
    const store = useGameStore()
    store.newGame()
    // prologue: first choice 0; coffee: press (0), then stay quiet (1); lunch: cold (1)
    const picks = [0, 0, 1, 1]
    runScene(store, () => picks.shift() ?? 0)
    expect(store.screen).toBe('hub')
    expect(store.state.day).toBe(2)

    // 12:00: shop, buy the cigarettes Lu Cheng likes, then give them during his scene
    store.goShop()
    expect(store.buy('hongtashan')).toEqual({ ok: true })
    store.leaveShop()
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
    store.newGame()
    const picks = [1, 1, 0, 0] // wait-then-office, don't press, tell all, tell all at lunch
    runScene(store, () => picks.shift() ?? 0)
    expect(store.screen).toBe('hub')
    expect(store.state.intel.phone).toBe('leaked')
    expect(store.state.backlog.some(l => l.tag === 'T26')).toBe(false)
    store.restAtHome()
    store.jumpToFinale()
    runScene(store, () => 0)
    expect(store.screen).toBe('exam')
  })
})
