import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExamScreen from '../src/ui/ExamScreen.vue'
import EvidencePicker from '../src/ui/EvidencePicker.vue'
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
    quotes: [{ id: 'T26', text: '手机别是已经沉海河了吧' }, { id: 'L9', text: '嗯。' }],
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
    expect(w.emitted('present')).toBeUndefined() // picking alone presents nothing
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')?.[0]).toEqual(['E06'])
    await w.find('[data-testid="open-record"]').trigger('click')
    await w.find('[data-testid="tab-日志里的话"]').trigger('click')
    await w.find('[data-testid="quote-T26"]').trigger('click')
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')?.[1]).toEqual(['T26'])
  })

  it('picking only selects: the pick can be changed, and nothing is presented until it is confirmed', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    await w.find('[data-testid="open-record"]').trigger('click')
    expect(w.find('[data-testid="present-go"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="record-E06"]').trigger('click')
    expect(w.find('[data-testid="present-picked"]').text()).toContain('电梯楼层日志')
    await w.find('[data-testid="tab-日志里的话"]').trigger('click')
    await w.find('[data-testid="quote-T26"]').trigger('click')
    expect(w.find('[data-testid="present-picked"]').text()).toContain('手机别是已经沉海河了吧')
    expect(w.emitted('present')).toBeUndefined()
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')).toEqual([['T26']])
  })

  it('closing the window drops the pick', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    await w.find('[data-testid="open-record"]').trigger('click')
    await w.find('[data-testid="record-E06"]').trigger('click')
    await w.find('[data-testid="close-present"]').trigger('click')
    await w.find('[data-testid="open-record"]').trigger('click')
    expect(w.find('[data-testid="present-picked"]').exists()).toBe(false)
    expect(w.find('[data-testid="present-go"]').attributes('disabled')).toBeDefined()
  })

  it('renders an argument step and emits the chosen option', async () => {
    const argument = { stepId: 'e', prompt: '为什么？', options: ['错的', '对的'] }
    const w = mount(ExamScreen, { props: examProps({ argument }) })
    expect(w.text()).toContain('为什么？')
    await w.findAll('[data-testid^="option-"]')[1].trigger('click')
    expect(w.emitted('choose')?.[0]).toEqual([{ stepId: 'e', optionIndex: 1 }])
  })
})

const info = {
  E06: { id: 'E06', name: '电梯楼层日志', desc: '郑岑 20:50 那一趟直达 1 楼，中途没停。', type: '记录' as const, who: ['郑岑'], where: '电梯', when: '20:50', image: null },
  E07: { id: 'E07', name: '现场照片', desc: '宋砚倒在桌边。', type: '影像' as const, who: ['宋砚'], image: null },
  T06: { id: 'T06', name: '黎默的证词', desc: '黎默：我 8 点 50 去洗手间。', type: '证言' as const, who: ['黎默'], image: null },
}

