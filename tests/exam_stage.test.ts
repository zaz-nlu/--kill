import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { loadData, RECORD_TYPES } from '../src/engine/data'
import { parseMarked, plainText } from '../src/engine/markup'
import {
  canPress, isSettleable, present, press, startExam, statementView, wasPressed, weakPoints,
} from '../src/engine/crossexam'
import { useGameStore } from '../src/engine/store'
import { playOut } from './helpers'
import { useAudioDirector, type AudioPort } from '../src/audio/director'
import ExamScreen from '../src/ui/ExamScreen.vue'
import type { ExamDef, Line } from '../src/engine/types'

const line = (text: string): Line => ({ speaker: 'limo', text })
const OWNED = ['E1', 'E2', 'E3', 'E4', 'J']

// s1 has two weak points at the start (m1 breaks into a second one, m2); s2 is a plain second line.
function def(): ExamDef {
  return {
    id: 'x', title: '测试幕', startPersuasion: 6, wrongReply: [line('什么？')],
    statements: [
      {
        id: 's1', text: '我说{{m1:A}}，也说{{m9:B}}。',
        steps: [
          { kind: 'present', id: 'a', accepts: ['E1'], target: 'm1', revise: '改口了：{{m2:C}}', reply: [line('a')] },
          { kind: 'present', id: 'b', accepts: ['E2'], target: 'm2', after: ['a'], reply: [line('b')] },
          { kind: 'present', id: 'z', accepts: ['E4'], target: 'm9', reply: [line('z')] },
          { kind: 'press', id: 'p', required: false, append: '再补一句', reply: [line('p')] },
        ],
      },
      { id: 's2', text: '第二句', steps: [{ kind: 'present', id: 'c', accepts: ['E3'], reply: [line('c')] }] },
      { id: 's3', text: '开场白', steps: [{ kind: 'press', id: 'o', required: false, reply: [line('o')] }] },
    ],
  }
}

describe('weak points in a line (markup)', () => {
  it('splits a line into plain pieces and marked phrases', () => {
    expect(parseMarked('我说{{m1:A}}，也说{{m9:B}}。')).toEqual([
      { text: '我说' }, { text: 'A', mark: 'm1' }, { text: '，也说' }, { text: 'B', mark: 'm9' }, { text: '。' },
    ])
    expect(parseMarked('没有标记')).toEqual([{ text: '没有标记' }])
    expect(plainText('我说{{m1:A}}，也说{{m9:B}}。')).toBe('我说A，也说B。')
  })
})

describe('what the line looks like as it is taken apart', () => {
  it('starts as written, shows only the weak points that can be attacked now, and marks the ones already broken', () => {
    const ex = startExam(def(), 6)
    expect(statementView(ex, 's1')).toEqual({ text: '我说{{m1:A}}，也说{{m9:B}}。', history: [] })
    expect(weakPoints(ex, 's1')).toEqual({ m1: 'open', m9: 'open' })
    present(ex, 's1', 'E4', OWNED)
    expect(weakPoints(ex, 's1')).toEqual({ m1: 'open', m9: 'broken' })
  })

  it('a landed step rewrites the line; what it said before is kept, and the next weak point appears', () => {
    const ex = startExam(def(), 6)
    const r = present(ex, 's1', 'E1', OWNED)
    expect(r.outcome).toBe('correct')
    expect(r.revised).toBe(true)
    expect(r.target).toBe('m1')
    expect(statementView(ex, 's1')).toEqual({ text: '改口了：{{m2:C}}', history: ['我说{{m1:A}}，也说{{m9:B}}。'] })
    expect(weakPoints(ex, 's1')).toEqual({ m2: 'open' })
    present(ex, 's1', 'E2', OWNED)
    expect(weakPoints(ex, 's1')).toEqual({ m2: 'broken' })
  })

  it('pressing can add a sentence, and the new text is built on what is there', () => {
    const ex = startExam(def(), 6)
    const r = press(ex, 's1')
    expect(r.outcome).toBe('correct')
    expect(statementView(ex, 's1').text).toBe('我说{{m1:A}}，也说{{m9:B}}。\n再补一句')
    expect(wasPressed(ex, 's1')).toBe(true)
    expect(canPress(ex, 's1')).toBe(false)
  })

  it('a line that asks for nothing is never "settled"', () => {
    const ex = startExam(def(), 6)
    expect(isSettleable(ex, 's1')).toBe(true)
    expect(isSettleable(ex, 's3')).toBe(false)
  })
})

