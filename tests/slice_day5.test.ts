import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner, evalCondition } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import { nextEvent } from '../src/engine/events'
import { logLines } from '../src/engine/log'
import { computePersuasion } from '../src/engine/crossexam'
import { availableSteps } from '../src/engine/crossexam'
import type { GameState } from '../src/engine/types'
import { playOut } from './helpers'

const data = loadData()

function play(state: GameState, sceneId: string, choices: number[] = []): void {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 800) throw new Error('scene did not terminate')
    const node = runner.current()!
    runner.advance(node.type === 'choice' ? queue.shift() ?? 0 : undefined)
  }
}
const said = (s: GameState) => s.backlog.map(l => l.text).join('\n')
const day5 = (hour = 9) => { const s = createInitialState(); s.day = 5; s.hour = hour; return s }
const ids = (s: GameState) => availableActions(s, data.actions).map(a => a.id)
const due = (s: GameState) => nextEvent(s, data.events)?.id ?? null
const ev = (id: string) => data.events.find(e => e.id === id)!

describe('day 5 morning', () => {
  it('the fixed events are in the file, in order, with scenes that exist', () => {
    const list = data.events.filter(e => e.day === 5).map(e => e.id)
    expect(list).toEqual(['day5_attack4', 'day5_call', 'day5_video', 'day5_boss_msgs', 'day5_e35', 'day5_challenge', 'day5_finale'])
    for (const id of list) expect(data.scenes[ev(id).scene], id).toBeDefined()
  })

  it('the platform attack only comes when things are dangerous (80+), and only hurts at 90+', () => {
    const calm = day5(); calm.danger = 70
    expect(evalCondition(calm, ev('day5_attack4').requires!)).toBe(false)
    const tense = day5(); tense.danger = 85
    expect(evalCondition(tense, ev('day5_attack4').requires!)).toBe(true)
    play(tense, 'day5_attack4', [1])
    expect(tense.hp).toBe(3)
    const bad = day5(); bad.danger = 95
    play(bad, 'day5_attack4', [1])
    expect(bad.hp).toBe(1)
    const good = day5(); good.danger = 95
    play(good, 'day5_attack4', [0])
    expect(good.hp).toBe(3)
  })

  it('Lao Han announces the two o\'clock gathering', () => {
    const s = day5()
    play(s, 'day5_call')
    expect(said(s)).toContain('下午两点')
    expect(said(s)).toContain('三点半')
  })

  it('the boss texts about overtime: ignoring him costs a little goodwill', () => {
    const s = day5(); const before = s.affinity.boss
    play(s, 'day5_boss_msgs', [0])
    expect(s.affinity.boss).toBe(before - 5)
    const t = day5(); const b2 = t.affinity.boss
    play(t, 'day5_boss_msgs', [1])
    expect(t.affinity.boss).toBe(b2)
    expect(said(t)).toContain('算加班')
  })

  it('the gate camera footage comes only if you told Lao Han about the man in the alley', () => {
    const e = ev('day5_e35')
    const s = day5(); s.trust = 45
    expect(evalCondition(s, e.requires!)).toBe(false)
    s.flags.told_laohan_liu = true
    expect(evalCondition(s, e.requires!)).toBe(true)
    s.trust = 30
    expect(evalCondition(s, e.requires!)).toBe(false)
    s.trust = 45
    play(s, 'day5_e35')
    expect(s.evidence).toContain('E35')
  })
})

