import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { SceneRunner } from '../src/engine/script'
import { useGameStore } from '../src/engine/store'
import { logLines } from '../src/engine/log'
import EvidencePopup from '../src/ui/EvidencePopup.vue'
import { playOut } from './helpers'

describe("the 'show' node", () => {
  it('calls the hook and does not stop the scene', () => {
    const seen: string[] = []
    const r = new SceneRunner(
      createInitialState(),
      { a: [{ type: 'show', id: 'E07' }, { type: 'say', speaker: 'lyc', text: 'hi' }] },
      { onShow: id => seen.push(id) },
    )
    r.start('a')
    expect(seen).toEqual(['E07'])
    expect(r.current()).toMatchObject({ text: 'hi' })
  })

  it('works without hooks', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'show', id: 'E07' }, { type: 'say', speaker: 'lyc', text: 'x' }] })
    r.start('a')
    expect(r.current()).toMatchObject({ text: 'x' })
  })
})

describe('store: evidence appears in the middle of the screen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function start(store: ReturnType<typeof useGameStore>, id: string) {
    store.screen = 'scene'
    store.playScene(id)
  }

  it('finding evidence queues a card with its picture, name and description', () => {
    const store = useGameStore()
    start(store, 'act_1_5')
    playOut(store)
    expect(store.state.evidence).toContain('E08')
    const card = store.popup!
    expect(card).toMatchObject({ kind: 'evidence', refId: 'E08', name: '警方通报' })
    expect(card.desc).toContain('颈部受压窒息')
    expect(card.image).not.toBeNull()
  })

  it('cards come one at a time, in the order found, and dismissing shows the next', () => {
    const store = useGameStore()
    start(store, 'day1_morning')
    playOut(store)                                     // E02 E01 E03 E04 E07 E30 E38 …
    const order: string[] = []
    while (store.popup) {
      if (store.popup.kind === 'evidence') order.push(store.popup.refId)
      store.dismissPopup()
    }
    expect(order).toEqual(['E02', 'E01', 'E03', 'E04', 'E07', 'E30', 'E38'])
  })

  it('testimony gets a card too, with no picture', () => {
    const store = useGameStore()
    start(store, 'act_1_1')
    playOut(store)
    const card = store.popup!
    expect(card).toMatchObject({ kind: 'testimony', refId: 'T03' })
    expect(card.image).toBeNull()
  })

  it('what you already hold never pops up again', () => {
    const store = useGameStore()
    start(store, 'act_1_5')
    playOut(store)
    while (store.popup) store.dismissPopup()
    start(store, 'act_1_5')
    playOut(store)
    expect(store.popup).toBeNull()
  })

  it('a new game or a loaded game does not replay old finds', () => {
    const store = useGameStore()
    store.state.evidence.push('E01')
    store.newGame()
    expect(store.popup).toBeNull()
  })

  it('a show node displays a card without handing the item over', () => {
    const store = useGameStore()
    store.data.scenes.__test = [{ type: 'show', id: 'E07' }, { type: 'say', speaker: 'lyc', text: 'x' }]
    start(store, '__test')
    expect(store.popup).toMatchObject({ kind: 'show', refId: 'E07', name: '现场照片' })
    expect(store.state.evidence).not.toContain('E07')
  })

  it('presenting evidence in the exam shows it, and does nothing for plain quotes', () => {
    const store = useGameStore()
    const kit = store.data.debugKit
    store.state.evidence.push(...kit.evidence)
    logLines(store.state, kit.backlog)
    store.startExamById('finale_act1')
    store.examGoto(1)
    store.examPresent('E06')
    expect(store.popup).toMatchObject({ kind: 'present', refId: 'E06' })
    store.dismissPopup()
    store.examPresent('G1')
    expect(store.popup).toBeNull()
  })
})

describe('EvidencePopup', () => {
  const item = (kind: string, image: string | null = '/x.webp') => ({ id: 1, kind, refId: 'E07', name: '现场照片', desc: '宋砚倒在桌边。', image })

  it('shows the label, picture, name and description in the middle of the screen', () => {
    const w = mount(EvidencePopup, { props: { item: item('evidence') } })
    expect(w.text()).toContain('获得证物')
    expect(w.text()).toContain('现场照片')
    expect(w.text()).toContain('宋砚倒在桌边')
    expect(w.find('img[data-testid="popup-image"]').exists()).toBe(true)
  })

  it('words each kind differently', () => {
    expect(mount(EvidencePopup, { props: { item: item('testimony', null) } }).text()).toContain('获得证言')
    expect(mount(EvidencePopup, { props: { item: item('show') } }).text()).toContain('证物')
    expect(mount(EvidencePopup, { props: { item: item('present') } }).text()).toContain('出示')
  })

  it('has no picture for testimony', () => {
    expect(mount(EvidencePopup, { props: { item: item('testimony', null) } }).find('img').exists()).toBe(false)
  })

  it('closes on a click and on Enter', async () => {
    const w = mount(EvidencePopup, { props: { item: item('evidence') } })
    await w.find('[data-testid="evidence-popup"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(w.emitted('close')?.length).toBe(2)
    w.unmount()
  })

  it('an exam presentation closes by itself and never blocks the screen', () => {
    const w = mount(EvidencePopup, { props: { item: item('present') } })
    expect(w.find('[data-testid="evidence-popup"]').classes()).toContain('passive')
    expect(w.text()).not.toContain('点击继续')
    w.unmount()
  })
})
