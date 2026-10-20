import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { addLog, presentableIds } from '../src/engine/log'
import { learnIntel } from '../src/engine/flow'
import { loadSave, serializeState } from '../src/engine/save'
import { useGameStore } from '../src/engine/store'
import TitleScreen from '../src/ui/TitleScreen.vue'
import HubScreen from '../src/ui/HubScreen.vue'
import EndScreen from '../src/ui/EndScreen.vue'

function richState() {
  const s = createInitialState()
  s.day = 2
  s.hour = 14
  s.money = 88
  s.evidence.push('E06', 'E13')
  s.testimony.push('T02')
  s.flags.challengeAllCorrect = true
  learnIntel(s, 'phone')
  addLog(s, { speaker: 'limo', text: '手机别是已经沉海河了吧', tag: 'T26' })
  s.notes.push('L1')
  s.inventory.hongtashan = 2
  s.giftsGiven.lucheng = ['jianbing']
  s.giftedToday.push('lucheng')
  return s
}

describe('save / load', () => {
  it('round-trips a populated state exactly', () => {
    const s = richState()
    const r = loadSave(serializeState(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state).toEqual(s)
  })

  it('reports an empty slot, garbage, and an unknown version without throwing', () => {
    expect(loadSave(null)).toEqual({ ok: false, reason: 'empty' })
    expect(loadSave('not json')).toEqual({ ok: false, reason: 'corrupt' })
    expect(loadSave('{}')).toEqual({ ok: false, reason: 'corrupt' })
    expect(loadSave('null')).toEqual({ ok: false, reason: 'corrupt' })
    expect(loadSave('[]')).toEqual({ ok: false, reason: 'corrupt' })
    expect(loadSave('123')).toEqual({ ok: false, reason: 'corrupt' })
    const wrapped = JSON.parse(serializeState(createInitialState()))
    wrapped.version = 2
    expect(loadSave(JSON.stringify(wrapped))).toEqual({ ok: false, reason: 'version' })
  })

  it('rejects hand-edited or damaged fields', () => {
    const base = () => JSON.parse(serializeState(richState()))
    const cases: Array<(w: any) => void> = [
      w => { w.state.money = '150' },
      w => { w.state.money = null },
      w => { delete w.state.affinity.limo },
      w => { w.state.affinity.limo = 'high' },
      w => { w.state.intel.phone = 'maybe' },
      w => { w.state.evidence = 'E06' },
      w => { w.state.evidence = [1, 2] },
      w => { w.state.backlog = [{ text: 'no speaker' }] },
      w => { w.state.inventory = { redbull: 'two' } },
      w => { w.state.giftsGiven = { lucheng: 'jianbing' } },
      w => { delete w.state },
    ]
    for (const mutate of cases) {
      const w = base()
      mutate(w)
      expect(loadSave(JSON.stringify(w))).toEqual({ ok: false, reason: 'corrupt' })
    }
  })
})

describe('store: save, load and the debug jump', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('saveGame then loadGame brings the state back and lands on the hub', () => {
    const store = useGameStore()
    store.state.money = 33
    store.state.evidence.push('E06')
    store.state.hour = 13
    store.state.flags['event:day1_morning'] = true
    expect(store.saveGame()).toBe(true)
    store.state.money = 150
    store.state.evidence.splice(0)
    store.loadGame()
    expect(store.state.money).toBe(33)
    expect(store.state.evidence).toEqual(['E06'])
    expect(store.screen).toBe('hub')
    expect(store.loadError).toBe('')
  })

  it('a corrupt save keeps you on the title with a message, never a crash', () => {
    localStorage.setItem('jiudian-save', '{"version":1,"state":{"money":"lots"}}')
    const store = useGameStore()
    store.loadGame()
    expect(store.screen).toBe('title')
    expect(store.loadError).toContain('存档无法读取')
  })

  it('an empty slot says there is no save', () => {
    const store = useGameStore()
    store.loadGame()
    expect(store.screen).toBe('title')
    expect(store.loadError).toBe('没有存档')
    expect(store.hasSave).toBe(false)
  })

  it('jumpToFinale plays the intro and then starts the exam, with T06 presentable', () => {
    const store = useGameStore()
    store.jumpToFinale()
    expect(store.screen).toBe('scene')
    expect(store.state.evidence).toContain('E14')
    expect(presentableIds(store.state)).toContain('T06')
    let guard = 0
    while (store.currentNode) {
      if (guard++ > 100) throw new Error('runaway')
      store.advance()
    }
    expect(store.exam).not.toBeNull()
    expect(store.screen).toBe('exam')
  })

  it('after resting on day 2 the finale can be entered from the end screen', () => {
    const store = useGameStore()
    store.state.day = 2
    store.restAtHome()
    expect(store.screen).toBe('end')
    expect(store.canJumpToFinale).toBe(true)
    store.jumpToFinale()
    expect(store.screen).toBe('scene')
  })
})

describe('UI wiring', () => {
  it('title: start comes first, plus continue and the dev jump', async () => {
    const w = mount(TitleScreen, { props: { error: '没有存档' } })
    expect(w.findAll('button')[0].attributes('data-testid')).toBe('start')
    expect(w.text()).toContain('没有存档')
    await w.find('[data-testid="continue"]').trigger('click')
    await w.find('[data-testid="debug-finale"]').trigger('click')
    expect(w.emitted('continue')?.length).toBe(1)
    expect(w.emitted('debugFinale')?.length).toBe(1)
  })

  it('hub: a save button', async () => {
    const w = mount(HubScreen, { props: { actions: [], canShop: false, inventory: {}, items: [] } })
    await w.find('[data-testid="save"]').trigger('click')
    expect(w.emitted('save')?.length).toBe(1)
  })

  it('end: offers the finale only when allowed', async () => {
    const yes = mount(EndScreen, { props: { failed: false, canFinale: true } })
    await yes.find('[data-testid="to-finale"]').trigger('click')
    expect(yes.emitted('finale')?.length).toBe(1)
    const no = mount(EndScreen, { props: { failed: false, canFinale: false } })
    expect(no.find('[data-testid="to-finale"]').exists()).toBe(false)
  })
})
