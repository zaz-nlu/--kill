import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { readSlotRaw } from '../src/engine/saves'
import TitleScreen from '../src/ui/TitleScreen.vue'

type Store = ReturnType<typeof useGameStore>

function playOut(store: Store): void {
  let guard = 0
  while (store.currentNode) {
    if (guard++ > 100) throw new Error('runaway')
    store.advance()
  }
}

function startDemo(store: Store): void {
  store.startDemoExam()
  playOut(store)
}

// The route through act 1 the spec describes: the washroom lie and the 21:08 statement.
function clearAct1(store: Store): void {
  store.examGoto(1)
  store.examPresent('E06')
  store.examPress()
  store.examPresent('E13')
  store.examPresent('E15')
  store.examPresent('T06')
  store.examGoto(3)
  store.examPresent('E14')
  store.examPresent('E03')
  store.examPress()
}

describe('demo exam: title screen', () => {
  it('offers the demo and emits demoExam', async () => {
    const w = mount(TitleScreen)
    const button = w.find('[data-testid="demo-exam"]')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('试玩对峙')
    expect(button.text()).toContain('2 分钟')
    await button.trigger('click')
    expect(w.emitted('demoExam')?.length).toBe(1)
  })

  it('shows a message under the buttons when one is passed', () => {
    const w = mount(TitleScreen, { props: { message: '试玩结束。' } })
    expect(w.find('[data-testid="title-message"]').text()).toBe('试玩结束。')
    const none = mount(TitleScreen)
    expect(none.find('[data-testid="title-message"]').exists()).toBe(false)
  })
})

describe('demo exam: the store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts the intro, then act 1 with the debug kit, in demo mode', () => {
    const store = useGameStore()
    startDemo(store)
    expect(store.screen).toBe('exam')
    expect(store.exam?.def.id).toBe('finale_act1')
    expect(store.demoMode).toBe(true)
    for (const id of ['E03', 'E06', 'E12', 'E13', 'E14', 'E15']) expect(store.state.evidence).toContain(id)
    for (const id of ['T02', 'T05']) expect(store.state.testimony).toContain(id)
    expect(store.state.backlog.some(l => l.tag === 'T06')).toBe(true)
  })

  it('does nothing when it is not on the title screen', () => {
    const store = useGameStore()
    store.screen = 'hub'
    store.startDemoExam()
    expect(store.screen).toBe('hub')
    expect(store.demoMode).toBe(false)
  })

  it('running out of persuasion only restarts the act', () => {
    const store = useGameStore()
    startDemo(store)
    const def = store.data.exams.finale_act1
    const used = new Set(def.statements.flatMap(s => s.steps.flatMap(st => (st.kind === 'present' ? st.accepts : []))))
    const junk = store.data.evidence.map(e => e.id).find(id => !used.has(id))!
    store.state.evidence.push(junk)
    const persuasion = store.exam!.persuasion
    for (let i = 0; i < persuasion; i++) store.examPresent(junk)
    expect(store.screen).toBe('exam')
    expect(store.gameOver).toBeNull()
    expect(store.exam?.def.id).toBe('finale_act1')
    expect(store.exam!.persuasion).toBeGreaterThan(0)
    expect(store.demoMode).toBe(true)
  })

  it('clearing the act goes back to the title with a message and no gaps', () => {
    const store = useGameStore()
    startDemo(store)
    const gaps = store.state.examGaps
    clearAct1(store)
    expect(store.screen).toBe('title')
    expect(store.exam).toBeNull()
    expect(store.demoMode).toBe(false)
    expect(store.demoMessage).not.toBe('')
    expect(store.state.examGaps).toBe(gaps)
  })

  it('never touches an existing save', () => {
    const store = useGameStore()
    store.state.money = 33
    store.state.evidence.push('E06')
    expect(store.saveGame(1)).toBe(true)
    const manual = readSlotRaw(1)
    const auto = readSlotRaw('auto')
    startDemo(store)
    expect(store.saveGame(1)).toBe(false) // nothing may be written during the demo
    clearAct1(store)
    expect(readSlotRaw(1)).toBe(manual)
    expect(readSlotRaw('auto')).toBe(auto)
  })

  it('a new game clears the demo message', () => {
    const store = useGameStore()
    startDemo(store)
    clearAct1(store)
    expect(store.demoMessage).not.toBe('')
    store.newGame()
    expect(store.demoMessage).toBe('')
    expect(store.demoMode).toBe(false)
  })
})