describe('aiming at a weak point', () => {
  it('the right item on the point it breaks lands', () => {
    const ex = startExam(def(), 6)
    expect(present(ex, 's1', 'E4', OWNED, 'm9').outcome).toBe('correct')
  })

  it('a useful item aimed at the wrong point is answered and costs nothing', () => {
    const ex = startExam(def(), 6)
    const r = present(ex, 's1', 'E4', OWNED, 'm1')
    expect(r.outcome).toBe('miss')
    expect(r.lines.length).toBeGreaterThan(0)
    expect(r.persuasion).toBe(6)
    expect(ex.done.s1).toEqual([])
  })

  it('without aiming, it is tried against whatever is open, as before', () => {
    const ex = startExam(def(), 6)
    expect(present(ex, 's1', 'E4', OWNED).outcome).toBe('correct')
  })

  it('the right item at the right moment on a point that is not open yet is "premature", still free', () => {
    const ex = startExam(def(), 6)
    const r = present(ex, 's1', 'E2', OWNED)
    expect(r.outcome).toBe('premature')
    expect(r.persuasion).toBe(6)
  })
})

describe('mistakes, and what costs nothing', () => {
  it('an item that belongs to another line of the act is answered and free', () => {
    const ex = startExam(def(), 6)
    const r = present(ex, 's1', 'E3', OWNED)
    expect(r.outcome).toBe('elsewhere')
    expect(r.lines.length).toBeGreaterThan(0)
    expect(r.persuasion).toBe(6)
  })

  it('an item that belongs nowhere costs a point', () => {
    const ex = startExam(def(), 6)
    expect(present(ex, 's1', 'J', OWNED).outcome).toBe('wrong')
    expect(ex.persuasion).toBe(5)
  })

  it('a guard takes the blow instead, once each', () => {
    const ex = startExam(def(), 6, 0, 1)
    const first = present(ex, 's1', 'J', OWNED)
    expect(first.outcome).toBe('wrong')
    expect(first.guarded).toBe(true)
    expect(ex.persuasion).toBe(6)
    expect(ex.guard).toBe(0)
    const second = present(ex, 's1', 'J', OWNED)
    expect(second.guarded).toBe(false)
    expect(ex.persuasion).toBe(5)
  })

  it('once a line is settled, nothing tried on it costs anything and the answer says so', () => {
    const ex = startExam(def(), 6)
    present(ex, 's2', 'E3', OWNED)
    for (const r of [present(ex, 's2', 'J', OWNED), present(ex, 's2', 'E3', OWNED), press(ex, 's2')]) {
      expect(r.outcome).toBe('cleared')
      expect(r.lines.length).toBeGreaterThan(0)
    }
    expect(ex.persuasion).toBe(6)
  })

  it('pressing a line that has nothing more to give still answers, and counts as pressed', () => {
    const ex = startExam(def(), 6)
    press(ex, 's1')
    const r = press(ex, 's1')
    expect(r.outcome).toBe('ignored')
    expect(r.lines.length).toBeGreaterThan(0)
    const plain = press(ex, 's2')
    expect(plain.lines.length).toBeGreaterThan(0)
    expect(wasPressed(ex, 's2')).toBe(true)
  })
})