describe('day 5 actions', () => {
  it('5-1 reading the SD card needs the trophy handed in, the booking and trust', () => {
    const s = day5(); s.evidence.push('E21'); s.flags.e22_booked = true; s.trust = 60
    expect(ids(s)).toContain('5-1')
    s.trust = 50
    expect(ids(s)).not.toContain('5-1')
    s.trust = 60; s.flags.e22_booked = false
    expect(ids(s)).not.toContain('5-1')
    const t = day5(); t.evidence.push('E21'); t.flags.e22_booked = true; t.trust = 60
    play(t, 'act_5_1')
    expect(t.evidence).toContain('E23')
  })

  it('there is always something to do in the three morning slots', () => {
    for (const h of [9, 10, 11]) expect(availableActions(day5(h), data.actions).length, `hour ${h}`).toBeGreaterThan(0)
  })

  it('the missed key actions of the days before can still be made up (light log, the box, the video, the custody visit)', () => {
    const s = day5(); s.trust = 60; s.evidence.push('E15', 'E11', 'E19', 'E13', 'E05'); s.flags.mengyao_taken = true; s.flags.unlock_frame_check = true
    for (const scene of ['act_4_3', 'act_4_4', 'act_4_2', 'act_4_16']) {
      expect(data.actions.some(a => a.days.includes(5) && a.scene === scene), scene).toBe(true)
    }
    expect(ids(s).length).toBeGreaterThanOrEqual(4)
  })

  it('5-3 the hidden meeting appears only with all of its conditions, and never after the confrontation', () => {
    const base = () => {
      const s = day5()
      s.evidence.push('E21', 'E23', 'E24'); s.testimony.push('T09'); s.affinity.limo = 50
      return s
    }
    expect(ids(base())).toContain('5-3')
    const noE23 = base(); noE23.evidence = noE23.evidence.filter(x => x !== 'E23')
    expect(ids(noE23)).not.toContain('5-3')
    const cold = base(); cold.affinity.limo = 49
    expect(ids(cold)).not.toContain('5-3')
    const confronted = base(); confronted.flags.confronted_limo = true
    expect(ids(confronted)).not.toContain('5-3')
  })

  it('5-3: with empathy he hands in the card and walks to the police', () => {
    const s = day5(); s.affinity.limo = 60
    play(s, 'act_5_3', [0])
    expect(s.flags['ending:hidden']).toBe(true)
  })

  it('5-3: the fish biscuits open one more way, and it is a quiet one', () => {
    const s = day5(); s.affinity.limo = 60
    s.giftsGiven.limo = ['fish_cookie']
    const r = new SceneRunner(s, data.scenes)
    r.start('act_5_3')
    while (r.current() && r.current()!.type !== 'choice') r.advance()
    const c = r.current()!
    expect(c.type === 'choice' && c.options.length).toBe(3)
    play(s, 'act_5_3', [2])
    expect(s.flags['ending:hidden']).toBe(true)
  })

  it('5-3: choosing wrongly brings the lethal attack, which you can survive and carry on', () => {
    const s = day5(); s.affinity.limo = 60; s.hp = 3
    play(s, 'act_5_3', [1, 0])
    expect(s.flags['ending:hidden']).toBeUndefined()
    expect(s.hp).toBe(3)
    const bad = day5(); bad.affinity.limo = 60; bad.hp = 3
    play(bad, 'act_5_3', [1, 1])
    expect(bad.hp).toBe(1)
  })
})

describe('12:00 the challenge letter', () => {
  const answer = (s: GameState, q1: number, q2: number, q3: number) => play(s, 'day5_challenge', [q1, q2, q3])

  it('three questions; the right three, naming Limo, earn a point of persuasion', () => {
    const s = day5(12)
    answer(s, 2, 1, 0)
    expect(s.flags['route:limo']).toBe(true)
    expect(s.flags.challengeAllCorrect).toBe(true)
    expect(computePersuasion(s)).toBe(6)
  })

  it('a wrong answer is not announced, it just costs the bonus', () => {
    const s = day5(12)
    answer(s, 0, 1, 0)
    expect(s.flags.challengeAllCorrect).toBeUndefined()
    expect(s.flags['route:limo']).toBe(true)
    expect(said(s)).not.toContain('错了')
  })

  it('the third answer decides the road: Limo, the boss, or somebody else', () => {
    const boss = day5(12); answer(boss, 2, 1, 1)
    expect(boss.flags['route:boss']).toBe(true)
    expect(boss.flags['route:limo']).toBeUndefined()
    for (const [i, id] of ['mengyao', 'zhengcen', 'shaoxy', 'suwen', 'lucheng'].entries()) {
      const s = day5(12); answer(s, 2, 1, 2 + i)
      expect(s.flags[`route:${id}`], id).toBe(true)
    }
  })

  it('and the afternoon gathering follows straight on', () => {
    const s = day5(12)
    answer(s, 2, 1, 0)
    expect(s.hour).toBe(14)
    for (const x of data.events.filter(y => y.day === 5 && y.hour < 14)) s.flags['event:' + x.id] = true
    const e = nextEvent(s, data.events)
    expect(e?.id).toBe('day5_finale')
    expect(ev('day5_challenge').hour).toBe(12)
  })
})

// ---- the gathering: a solver that always plays the right card ----

