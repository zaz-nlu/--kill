import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExamScreen from '../src/ui/ExamScreen.vue'
import CourtRecord from '../src/ui/CourtRecord.vue'
import EndScreen from '../src/ui/EndScreen.vue'
import { useGameStore } from '../src/engine/store'
import { logLines } from '../src/engine/log'

const statement = { id: 's2', text: '8 点 50 我去了一趟洗手间。', steps: [] }

function examProps(extra: Record<string, unknown> = {}) {
  return {
    statement,
    index: 1,
    total: 5,
    persuasion: 5,
    lastLines: [{ name: '黎默', text: '也许我看错了人。' }],
    recordIds: ['E06', 'T06'],
    names: { E06: '电梯楼层日志', T06: '黎默的证词' },
    argument: null,
    ...extra,
  }
}

describe('ExamScreen', () => {
  it('shows the statement, the last reply and one pip per persuasion point', () => {
    const w = mount(ExamScreen, { props: examProps({ persuasion: 4 }) })
    expect(w.text()).toContain('8 点 50 我去了一趟洗手间。')
    expect(w.text()).toContain('也许我看错了人。')
    expect(w.findAll('[data-testid="pip"]').length).toBe(4)
    expect(w.find('[data-testid="meter"]').text()).toBe('说服力')
  })

  it('emits press, prev and next', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    await w.find('[data-testid="press"]').trigger('click')
    await w.find('[data-testid="prev"]').trigger('click')
    await w.find('[data-testid="next"]').trigger('click')
    expect(w.emitted('press')?.length).toBe(1)
    expect(w.emitted('prev')?.length).toBe(1)
    expect(w.emitted('next')?.length).toBe(1)
  })

  it('opens the court record, and presenting an item emits present with its id', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    expect(w.find('[data-testid="record-E06"]').exists()).toBe(false)
    await w.find('[data-testid="open-record"]').trigger('click')
    await w.find('[data-testid="record-E06"]').trigger('click')
    expect(w.emitted('present')?.[0]).toEqual(['E06'])
  })

  it('renders an argument step and emits the chosen option', async () => {
    const argument = { stepId: 'e', prompt: '为什么？', options: ['错的', '对的'] }
    const w = mount(ExamScreen, { props: examProps({ argument }) })
    expect(w.text()).toContain('为什么？')
    await w.findAll('[data-testid^="option-"]')[1].trigger('click')
    expect(w.emitted('choose')?.[0]).toEqual([{ stepId: 'e', optionIndex: 1 }])
  })
})

describe('CourtRecord', () => {
  it('lists the items by name and emits pick', async () => {
    const w = mount(CourtRecord, { props: { ids: ['E06', 'T06'], names: { E06: '电梯楼层日志', T06: '黎默的证词' } } })
    expect(w.text()).toContain('电梯楼层日志')
    await w.find('[data-testid="record-T06"]').trigger('click')
    expect(w.emitted('pick')?.[0]).toEqual(['T06'])
  })
})

describe('EndScreen', () => {
  it('shows the slice ending or the persuasion failure, and restarts', async () => {
    const done = mount(EndScreen, { props: { failed: false } })
    expect(done.text()).toContain('切片到此结束')
    const lost = mount(EndScreen, { props: { failed: true } })
    expect(lost.text()).toContain('说服力归零')
    await lost.find('[data-testid="restart"]').trigger('click')
    expect(lost.emitted('restart')?.length).toBe(1)
  })
})

describe('store: finale act 1', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function armed() {
    const store = useGameStore()
    const kit = store.data.debugKit
    store.state.evidence.push(...kit.evidence)
    store.state.testimony.push(...kit.testimony)
    logLines(store.state, kit.backlog)
    store.startExamById('finale_act1')
    return store
  }

  it('starts the exam on the exam screen with computed persuasion', () => {
    const store = armed()
    expect(store.screen).toBe('exam')
    expect(store.exam?.persuasion).toBe(5)
    expect(store.examStatement?.id).toBe('s1')
  })

  it('clears statements 2 and 4, plays the act-1 ending, then ends the slice', () => {
    const store = armed()
    store.examGoto(1)
    expect(store.examPresent('E06').outcome).toBe('correct')
    expect(store.examPress().outcome).toBe('correct')
    expect(store.examPresent('E13').outcome).toBe('correct')
    expect(store.examPresent('E15').outcome).toBe('correct')
    expect(store.examPresent('T06').outcome).toBe('correct')
    store.examGoto(3)
    expect(store.examPresent('E14').outcome).toBe('correct')
    expect(store.examPresent('E03').outcome).toBe('correct')
    store.examPress()
    expect(store.exam?.cleared).toBe(true)
    expect(store.screen).toBe('scene')
    let guard = 0
    while (store.currentNode) {
      if (guard++ > 100) throw new Error('runaway')
      store.advance()
    }
    expect(store.screen).toBe('end')
    expect(store.examFailed).toBe(false)
    expect(store.state.backlog.some(l => l.text.includes('我是周屿的未婚夫'))).toBe(true)
  })

  it('pressing statement 3 puts the tagged light quote into the log', () => {
    const store = armed()
    store.examGoto(2)
    store.examPress()
    expect(store.state.backlog.some(l => l.tag === 'Q-light')).toBe(true)
  })

  it('five wrong pieces of evidence fail the exam and end the slice', () => {
    const store = armed()
    store.examGoto(1)
    for (let i = 0; i < 5; i++) store.examPresent('E12')
    expect(store.examFailed).toBe(true)
    expect(store.screen).toBe('end')
  })

  it('presenting something the player does not own is ignored', () => {
    const store = armed()
    store.examGoto(1)
    expect(store.examPresent('E31').outcome).toBe('ignored')
    expect(store.exam?.persuasion).toBe(5)
  })

  it('examGoto stays inside the statement list', () => {
    const store = armed()
    store.examGoto(99)
    expect(store.examStatement?.id).toBe('s5')
    store.examGoto(-3)
    expect(store.examStatement?.id).toBe('s1')
  })

  it('names the record entries: evidence by name, quotes by their text', () => {
    const store = armed()
    expect(store.recordNames.E06).toBe('电梯楼层日志')
    expect(store.recordNames.T06).toBeDefined()
    store.examGoto(2)
    store.examPress()
    expect(store.recordIds).toContain('Q-light')
    expect(store.recordNames['Q-light']).toContain('原话')
  })
})
