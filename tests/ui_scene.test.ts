import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HudBar from '../src/ui/HudBar.vue'
import DialogueBox from '../src/ui/DialogueBox.vue'
import ChoiceList from '../src/ui/ChoiceList.vue'
import BacklogPanel from '../src/ui/BacklogPanel.vue'
import TitleScreen from '../src/ui/TitleScreen.vue'
import App from '../src/App.vue'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { addLog, visibleLog } from '../src/engine/log'

describe('DialogueBox', () => {
  it('shows speaker and text, and emits advance on click', async () => {
    const w = mount(DialogueBox, { props: { speaker: '黎默', text: '吃了没。' } })
    expect(w.text()).toContain('黎默')
    expect(w.text()).toContain('吃了没。')
    await w.trigger('click')
    expect(w.emitted('advance')?.length).toBe(1)
  })

  it('hides the name plate for narration', () => {
    const w = mount(DialogueBox, { props: { speaker: '', text: '雨还在下。' } })
    expect(w.find('[data-testid="nameplate"]').exists()).toBe(false)
  })
})

describe('ChoiceList', () => {
  it('renders options and emits the chosen index', async () => {
    const w = mount(ChoiceList, { props: { options: ['全说了', '还没什么头绪', '反问'] } })
    const buttons = w.findAll('button')
    expect(buttons.length).toBe(3)
    await buttons[1].trigger('click')
    expect(w.emitted('choose')?.[0]).toEqual([1])
  })
})

describe('HudBar', () => {
  it('shows day, time and money but never the danger number', () => {
    const w = mount(HudBar, { props: { day: 2, hour: 9, money: 150, danger: 20 } })
    expect(w.text()).toContain('第 2 天')
    expect(w.text()).toContain('09:00')
    expect(w.text()).toContain('¥150')
    expect(w.find('[data-testid="heartbeat"]').exists()).toBe(false)
    expect(w.text()).not.toContain('20')
  })

  it('shows a heartbeat from danger 30 upwards, still without a number', () => {
    const w = mount(HudBar, { props: { day: 2, hour: 9, money: 150, danger: 47 } })
    expect(w.find('[data-testid="heartbeat"]').exists()).toBe(true)
    expect(w.text()).not.toContain('47')
  })
})

describe('BacklogPanel', () => {
  function lines() {
    const s = createInitialState()
    addLog(s, { speaker: 'limo', text: '手机别是已经沉海河了吧', tag: 'T26' })
    addLog(s, { speaker: 'lyc', text: '嗯。' })
    s.notes.push('L2')
    return visibleLog(s)
  }

  it('renders every line and never leaks the hidden tag or adds highlight', () => {
    const w = mount(BacklogPanel, { props: { lines: lines() } })
    expect(w.text()).toContain('手机别是已经沉海河了吧')
    const html = w.html()
    expect(html).not.toContain('T26')
    expect(html.toLowerCase()).not.toContain('tag')
    expect(html.toLowerCase()).not.toContain('highlight')
  })

  it('emits note with the line id when 记下 is pressed', async () => {
    const w = mount(BacklogPanel, { props: { lines: lines() } })
    await w.find('[data-testid="note-L1"]').trigger('click')
    expect(w.emitted('note')?.[0]).toEqual(['L1'])
  })

  it('the notes tab only shows noted lines', async () => {
    const w = mount(BacklogPanel, { props: { lines: lines() } })
    await w.find('[data-testid="tab-notes"]').trigger('click')
    expect(w.text()).toContain('嗯。')
    expect(w.text()).not.toContain('手机别是已经沉海河了吧')
  })
})

describe('TitleScreen', () => {
  it('emits start', async () => {
    const w = mount(TitleScreen)
    await w.find('button').trigger('click')
    expect(w.emitted('start')?.length).toBe(1)
  })
})

describe('game store + App', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('newGame starts the prologue and fills the log as lines are advanced', () => {
    const store = useGameStore()
    expect(store.screen).toBe('title')
    store.newGame()
    expect(store.screen).toBe('scene')
    expect(store.currentNode).not.toBeNull()
    expect(store.state.backlog[0].text).toContain('2026 年 9 月 14 日')
    store.advance()
    expect(store.state.backlog.length).toBe(2)
  })

  it('speakerName maps ids to display names and narration to nothing', () => {
    const store = useGameStore()
    expect(store.speakerName('limo')).toBe('黎默')
    expect(store.speakerName('lyc')).toBe('林一程')
    expect(store.speakerName('songyan')).toBe('宋砚')
    expect(store.speakerName('narration')).toBe('')
  })

  it('note() returns the reaction for a slip line', () => {
    const store = useGameStore()
    store.newGame()
    const slip = addLog(store.state, { speaker: 'limo', text: 'x', tag: 'T26' })
    expect(store.note(slip.id)).toEqual({ noted: true, reaction: '……？' })
  })

  it('the App shows the title first, then the prologue after clicking start', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(App, { global: { plugins: [pinia] } })
    expect(w.text()).toContain('九点熄灯')
    await w.find('[data-testid="start"]').trigger('click')
    expect(w.text()).toContain('2026 年 9 月 14 日')
  })
})