describe('EvidencePicker', () => {
  const quotes = [{ id: 'T26', text: '手机别是已经沉海河了吧', who: '黎默' }, { id: 'L9', text: '嗯。', who: '孟遥' }]
  const mountPicker = (extra: Record<string, unknown> = {}) =>
    mount(EvidencePicker, { props: { ids: ['E06', 'E07', 'T06'], info, quotes, ...extra } })

  it('lists the items by name; picking one shows its detail, and only the button under it presents', async () => {
    const w = mountPicker()
    expect(w.text()).toContain('电梯楼层日志')
    expect(w.find('[data-testid="present-go"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="record-E06"]').trigger('click')
    const detail = w.find('[data-testid="record-detail"]')
    expect(detail.text()).toContain('郑岑 20:50 那一趟直达 1 楼')
    expect(detail.text()).toContain('电梯')
    expect(detail.text()).toContain('20:50')
    expect(w.emitted('confirm')).toBeUndefined()
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual(['E06'])
  })

  it('files things by kind and narrows them by person', async () => {
    const w = mountPicker()
    expect(w.find('[data-testid="tab-影像"]').exists()).toBe(true)
    expect(w.find('[data-testid="tab-物证"]').exists()).toBe(false)   // nothing of that kind yet: no empty tab
    await w.find('[data-testid="tab-影像"]').trigger('click')
    expect(w.find('[data-testid="record-E07"]').exists()).toBe(true)
    expect(w.find('[data-testid="record-E06"]').exists()).toBe(false)
    await w.find('[data-testid="tab-全部"]').trigger('click')
    await w.find('[data-testid="who-郑岑"]').trigger('click')
    expect(w.find('[data-testid="record-E06"]').exists()).toBe(true)
    expect(w.find('[data-testid="record-E07"]').exists()).toBe(false)
    await w.find('[data-testid="who-all"]').trigger('click')
    expect(w.find('[data-testid="record-E07"]').exists()).toBe(true)
  })

  it('what people said lives in its own tab and shows who said it', async () => {
    const w = mountPicker()
    expect(w.find('[data-testid="quote-T26"]').exists()).toBe(false)
    await w.find('[data-testid="tab-日志里的话"]').trigger('click')
    expect(w.find('[data-testid="quote-T26"]').text()).toContain('黎默')
    await w.find('[data-testid="quote-L9"]').trigger('click')
    expect(w.find('[data-testid="present-picked"]').text()).toContain('嗯。')
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual(['L9'])
  })

  it('shows every quote the same way: no marker, no class, nothing that tells a slip from a plain line', async () => {
    const w = mountPicker()
    await w.find('[data-testid="tab-日志里的话"]').trigger('click')
    const a = w.find('[data-testid="quote-T26"]')
    const b = w.find('[data-testid="quote-L9"]')
    expect(a.classes()).toEqual(b.classes())
    expect(a.element.tagName).toBe(b.element.tagName)
    expect(w.html()).not.toContain('黎默的话')
  })

  it('says what it is aimed at when a weak point was clicked first', () => {
    expect(mountPicker({ target: '手动开了灯' }).find('[data-testid="present-target"]').text()).toContain('手动开了灯')
    expect(mountPicker().find('[data-testid="present-target"]').exists()).toBe(false)
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

// something the player holds that no step of the running act asks for (it is put in the bag if need be)
function junk(store: ReturnType<typeof useGameStore>): string {
  const used = new Set(store.exam!.def.statements.flatMap(s => s.steps.flatMap(st => (st.kind === 'present' ? st.accepts : []))))
  const id = store.data.evidence.map(e => e.id).find(x => !used.has(x))!
  if (!store.state.evidence.includes(id)) store.state.evidence.push(id)
  return id
}

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
    expect(store.exam?.persuasion).toBe(8)
    expect(store.examStatement?.id).toBe('s1')
  })

  it('clears statements 2 and 4, plays the act-1 ending, then moves on to act 2', () => {
    const store = armed()
    store.state.evidence.push(...store.data.evidence.map(e => e.id).filter(id => !store.state.evidence.includes(id)))   // enough in hand that act 2 can begin
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
    expect(store.screen).toBe('exam')
    expect(store.exam?.def.id).toBe('finale_act2')
    expect(store.examFailed).toBe(false)
    expect(store.state.backlog.some(l => l.text.includes('我是周屿的未婚夫'))).toBe(true)
  })

  it('pressing statement 3 puts the tagged light quote into the log', () => {
    const store = armed()
    store.examGoto(2)
    store.examPress()
    expect(store.state.backlog.some(l => l.tag === 'Q-light')).toBe(true)
  })

  it('eight wrong pieces of evidence use up the persuasion: the act starts over instead of ending the slice', () => {
    const store = armed()
    store.examGoto(1)
    const bad = junk(store)
    for (let i = 0; i < 8; i++) store.examPresent(bad)
    expect(store.examFailed).toBe(false)
    expect(store.screen).toBe('exam')
    expect(store.exam?.persuasion).toBe(8)
    expect(store.examIndex).toBe(0)
    expect(store.tip?.title).toBe('说服力耗尽')
  })

  it('presenting something the player does not own is ignored', () => {
    const store = armed()
    store.examGoto(1)
    expect(store.examPresent('E31').outcome).toBe('ignored')
    expect(store.exam?.persuasion).toBe(8)
  })

  it('examGoto stays inside the statement list', () => {
    const store = armed()
    store.examGoto(99)
    expect(store.examStatement?.id).toBe('s5')
    store.examGoto(-3)
    expect(store.examStatement?.id).toBe('s1')
  })

  it('lists evidence and testimony by name, and quotes (tagged or not) by their text', () => {
    const store = armed()
    expect(store.recordNames.E06).toBe('电梯楼层日志')
    expect(store.recordIds).not.toContain('Q-light')
    store.examGoto(2)
    store.examPress()
    const light = store.quotes.find(q => q.id === 'Q-light')
    expect(light?.text).toContain('屏幕的光')
    expect(store.quotes.every(q => Object.keys(q).sort().join() === 'id,text,who')).toBe(true)   // every quote has the same shape
  })

  it('never names a slip: a T26 line is only ever plain text in the record', () => {
    const store = useGameStore()
    logLines(store.state, [{ speaker: 'limo', text: '手机别是已经沉海河了吧', tag: 'T26' }])
    expect(store.recordIds).not.toContain('T26')
    expect(Object.keys(store.recordNames)).not.toContain('T26')
    expect(store.quotes.some(q => q.id === 'T26' && q.text.includes('沉海河'))).toBe(true)
  })
})

describe('the reaction to what you present', () => {
  it('has its own block, outside the scrolling statement, coloured by how it went', () => {
    const bad = mount(ExamScreen, { props: examProps({ outcome: 'wrong' }) })
    expect(bad.find('[data-testid="scroll"] [data-testid="reaction"]').exists()).toBe(false)
    expect(bad.find('[data-testid="reaction"]').classes()).toContain('bad')
    expect(bad.find('[data-testid="reaction"]').text()).toContain('也许我看错了人')
    expect(mount(ExamScreen, { props: examProps({ outcome: 'correct' }) }).find('[data-testid="reaction"]').classes()).toContain('ok')
    expect(mount(ExamScreen, { props: examProps({ outcome: 'premature' }) }).find('[data-testid="reaction"]').classes()).toContain('meh')
  })

  it('is not there before anything has been presented', () => {
    expect(mount(ExamScreen, { props: examProps({ lastLines: [] }) }).find('[data-testid="reaction"]').exists()).toBe(false)
  })

  it('the court record opens as a window over the screen, and confirming the pick closes it', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    expect(w.find('[data-testid="present-window"]').exists()).toBe(false)
    await w.find('[data-testid="open-record"]').trigger('click')
    expect(w.find('[data-testid="present-window"]').exists()).toBe(true)
    await w.find('[data-testid="record-E06"]').trigger('click')
    expect(w.find('[data-testid="present-window"]').exists()).toBe(true)
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')?.[0]).toEqual(['E06'])
    expect(w.find('[data-testid="present-window"]').exists()).toBe(false)
  })

  it('the window can be closed without presenting anything', async () => {
    const w = mount(ExamScreen, { props: examProps() })
    await w.find('[data-testid="open-record"]').trigger('click')
    await w.find('[data-testid="close-present"]').trigger('click')
    expect(w.find('[data-testid="present-window"]').exists()).toBe(false)
    expect(w.emitted('present')).toBeUndefined()
  })

  it('quotes show who said them', async () => {
    const w = mount(ExamScreen, { props: examProps({ quotes: [{ id: 'G1', text: '别被他们套话', who: '黎默' }] }) })
    await w.find('[data-testid="open-record"]').trigger('click')
    await w.find('[data-testid="tab-日志里的话"]').trigger('click')
    expect(w.find('[data-testid="quote-G1"]').text()).toContain('黎默')
    expect(w.find('[data-testid="quote-G1"]').text()).toContain('别被他们套话')
  })
})

