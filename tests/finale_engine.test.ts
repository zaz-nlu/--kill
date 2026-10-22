import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { applyEffect } from '../src/engine/effects'
import { SceneRunner } from '../src/engine/script'
import { computePersuasion, present, press, skipUnreachable, startExam } from '../src/engine/crossexam'
import { useGameStore } from '../src/engine/store'
import { ENDINGS } from '../src/engine/endings'
import EndScreen from '../src/ui/EndScreen.vue'
import type { ExamDef } from '../src/engine/types'
import { playOut } from './helpers'

const tiny = (id: string, extra: Partial<ExamDef> = {}): ExamDef => ({
  id,
  title: id,
  startPersuasion: 5,
  wrongReply: [{ speaker: 'limo', text: '什么？' }],
  statements: [{
    id: 's1',
    text: 'x',
    steps: [{ kind: 'present', id: 'a', accepts: ['E01'], reply: [{ speaker: 'limo', text: 'ok' }] }],
  }],
  ...extra,
})

describe("the 'exam' scene node", () => {
  it('ends the scene and tells the hook which exam comes next', () => {
    let asked = ''
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'say', speaker: 'lyc', text: 'x' }, { type: 'exam', id: 'e2' }, { type: 'say', speaker: 'lyc', text: 'never' }] }, { onExam: id => { asked = id } })
    r.start('a')
    r.advance()
    expect(r.current()).toBeNull()
    expect(asked).toBe('e2')
  })
})

describe('store: acts follow each other', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function rig() {
    const store = useGameStore()
    store.data.exams.t1 = tiny('t1', { onClear: 'to2' })
    store.data.exams.t2 = tiny('t2')
    store.data.scenes.to2 = [{ type: 'say', speaker: 'narration', text: '下一幕' }, { type: 'exam', id: 't2' }]
    store.state.evidence.push('E01', 'E02')
    return store
  }

  it('a scene that ends in an exam node starts that exam', () => {
    const store = rig()
    store.data.scenes.go = [{ type: 'say', speaker: 'narration', text: '开始' }, { type: 'exam', id: 't1' }]
    store.screen = 'scene'
    store.playScene('go')
    playOut(store)
    expect(store.screen).toBe('exam')
    expect(store.exam?.def.id).toBe('t1')
  })

  it('clearing an act plays its scene and moves on to the next act', () => {
    const store = rig()
    store.startExamById('t1')
    store.examPresent('E01')
    expect(store.screen).toBe('scene')
    playOut(store)
    expect(store.screen).toBe('exam')
    expect(store.exam?.def.id).toBe('t2')
  })

  it('what you lost in one act stays lost in the next', () => {
    const store = rig()
    store.startExamById('t1')
    store.examPresent('E02')
    store.examPresent('E02')
    expect(store.exam?.persuasion).toBe(3)
    store.examPresent('E01')
    playOut(store)
    expect(store.exam?.def.id).toBe('t2')
    expect(store.exam?.persuasion).toBe(3)
  })

  it('a loss in a scene counts too, and a gain in a scene is capped at 7', () => {
    const s = createInitialState()
    applyEffect(s, { kind: 'persuasion', delta: -2 })
    expect(computePersuasion(s)).toBe(3)
    const g = createInitialState()
    g.flags.challengeAllCorrect = true
    applyEffect(g, { kind: 'persuasion', delta: 5 })
    expect(computePersuasion(g)).toBe(7)
  })

  it('running out of persuasion in any act is BAD END 2', () => {
    const store = rig()
    store.startExamById('t1')
    for (let i = 0; i < 5; i++) store.examPresent('E02')
    expect(store.examFailed).toBe(true)
    expect(store.gameOver).toBe('bad2')
    expect(store.screen).toBe('end')
  })

  it('starting an act with nothing left to lose is BAD END 2 straight away', () => {
    const store = rig()
    store.state.flags.x = true
    applyEffect(store.state, { kind: 'persuasion', delta: -9 })
    store.startExamById('t1')
    expect(store.gameOver).toBe('bad2')
    expect(store.screen).toBe('end')
  })

  it('a new game forgets what was lost', () => {
    const store = rig()
    applyEffect(store.state, { kind: 'persuasion', delta: -3 })
    store.newGame()
    expect(computePersuasion(store.state)).toBe(5)
  })
})

describe('steps and statements: bonus and any-of', () => {
  it('a step can win persuasion back, up to seven', () => {
    const def = tiny('b', {
      statements: [{ id: 's1', text: 'x', steps: [{ kind: 'present', id: 'a', accepts: ['E01'], bonus: 1, reply: [] }, { kind: 'present', id: 'b', accepts: ['E02'], bonus: 3, reply: [] }] }],
    })
    const e = startExam(def, 5)
    present(e, 's1', 'E01', ['E01', 'E02'])
    expect(e.persuasion).toBe(6)
    present(e, 's1', 'E02', ['E01', 'E02'])
    expect(e.persuasion).toBe(7)
  })

  it('a statement with anyOf is cleared when any one of those steps is done', () => {
    const def = tiny('any', {
      statements: [{
        id: 's1', text: 'x', anyOf: ['a', 'b'],
        steps: [
          { kind: 'present', id: 'a', accepts: ['E01'], required: false, reply: [] },
          { kind: 'present', id: 'b', accepts: ['E02'], required: false, reply: [] },
        ],
      }],
    })
    const e = startExam(def, 5)
    expect(e.cleared).toBe(false)
    present(e, 's1', 'E02', ['E01', 'E02'])
    expect(e.cleared).toBe(true)
  })
})