describe('store: the screen is told what happened', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function rig() {
    const store = useGameStore()
    store.data.exams.x = def()
    store.state.evidence.push(...OWNED)
    store.startExamById('x')
    return store
  }

  it('every move leaves an event, even when two answers look alike', () => {
    const store = rig()
    expect(store.examEvent).toBeNull()
    store.examPresent('J')
    const first = store.examEvent!
    expect(first).toMatchObject({ kind: 'present', outcome: 'wrong', lost: 1, revised: false })
    store.examPresent('J')
    expect(store.examEvent!.n).toBe(first.n + 1)
    store.examPress()
    expect(store.examEvent!.kind).toBe('press')
  })

  it('a landed blow says what it broke and whether it rewrote the line', () => {
    const store = rig()
    store.examPresent('E1', 'm1')
    expect(store.examEvent).toMatchObject({ kind: 'present', outcome: 'correct', target: 'm1', revised: true, lineCleared: false })
    expect(store.examView?.text).toBe('改口了：{{m2:C}}')
    expect(store.examView?.weak).toEqual({ m2: 'open' })
  })

  it('settling a line is announced once, and the view then calls it cleared', () => {
    const store = rig()
    store.examGoto(1)
    store.examPresent('E3')
    expect(store.examEvent?.lineCleared).toBe(true)
    expect(store.examView?.cleared).toBe(true)
    expect(store.examView?.exhausted).toBe(true)
    store.examPresent('J')
    expect(store.examEvent?.lineCleared).toBe(false)
    expect(store.exam?.persuasion).toBe(8)
  })

  it('the view of an opening line never claims it is cleared', () => {
    const store = rig()
    store.examGoto(2)
    expect(store.examView?.cleared).toBe(false)
  })

  it('what the witness says in a rewrite goes on the record, so it can be quoted back', () => {
    const store = rig()
    store.examPresent('E1', 'm1')
    expect(store.state.backlog.some(l => l.text === '改口了：C')).toBe(true)
  })

  it('the item list comes with a kind, who it is about, and where and when', () => {
    const store = useGameStore()
    store.state.evidence.push('E06')
    store.state.testimony.push('T06')
    const info = store.recordInfo
    expect(info.E06).toMatchObject({ type: '记录', who: ['郑岑'], when: '20:50' })
    expect(info.T06).toMatchObject({ type: '证言', who: ['黎默'] })
    expect(info.E06.name).toBe('电梯楼层日志')
  })

  it('the act can wait for the last blow to land before it ends', () => {
    const store = rig()
    store.stageExam(true)
    store.examGoto(1)
    store.examPresent('E3')               // s2 is settled…
    store.examGoto(0)
    store.examPresent('E1', 'm1'); store.examPresent('E2'); store.examPresent('E4')
    expect(store.exam?.cleared).toBe(true)
    expect(store.examHold).toBe(true)
    expect(store.screen).toBe('exam')    // not yet
    expect(store.examPresent('J').outcome).toBe('ignored')   // and nothing else can be done meanwhile
    store.examContinue()
    expect(store.examHold).toBe(false)
    expect(store.screen).toBe('end')
    store.stageExam(false)
  })

  it('without that, the act ends at once', () => {
    const store = rig()
    store.examGoto(1)
    store.examPresent('E3')
    store.examGoto(0)
    store.examPresent('E1'); store.examPresent('E2'); store.examPresent('E4')
    expect(store.examHold).toBe(false)
    expect(store.screen).toBe('end')
  })
})

describe('audio: breaking a weak point is a blow', () => {
  class Recorder implements AudioPort {
    sounds: string[] = []
    setMood = () => {}
    setDanger = () => {}
    sfx = (n: string) => { this.sounds.push(n) }
  }

  it('plays "smash" for a landed present, "right" for the rest, "wrong" for a mistake', async () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    const port = new Recorder()
    mount(defineComponent({ setup() { useAudioDirector(store, port as unknown as AudioPort); return () => h('div') } }))
    store.data.exams.x = def()
    store.state.evidence.push(...OWNED)
    store.startExamById('x')
    await nextTick()
    store.examPresent('E1', 'm1')
    await nextTick()
    expect(port.sounds.at(-1)).toBe('smash')
    store.examPress()
    await nextTick()
    expect(port.sounds.at(-1)).toBe('right')
    store.examPresent('J')
    await nextTick()
    expect(port.sounds.at(-1)).toBe('wrong')
  })
})