function kit(store: ReturnType<typeof useGameStore>, opts: { without?: string[] } = {}) {
  const drop = new Set(opts.without ?? [])
  for (const e of data.evidence) if (!drop.has(e.id)) store.state.evidence.push(e.id)
  for (const t of data.testimony) if (!drop.has(t.id)) store.state.testimony.push(t.id)
  const tags = ['T06', 'T22', 'T26', 'T27', 'T28', 'T29', 'Q-light', 'G1', 'G2', 'G4', 'G6', 'G9']
  logLines(store.state, tags.filter(t => !drop.has(t)).map(t => ({ speaker: 'limo' as const, text: `（${t}）`, tag: t })))
}

function solve(store: ReturnType<typeof useGameStore>): void {
  let guard = 0
  while (store.screen === 'exam' && store.exam) {
    if (guard++ > 300) throw new Error('exam did not finish')
    const e = store.exam
    let moved = false
    for (let i = 0; i < e.def.statements.length && !moved; i++) {
      const st = e.def.statements[i]
      for (const step of availableSteps(e, st.id)) {
        store.examGoto(i)
        if (step.kind === 'press') { store.examPress(); moved = true; break }
        if (step.kind === 'argument') { store.examChoose(step.id, step.options.findIndex(o => o.correct)); moved = true; break }
        const owned = [...store.state.evidence, ...store.state.testimony, ...store.state.backlog.map(l => l.tag ?? '')]
        const card = step.accepts.find(a => owned.includes(a))
        if (card) { store.examPresent(card); moved = true; break }
      }
    }
    if (!moved) break
  }
}

function finish(store: ReturnType<typeof useGameStore>, pick: (t: string[]) => number = () => 0): void {
  let guard = 0
  while (store.screen !== 'end' && guard++ < 60) {
    if (store.screen === 'scene') playOut(store, pick)
    else if (store.screen === 'exam') solve(store)
    else break
  }
}

function gathering(setup?: (s: ReturnType<typeof useGameStore>) => void, flags: string[] = ['route:limo']) {
  const store = useGameStore()
  store.newGame(); playOut(store)
  store.state.day = 5; store.state.hour = 14
  for (const f of flags) store.state.flags[f] = true
  kit(store)
  setup?.(store)
  store.screen = 'scene'
  store.playScene('finale_intro')
  return store
}

describe('the gathering', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names Limo: four acts, and with everything in hand the true ending', () => {
    const store = gathering()
    finish(store)
    expect(store.screen).toBe('end')
    expect(store.gameOver).toBe('true')
  })

  it('every act is cleared in turn: the exams run act 1, 2, 3, 4', () => {
    const seen: string[] = []
    const store = gathering()
    let guard = 0
    while (store.screen !== 'end' && guard++ < 60) {
      if (store.screen === 'scene') playOut(store)
      else if (store.screen === 'exam') { if (store.exam && !seen.includes(store.exam.def.id)) seen.push(store.exam.def.id); solve(store) }
    }
    expect(seen).toEqual(['finale_act1', 'finale_act2', 'finale_act3', 'finale_act4'])
  })

  it('without the trophy the case against him stops at the video: NORMAL END A', () => {
    const store = gathering(s => { s.state.evidence = s.state.evidence.filter(x => x !== 'E21') })
    finish(store)
    expect(store.gameOver).toBe('a')
  })

  it('with the trophy but without the SD card he never breaks: NORMAL END A', () => {
    const store = gathering(s => { s.state.evidence = s.state.evidence.filter(x => x !== 'E23') })
    finish(store)
    expect(store.gameOver).toBe('a')
  })

  it('the fingerprint report only arrives if you booked it', () => {
    const store = gathering(s => { s.state.evidence = s.state.evidence.filter(x => x !== 'E22'); s.state.flags.e22_booked = true })
    let reached = false
    let guard = 0
    while (store.screen !== 'end' && guard++ < 60) {
      if (store.screen === 'scene') playOut(store)
      else if (store.screen === 'exam') { if (store.exam?.def.id === 'finale_act4') reached = store.state.evidence.includes('E22'); solve(store) }
    }
    expect(reached).toBe(true)
  })

  it('missing evidence costs persuasion but never blocks the way', () => {
    const store = gathering(s => {
      const drop = ['E06', 'E13', 'E15', 'E17', 'E18', 'E26', 'E33', 'T13', 'E28']
      s.state.evidence = s.state.evidence.filter(x => !drop.includes(x))
      s.state.testimony = s.state.testimony.filter(x => !drop.includes(x))
    })
    finish(store)
    expect(store.screen).toBe('end')
    expect(['true', 'a', 'bad2']).toContain(store.gameOver)
  })

  it('wrong cards run the persuasion down: BAD END 2', () => {
    const store = gathering()
    playOut(store)
    expect(store.exam?.def.id).toBe('finale_act1')
    store.examGoto(1)
    for (let i = 0; i < 6; i++) store.examPresent('E12')
    expect(store.gameOver).toBe('bad2')
    expect(store.screen).toBe('end')
  })

  it('the persuasion lost in one act is still lost in the next', () => {
    const store = gathering()
    playOut(store)
    store.examGoto(1)
    store.examPresent('E12')
    solve(store)
    while (store.screen === 'scene') playOut(store)
    expect(store.exam?.def.id).toBe('finale_act2')
    expect(store.exam?.persuasion).toBeLessThanOrEqual(5)
  })
})