describe('endings', () => {
  it('every ending has a name and a closing text', () => {
    for (const id of ['hp', 'bad2', 'bad3', 'true', 'a', 'b', 'c', 'hidden']) {
      expect(ENDINGS[id], id).toBeDefined()
      expect(ENDINGS[id].title.length).toBeGreaterThan(0)
      expect(ENDINGS[id].text.length).toBeGreaterThan(10)
    }
  })

  it('the end screen names the ending it is given', () => {
    expect(mount(EndScreen, { props: { failed: false, reason: 'true' } }).text()).toContain('TRUE END')
    expect(mount(EndScreen, { props: { failed: true, reason: 'bad2' } }).text()).toContain('BAD END 2')
    expect(mount(EndScreen, { props: { failed: false, reason: 'c' } }).text()).toContain('借刀')
  })

  it('a scene can raise any of them', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.data.scenes.__e = [{ type: 'effect', effects: [{ kind: 'flag', key: 'ending:true', value: true }] }]
    store.screen = 'scene'
    store.playScene('__e')
    expect(store.gameOver).toBe('true')
    expect(store.screen).toBe('end')
  })
})

describe('nobody is left stuck for want of evidence', () => {
  const chain = (): ExamDef => tiny('chain', {
    statements: [{
      id: 's1', text: 'x',
      steps: [
        { kind: 'present', id: 'a', accepts: ['E01'], reply: [] },
        { kind: 'press', id: 'p', after: ['a'], required: true, reply: [] },
        { kind: 'present', id: 'b', accepts: ['E02'], after: ['p'], reply: [] },
      ],
    }],
  })

  it('a step whose evidence you never found is passed over, at a cost of two persuasion', () => {
    const e = startExam(chain(), 5)
    const skipped = skipUnreachable(e, ['E02'])
    expect(skipped).toEqual(['a'])
    expect(e.persuasion).toBe(3)
    expect(e.gaps).toBe(1)
    expect(e.done.s1).toEqual(['a'])
  })

  it('only steps whose turn has come are passed over: the one behind the press waits for it', () => {
    const e = startExam(chain(), 5)
    skipUnreachable(e, [])
    expect(e.done.s1).toEqual(['a'])
    press(e, 's1')
    expect(skipUnreachable(e, [])).toEqual(['b'])
    expect(e.persuasion).toBe(1)
    expect(e.cleared).toBe(true)
  })

  it('what you do hold is never passed over', () => {
    const e = startExam(chain(), 5)
    expect(skipUnreachable(e, ['E01', 'E02'])).toEqual([])
    expect(e.persuasion).toBe(5)
  })

  it('losing the last of your persuasion this way fails the act', () => {
    const e = startExam(chain(), 2)
    skipUnreachable(e, [])
    expect(e.failed).toBe(true)
  })

  it('the third gap over the whole finale fails it, however much persuasion is left', () => {
    const e = startExam(chain(), 7, 1)
    skipUnreachable(e, [])
    expect(e.failed).toBe(false)
    press(e, 's1')
    skipUnreachable(e, [])
    expect(e.gaps).toBe(2)
    expect(e.failed).toBe(true)
  })

  it('an any-of statement none of whose routes you can walk is waived once, at the price of a gap', () => {
    const def = tiny('any2', {
      statements: [{
        id: 's1', text: 'x', anyOf: ['b1', 'b2'],
        steps: [
          { kind: 'present', id: 'a1', accepts: ['T26'], required: false, reply: [] },
          { kind: 'present', id: 'b1', accepts: ['T30'], after: ['a1'], required: false, reply: [] },
          { kind: 'present', id: 'a2', accepts: ['T27'], required: false, reply: [] },
          { kind: 'present', id: 'b2', accepts: ['T30'], after: ['a2'], required: false, reply: [] },
        ],
      }],
    })
    const none = startExam(def, 5)
    skipUnreachable(none, ['T30'])
    expect(none.cleared).toBe(true)
    expect(none.persuasion).toBe(3)
    skipUnreachable(none, ['T30'])
    expect(none.persuasion).toBe(3)

    const some = startExam(def, 5)
    expect(skipUnreachable(some, ['T26', 'T30'])).toEqual([])
    expect(some.cleared).toBe(false)
    expect(some.persuasion).toBe(5)
  })

  it('the store does it when an act begins, and says so', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.data.exams.m = tiny('m')
    store.startExamById('m')
    expect(store.exam?.persuasion).toBe(3)
    expect(store.exam?.cleared).toBe(true)
    expect(store.notice).toContain('说服力')
  })

  it('gaps from earlier acts count: the third one over the whole finale is BAD END 2', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.examGaps = 2
    store.data.exams.m = tiny('m')
    store.startExamById('m')
    expect(store.exam?.failed).toBe(true)
    expect(store.gameOver).toBe('bad2')
  })
})