describe('ExamScreen: weak points, blows and the end of an act', () => {
  const statement = { id: 's1', text: '我说{{m1:A}}。', steps: [] }
  const view = (extra: Record<string, unknown> = {}) => ({
    text: '我说{{m1:A}}。', history: [], weak: { m1: 'open' } as Record<string, 'open' | 'broken'>, cleared: false, exhausted: false, canPress: false, pressed: false,
    dots: [{ id: 's1', cleared: false, pressed: false, revised: false }, { id: 's2', cleared: true, pressed: false, revised: false }],
    guard: 0, gaps: 0, gapLimit: 3, max: 6, title: '测试幕', ...extra,
  })
  const props = (extra: Record<string, unknown> = {}) => ({
    statement, index: 0, total: 2, persuasion: 6, lastLines: [], recordIds: ['E06'], names: { E06: '电梯楼层日志' }, quotes: [], argument: null,
    view: view(), witness: '黎默', ...extra,
  })
  const ev = (extra: Record<string, unknown> = {}) => ({ n: 1, kind: 'present', outcome: 'wrong', revised: false, guarded: false, lost: 0, lineCleared: false, ...extra })

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('the weak point is a button; clicking it opens the evidence window aimed at it, and presenting carries the target', async () => {
    const w = mount(ExamScreen, { props: props() })
    expect(w.find('[data-testid="present-window"]').exists()).toBe(false)
    await w.find('[data-testid="weak-m1"]').trigger('click')
    expect(w.find('[data-testid="present-target"]').text()).toContain('A')
    expect(w.emitted('record')?.at(-1)).toEqual([true])             // the music cuts to the showdown at the click
    await w.find('[data-testid="record-E06"]').trigger('click')
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')?.[0]).toEqual(['E06', 'm1'])
  })

  it('the plain "出示" button opens the window with no target and presents without one', async () => {
    const w = mount(ExamScreen, { props: props() })
    await w.find('[data-testid="open-record"]').trigger('click')
    expect(w.find('[data-testid="present-target"]').exists()).toBe(false)
    await w.find('[data-testid="record-E06"]').trigger('click')
    await w.find('[data-testid="present-go"]').trigger('click')
    expect(w.emitted('present')?.[0]).toEqual(['E06'])
  })

  it('only open points are buttons: a broken one is struck through, and a plain line has none', () => {
    const broken = mount(ExamScreen, { props: props({ view: view({ weak: { m1: 'broken' } }) }) })
    expect(broken.find('[data-testid="weak-m1"]').exists()).toBe(false)
    expect(broken.find('.broken').text()).toBe('A')
    const plain = mount(ExamScreen, { props: props({ view: null }) })
    expect(plain.find('[data-testid^="weak-"]').exists()).toBe(false)
    expect(plain.text()).toContain('我说A。')                          // (the words are there, just not as targets)
  })

  it('a settled line is stamped, its press and present buttons go dead, and the next one is pointed to', () => {
    const w = mount(ExamScreen, { props: props({ view: view({ cleared: true, exhausted: true, weak: {} }) }) })
    expect(w.find('[data-testid="stamp"]').text()).toBe('哑口无言')
    expect(w.find('[data-testid="press"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="open-record"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="next"]').classes()).toContain('go')
    expect(mount(ExamScreen, { props: props() }).find('[data-testid="stamp"]').exists()).toBe(false)
  })

  it('shows where the act stands: the witness, the persuasion bar with its empty slots, the guard and the gaps', () => {
    const w = mount(ExamScreen, { props: props({ persuasion: 4, view: view({ guard: 1, gaps: 2 }) }) })
    expect(w.find('[data-testid="witness-plate"]').text()).toContain('黎默')
    expect(w.findAll('[data-testid="pip"]')).toHaveLength(4)
    expect(w.findAll('[data-testid="pip-empty"]')).toHaveLength(2)
    expect(w.find('[data-testid="guard"]').text()).toContain('1')
    expect(w.find('[data-testid="gaps"]').text()).toContain('2/3')
  })

  it('the dots show every line, and clicking one goes there', async () => {
    const w = mount(ExamScreen, { props: props() })
    expect(w.findAll('.dot')).toHaveLength(2)
    expect(w.find('[data-testid="dot-1"]').classes()).toContain('done')
    await w.find('[data-testid="dot-1"]').trigger('click')
    expect(w.emitted('goto')?.[0]).toEqual([1])
  })

  it('a hint dot sits on "追问" while the line still has something to give', () => {
    expect(mount(ExamScreen, { props: props({ view: view({ canPress: true }) }) }).find('[data-testid="press-hint"]').exists()).toBe(true)
    expect(mount(ExamScreen, { props: props() }).find('[data-testid="press-hint"]').exists()).toBe(false)
  })

  it('a mistake shakes the screen and shows what it cost', async () => {
    const w = mount(ExamScreen, { props: props() })
    await w.setProps({ event: ev({ outcome: 'wrong', lost: 1 }), persuasion: 5 })
    expect(w.emitted('impact')?.at(-1)).toEqual(['hurt'])
    expect(w.find('[data-testid="loss"]').text()).toContain('1')
    vi.advanceTimersByTime(1400)
    await nextTick()
    expect(w.find('[data-testid="loss"]').exists()).toBe(false)
  })

  it('a landed blow that rewrites the line smashes the old one, then the new one rises', async () => {
    const w = mount(ExamScreen, { props: props() })
    await w.setProps({
      event: ev({ outcome: 'correct', revised: true, target: 'm1', n: 2 }),
      view: view({ text: '改口了：{{m2:C}}', history: ['我说{{m1:A}}。'], weak: { m2: 'open' } }),
    })
    expect(w.emitted('impact')?.at(-1)).toEqual(['hit'])
    expect(w.find('[data-testid="shatter-text"]').exists()).toBe(true)         // the old line is flying apart
    expect(w.find('[data-testid="shatter-text"]').text()).toContain('我说A。')
    expect(w.find('[data-testid="weak-m2"]').exists()).toBe(false)
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(w.find('[data-testid="shatter-text"]').exists()).toBe(false)
    expect(w.find('[data-testid="weak-m2"]').exists()).toBe(true)              // the new weak point is there
    expect(w.find('[data-testid="history"]').text()).toContain('我说A。')       // and the old line is kept, struck through
  })

  it('a blow that rewrites nothing only cracks the word', async () => {
    const w = mount(ExamScreen, { props: props() })
    await w.setProps({ event: ev({ outcome: 'correct', revised: false, target: 'm1', n: 2 }), view: view({ weak: { m1: 'broken' } }) })
    expect(w.find('[data-testid="shatter-text"]').exists()).toBe(false)
    expect(w.find('.broken').classes()).toContain('fresh')
    expect(w.emitted('impact')?.at(-1)).toEqual(['hit'])
  })

  it('walking to another line never replays the last blow', async () => {
    const w = mount(ExamScreen, { props: props({ event: ev({ outcome: 'correct', revised: true, n: 2 }) }) })
    const before = w.emitted('impact')?.length ?? 0
    await w.setProps({ index: 1, statement: { id: 's2', text: '第二句', steps: [] }, view: view({ text: '第二句', weak: {} }) })
    expect(w.emitted('impact')?.length ?? 0).toBe(before)
    expect(w.find('[data-testid="shatter-text"]').exists()).toBe(false)
  })

  it('when the act is won the screen holds still for the last blow, then asks to move on; the buttons are dead meanwhile', async () => {
    const w = mount(ExamScreen, { props: props({ hold: true }) })
    expect(w.find('[data-testid="open-record"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="weak-m1"]').attributes('disabled')).toBeDefined()
    expect(w.emitted('continue')).toBeUndefined()
    vi.advanceTimersByTime(1600)
    expect(w.emitted('continue')?.length).toBe(1)
  })
})