describe('store: the exam stage and the list of quotes', () => {
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

  it('the quotes you can present are what people said, not the narration and not your own lines', () => {
    const store = armed()
    store.state.backlog.push({ id: 'L90', day: 5, hour: 14, speaker: 'narration', text: '全场看向他。' })
    store.state.backlog.push({ id: 'L91', day: 5, hour: 14, speaker: 'lyc', text: '我……' })
    store.state.backlog.push({ id: 'L92', day: 5, hour: 14, speaker: 'limo', text: '林一程不可能杀人。' })
    const quotes = store.quotes
    expect(quotes.some(q => q.text === '全场看向他。')).toBe(false)
    expect(quotes.some(q => q.text === '我……')).toBe(false)
    expect(quotes.find(q => q.text === '林一程不可能杀人。')).toMatchObject({ who: '黎默' })
  })

  it('presenting something wrong shows a reaction and the witness stays on stage when Laohan speaks', () => {
    const store = armed()
    store.examGoto(1)
    store.examPresent(junk(store))                   // owned, but not what this act is about
    expect(store.lastOutcome).toBe('wrong')
    expect(store.lastLinesView.length).toBeGreaterThan(0)
    store.examPresent(junk(store))
    expect(store.stage.right?.id).toBe('limo')       // even if the detective had the second line
  })

  it('moving to another statement clears the last reaction', () => {
    const store = armed()
    store.examGoto(1)
    store.examPresent(junk(store))
    expect(store.lastLinesView.length).toBeGreaterThan(0)
    store.examGoto(2)
    expect(store.lastLinesView).toEqual([])
    expect(store.lastOutcome).toBeNull()
  })
})

describe('what the witness says back to a wrong presentation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is shown, but never becomes something you can present later', () => {
    const store = useGameStore()
    const kit = store.data.debugKit
    store.state.evidence.push(...kit.evidence)
    logLines(store.state, kit.backlog)
    store.startExamById('finale_act1')
    store.examGoto(1)
    store.examPresent(junk(store))
    expect(store.lastLinesView.length).toBeGreaterThan(0)
    expect(store.quotes.some(q => q.text.includes('丢人现眼'))).toBe(false)
    expect(store.state.backlog.some(l => l.text.includes('丢人现眼'))).toBe(false)
  })

  it('a correct presentation does go into the log, as before', () => {
    const store = useGameStore()
    const kit = store.data.debugKit
    store.state.evidence.push(...kit.evidence)
    logLines(store.state, kit.backlog)
    store.startExamById('finale_act1')
    store.examGoto(1)
    store.examPresent('E06')
    expect(store.state.backlog.some(l => l.text.includes('也许我看错了人'))).toBe(true)
  })
})