describe('naming somebody else', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it.each(['mengyao', 'zhengcen', 'shaoxy', 'suwen', 'lucheng'])('%s is taken away: NORMAL END B', who => {
    const store = gathering(undefined, [`route:${who}`])
    finish(store)
    expect(store.gameOver).toBe('b')
  })
})

describe('naming the boss', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the boss road: his alibi stands, and so does his guilt of another kind — NORMAL END C', () => {
    const store = gathering(undefined, ['route:boss'])
    // at the gate, stay with the boss (the last option)
    finish(store, texts => texts.length - 1)
    expect(store.gameOver).toBe('c')
  })

  it('thinking it through at the gate leads back to the real gathering', () => {
    const store = gathering(undefined, ['route:boss'])
    let seenAct1 = false
    let guard = 0
    while (store.screen !== 'end' && guard++ < 80) {
      if (store.screen === 'scene') playOut(store, texts => {
        const i = texts.findIndex(t => t.includes('雇人也得有人在现场'))
        return i >= 0 ? i : texts.length - 1
      })
      else if (store.screen === 'exam') {
        if (store.exam?.def.id === 'finale_act1') { seenAct1 = true; break }
        solve(store)
      }
    }
    expect(seenAct1).toBe(true)
  })

  it('but you cannot bluff it: without the time evidence the gate sends you back and costs persuasion', () => {
    const store = gathering(s => {
      s.state.evidence = s.state.evidence.filter(x => !['E12', 'E14'].includes(x))
    }, ['route:boss'])
    let guard = 0
    let sawAct1 = false
    while (store.screen !== 'end' && guard++ < 40) {
      if (store.screen === 'scene') playOut(store, texts => {
        const i = texts.findIndex(t => t.includes('雇人也得有人在现场'))
        // try the clever answer a few times, then give up and stay with the boss
        return i >= 0 && guard < 6 ? i : texts.length - 1
      })
      else if (store.screen === 'exam') { if (store.exam?.def.id === 'finale_act1') sawAct1 = true; solve(store) }
    }
    expect(sawAct1).toBe(false)
    expect(store.gameOver === 'c' || store.gameOver === 'bad2').toBe(true)
  })
})

describe('the road home from day 4', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resting on day 4 now leads on to day 5, not to an end screen', () => {
    const store = useGameStore()
    store.newGame(); playOut(store)
    store.state.day = 4; store.state.hour = 20
    for (const e of data.events.filter(x => x.day === 4)) store.state.flags['event:' + e.id] = true
    store.restAtHome()
    playOut(store)
    expect(store.state.day).toBe(5)
    expect(store.screen === 'hub' || store.screen === 'scene').toBe(true)
  })

  it('going home on day 5 plays the whole day through: challenge and gathering', () => {
    const store = useGameStore()
    store.newGame(); playOut(store)
    store.state.day = 5; store.state.hour = 11
    for (const e of data.events.filter(x => x.day === 5 && x.hour < 12)) store.state.flags['event:' + e.id] = true
    kit(store)
    store.restAtHome()
    let guard = 0
    while (store.screen !== 'end' && guard++ < 80) {
      if (store.screen === 'scene') playOut(store)
      else if (store.screen === 'exam') solve(store)
      else break
    }
    expect(store.screen).toBe('end')
    expect(store.gameOver).toBe('true')
  })
})