describe('the real data', () => {
  const data = loadData()

  it('every item of evidence and testimony is filed: a known kind, and who it is about', () => {
    for (const d of [...data.evidence, ...data.testimony]) {
      const m = data.recordMeta[d.id]
      expect(m, d.id).toBeDefined()
      expect(RECORD_TYPES as readonly string[], d.id).toContain(m.type)
      expect(Array.isArray(m.who), d.id).toBe(true)
    }
    for (const id of Object.keys(data.recordMeta)) {
      expect([...data.evidence, ...data.testimony].some(d => d.id === id), `meta for unknown ${id}`).toBe(true)
    }
    for (const e of data.evidence) expect(data.recordMeta[e.id].type, e.id).not.toBe('证言')
    for (const t of data.testimony) expect(data.recordMeta[t.id].type, t.id).toBe('证言')
  })

  // Every weak point written into a line must be a point some step breaks, and every target must show up in the line
  // (the text itself or one of its rewrites), or the player could be shown a red word that does nothing, or never see one.
  it.each(Object.values(data.exams).map(e => [e.id, e] as const))('%s: weak points and targets agree', (_id, exam) => {
    for (const st of exam.statements) {
      const marks = new Set<string>()
      const texts = [st.text, ...st.steps.flatMap(s => [s.revise, s.append]).filter((t): t is string => Boolean(t))]
      for (const t of texts) for (const seg of parseMarked(t)) if (seg.mark) marks.add(seg.mark)
      const targets = new Set(st.steps.flatMap(s => (s.kind === 'present' && s.target ? [s.target] : [])))
      for (const m of marks) expect(targets.has(m), `${exam.id}/${st.id}: weak point ${m} has no step`).toBe(true)
      for (const t of targets) expect(marks.has(t), `${exam.id}/${st.id}: target ${t} is not in the line`).toBe(true)
    }
  })

  it('act 3 is the pilot: every line has a weak point or a press with something to say', () => {
    const act3 = data.exams.finale_act3
    for (const st of act3.statements) {
      const marked = [st.text, ...st.steps.map(s => s.revise ?? '')].some(t => parseMarked(t).some(s => s.mark))
      const pressed = st.steps.some(s => s.kind === 'press' && s.append)
      expect(marked || pressed, st.id).toBe(true)
    }
    expect(act3.pressReplies?.length).toBeGreaterThan(0)
  })

  // The real thing, for every act that has been marked up: at every step that asks for evidence, the red word it breaks is
  // on the screen (so the player can click it), and aiming the right item at it lands.
  function armed() {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.evidence.push(...store.data.evidence.map(e => e.id))
    store.state.testimony.push(...store.data.testimony.map(t => t.id))
    for (const tag of ['Q-light', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']) {
      store.state.backlog.push({ id: 'q-' + tag, speaker: 'limo', text: '一句话 ' + tag, tag, day: 5, hour: 12 })
    }
    return store
  }

  function walk(store: ReturnType<typeof useGameStore>, seen: { steps: number }): void {
    let guard = 0
    while (store.screen === 'exam' && guard++ < 300) {
      const e = store.exam!
      let moved = false
      for (let i = 0; i < e.def.statements.length && !moved; i++) {
        const st = e.def.statements[i]
        for (const step of st.steps) {
          const done = e.done[st.id]
          if (done.includes(step.id) || !(step.after ?? []).every(a => done.includes(a))) continue
          store.examGoto(i)
          if (step.kind === 'press') store.examPress()
          else if (step.kind === 'argument') store.examChoose(step.id, step.options.findIndex(o => o.correct))
          else {
            const where = `${st.id}/${step.id}`
            expect(step.target, `${where} has no weak point`).toBeDefined()
            expect(store.examView!.weak[step.target!], `${where}: ${step.target} is not on screen`).toBe('open')
            expect(store.examPresent(step.accepts[0], step.target).outcome, where).toBe('correct')
            seen.steps += 1
          }
          moved = true
          break
        }
      }
      if (!moved) break
    }
  }

  it.each(['finale_act1', 'finale_act2', 'finale_act3', 'finale_act4'])('%s can be walked from first line to last by clicking each red word', id => {
    const store = armed()
    const seen = { steps: 0 }
    store.startExamById(id)
    walk(store, seen)
    expect(seen.steps).toBeGreaterThan(3)
    expect(store.screen).not.toBe('exam')           // the act was cleared (a scene follows)
    expect(store.state.examGaps ?? 0).toBe(0)
  })

  it('winning an act and then running out of persuasion in the next sends you back to the start of THAT act, not the finale', () => {
    const store = armed()
    store.startExamById('finale_act1')
    walk(store, { steps: 0 })
    playOut(store)                                    // act 1's closing scene, which leads on to act 2
    expect(store.exam?.def.id).toBe('finale_act2')
    const used = new Set(store.exam!.def.statements.flatMap(s => s.steps.flatMap(st => (st.kind === 'present' ? st.accepts : []))))
    const junk = store.data.evidence.map(e => e.id).find(x => !used.has(x))!
    store.examGoto(2)
    const mistakes = store.exam!.persuasion + store.exam!.guard
    for (let i = 0; i < mistakes; i++) store.examPresent(junk)
    expect(store.screen).toBe('exam')
    expect(store.exam?.def.id).toBe('finale_act2')   // not act 1, and not the end
    expect(store.examIndex).toBe(0)
    expect(store.exam?.persuasion).toBe(8)
    expect(store.exam?.done.s2).toEqual([])         // the act is as new
    expect(store.gameOver).toBeNull()
  })
})
