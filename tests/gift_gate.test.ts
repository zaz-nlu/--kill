import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { playOut } from './helpers'

function atDay1Hub() {
  const store = useGameStore()
  store.newGame()
  playOut(store)
  store.state.flags['event:day1_wechat'] = true
  return store
}

describe('1-2 Laowang: affinity gate and the gift tutorial', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('empty-handed he opens up anyway: a pancake turns up in the bag, is handed over, and the clue comes in the same visit', () => {
    const store = atDay1Hub()
    const hour = store.state.hour
    expect(store.state.inventory.jianbing).toBeUndefined()
    store.startAction('1-2')
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(hour + 1)
    expect(store.state.evidence).toContain('E05')
    expect(store.state.flags['done:1-2']).toBe(true)
    expect(store.state.flags['rescued:1-2']).toBe(true)
    expect(store.state.inventory.jianbing).toBeUndefined() // the one found was handed over, nothing extra
    expect(store.state.giftsGiven.laowang).toContain('jianbing')
    expect(store.state.affinity.laowang).toBeGreaterThanOrEqual(60)
    expect(store.notice).toContain('背包里恰好有一个煎饼果子')
    // the refusal never happened, so the gift mechanic is explained once, back at the hub
    expect(store.tip?.title).toBe('小提示：送礼与好感')
    expect(store.tip?.text).toContain('好感')
    expect(store.tip?.text).toContain('送礼')
    expect(store.tip?.text).toContain('超商')
    expect(store.state.backlog.map(l => l.text).join('\n')).toContain('还是你小子懂我')
  })

  it('the rescue happens only once: with the flag already set, he stays behind his refusal', () => {
    const store = atDay1Hub()
    store.state.flags['rescued:1-2'] = true
    store.startAction('1-2')
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.flags['done:1-2']).toBeUndefined()
    expect(store.state.evidence).not.toContain('E05')
    expect(store.state.giftsGiven.laowang ?? []).not.toContain('jianbing')
    expect(store.state.inventory.jianbing).toBe(1) // only the refusal's tutorial item
    expect(store.state.flags['urge:1-2']).toBe(true)
  })

  it('the tip is shown only once, but the gift button stays red until the action is done', () => {
    const store = atDay1Hub()
    store.state.affinity.laowang = 40 // even the pancake cannot lift him past the gate
    store.startAction('1-2')
    playOut(store)
    store.dismissTip()
    store.startAction('1-2')
    playOut(store)
    expect(store.tip).toBeNull()
    expect(store.state.flags['urge:1-2']).toBe(true)
    expect(store.state.inventory.jianbing).toBe(1) // not given a second one
  })

  it('with the 煎饼果子 handed over first he opens up: affinity up, the clues come, the hour is spent', () => {
    const store = atDay1Hub()
    store.state.inventory.jianbing = 1
    store.state.flags['urge:1-2'] = true // as if he had refused before, so the gift button was red
    const hour = store.state.hour
    const before = store.state.affinity.laowang
    store.startAction('1-2', 'jianbing')
    playOut(store)
    expect(store.state.affinity.laowang).toBe(before + 15)
    expect(store.state.evidence).toContain('E05')
    expect(store.state.hour).toBe(hour + 1)
    expect(store.state.flags['done:1-2']).toBe(true)
    expect(store.state.inventory.jianbing).toBeUndefined()
    expect(store.state.flags['urge:1-2']).toBe(false)
    expect(store.state.flags['rescued:1-2']).toBeUndefined()
    expect(store.state.backlog.map(l => l.text).join('\n')).toContain('还是你小子懂我')
  })

  it('when even the rescue cannot lift him (affinity 40), the old refusal plays and no extra pancake is left behind', () => {
    const store = atDay1Hub()
    const hour = store.state.hour
    store.state.affinity.laowang = 40
    store.startAction('1-2')
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(hour)
    expect(store.state.evidence).not.toContain('E05')
    expect(store.state.flags['done:1-2']).toBeUndefined()
    expect(store.state.flags['rescued:1-2']).toBeUndefined()
    expect(store.state.affinity.laowang).toBe(40) // the gift never happened
    expect(store.state.giftsGiven.laowang ?? []).not.toContain('jianbing')
    expect(store.state.inventory.jianbing).toBe(1) // just the one the refusal puts in the bag, no extra
    expect(store.tip?.title).toContain('送礼')
    expect(store.state.flags['urge:1-2']).toBe(true)
  })

  it('if the 煎饼果子 was spent elsewhere he is not given a second free one once he has had it', () => {
    const store = atDay1Hub()
    store.state.giftsGiven.laowang = ['jianbing']
    store.state.affinity.laowang = 40 // pretend it did not stick
    store.startAction('1-2')
    playOut(store)
    expect(store.state.inventory.jianbing).toBeUndefined()
  })
})
