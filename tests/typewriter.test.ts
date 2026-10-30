import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DialogueBox from '../src/ui/DialogueBox.vue'
import ExamScreen from '../src/ui/ExamScreen.vue'
import { SPEED_MS, charDelay, cycleTextSpeed, setTextSpeed, textSpeed } from '../src/engine/textSpeed'

// The part of an element that is actually showing: everything but the hidden remainder.
function typed(w: ReturnType<typeof mount>, sel: string): string {
  const el = w.find(sel).element
  const full = el.textContent ?? ''
  const hidden = Array.from(el.querySelectorAll('.rest')).reduce((n, r) => n + (r.textContent ?? '').length, 0)
  return full.slice(0, full.length - hidden)
}

const LINE = '我说，你听。好。'

describe('DialogueBox: the line types itself out', () => {
  beforeEach(() => { vi.useFakeTimers(); setTextSpeed('normal') })
  afterEach(() => { vi.useRealTimers(); setTextSpeed('instant') })

  it('starts empty, fills in as the clock runs, and ends with the whole line', async () => {
    const w = mount(DialogueBox, { props: { speaker: '黎默', text: LINE } })
    expect(typed(w, '.text')).toBe('')

    vi.advanceTimersByTime(120)
    await nextTick()
    const part = typed(w, '.text')
    expect(part.length).toBeGreaterThan(0)
    expect(part.length).toBeLessThan(LINE.length)
    expect(LINE.startsWith(part)).toBe(true)

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(typed(w, '.text').length).toBeGreaterThan(part.length)

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(typed(w, '.text')).toBe(LINE)
  })

  it('a click before the end only completes the line; the next click moves on', async () => {
    const w = mount(DialogueBox, { props: { speaker: '黎默', text: LINE } })
    vi.advanceTimersByTime(40)
    await nextTick()
    await w.trigger('click')
    expect(w.emitted('advance')).toBeUndefined()
    expect(typed(w, '.text')).toBe(LINE)
    await w.trigger('click')
    expect(w.emitted('advance')?.length).toBe(1)
  })

  it('the ▼ hint only appears once the line is whole', async () => {
    const w = mount(DialogueBox, { props: { speaker: '黎默', text: LINE } })
    expect(w.find('.hint').exists()).toBe(false)
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(w.find('.hint').exists()).toBe(true)
  })

  it('with instant speed the whole line is there at once', () => {
    setTextSpeed('instant')
    const w = mount(DialogueBox, { props: { speaker: '', text: LINE } })
    expect(typed(w, '.text')).toBe(LINE)
  })

  it('a line that is extended picks up where it left off, it does not start over', async () => {
    const w = mount(DialogueBox, { props: { speaker: '', text: '一二三' } })
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(typed(w, '.text')).toBe('一二三')

    await w.setProps({ text: '一二三四五' })
    await nextTick()
    expect(typed(w, '.text')).toBe('一二三')       // not reset to nothing

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(typed(w, '.text')).toBe('一二三四五')
  })
})

describe('the speed setting', () => {
  afterEach(() => { setTextSpeed('instant') })

  it('a full stop waits longer than a comma, and a comma longer than an ordinary character', () => {
    const base = SPEED_MS.normal
    expect(charDelay('。', base)).toBeGreaterThan(charDelay('，', base))
    expect(charDelay('，', base)).toBeGreaterThan(charDelay('我', base))
    expect(charDelay('我', base)).toBe(base)
  })

  it('cycles 慢 → 中 → 快 → 瞬间 → 慢 and remembers the choice', () => {
    setTextSpeed('slow')
    expect(cycleTextSpeed()).toBe('normal')
    expect(cycleTextSpeed()).toBe('fast')
    expect(cycleTextSpeed()).toBe('instant')
    expect(cycleTextSpeed()).toBe('slow')
    expect(textSpeed.value).toBe('slow')
    expect(JSON.parse(localStorage.getItem('jiudian-text')!)).toBe('slow')
  })
})

describe('ExamScreen: the statement types itself out too', () => {
  const statement = { id: 's1', text: '我说{{m1:A}}。', steps: [] }
  const view = (extra: Record<string, unknown> = {}) => ({
    text: '我说{{m1:A}}。', history: [], weak: { m1: 'open' } as Record<string, 'open' | 'broken'>, cleared: false, exhausted: false,
    canPress: false, pressed: false, dots: [{ id: 's1', cleared: false, pressed: false, revised: false }],
    guard: 0, gaps: 0, gapLimit: 3, max: 6, title: '测试幕', ...extra,
  })
  const props = (extra: Record<string, unknown> = {}) => ({
    statement, index: 0, total: 2, persuasion: 6, lastLines: [], recordIds: [], names: {}, quotes: [], argument: null,
    view: view(), witness: '黎默', ...extra,
  })

  beforeEach(() => { vi.useFakeTimers(); setTextSpeed('normal') })
  afterEach(() => { vi.useRealTimers(); setTextSpeed('instant') })

  it('a weak point cannot be hit until the whole line has been typed out', async () => {
    const w = mount(ExamScreen, { props: props() })
    expect(w.find('[data-testid="weak-m1"]').attributes('disabled')).toBeDefined()
    expect(typed(w, '[data-testid="line"]')).toBe('')

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(typed(w, '[data-testid="line"]')).toBe('我说A。')
    expect(w.find('[data-testid="weak-m1"]').attributes('disabled')).toBeUndefined()
    await w.find('[data-testid="weak-m1"]').trigger('click')
    expect(w.find('[data-testid="present-window"]').exists()).toBe(true)   // now it can be hit
  })

  it('a line that has been read through comes back whole when you walk away and return', async () => {
    const w = mount(ExamScreen, { props: props() })
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(typed(w, '[data-testid="line"]')).toBe('我说A。')

    await w.setProps({ index: 1, statement: { id: 's2', text: '第二句', steps: [] }, view: view({ text: '第二句', weak: {} }) })
    expect(typed(w, '[data-testid="line"]')).toBe('')            // a new line starts over

    await w.setProps({ index: 0, statement, view: view() })
    await nextTick()
    expect(typed(w, '[data-testid="line"]')).toBe('我说A。')      // this one is already known: shown at once
  })
})
