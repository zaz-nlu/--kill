import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { wasLimoAway } from '../src/engine/danger'
import type { GameState } from '../src/engine/types'
import { playOut, skipEvents } from './helpers'

const data = loadData()

function play(state: GameState, sceneId: string, choices: number[] = []): void {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error('scene did not terminate')
    const node = runner.current()!
    if (node.type === 'choice') {
      if (queue.length === 0) throw new Error(`no scripted choice for ${sceneId}`)
      runner.advance(queue.shift())
    } else runner.advance()
  }
}
const tags = (s: GameState) => s.backlog.map(l => l.tag).filter(Boolean)
const text = (s: GameState) => s.backlog.map(l => l.text).join('\n')

describe('day 2 actions: what they give', () => {
  it('2-1 the lights-out email: E09 and a little danger', () => {
    const s = createInitialState()
    play(s, 'act_2_1')
    expect(s.evidence).toContain('E09')
    expect(s.danger).toBe(5)
  })

  it('2-4 Shao Xiaoyang: close enough, he gives T07a and T21; with E26 in hand, also E33', () => {
    const s = createInitialState()
    s.affinity.shaoxy = 60
    s.evidence.push('E26')
    play(s, 'act_2_4', [1, 1])
    expect(s.testimony).toEqual(expect.arrayContaining(['T07a', 'T21']))
    expect(s.evidence).toContain('E33')
    expect(s.danger).toBe(5)
  })

  it('2-4 without E26 he does not mention the tickets', () => {
    const s = createInitialState()
    s.affinity.shaoxy = 60
    play(s, 'act_2_4', [1, 1])
    expect(s.evidence).not.toContain('E33')
  })

  it('2-4 lukewarm: a vague answer; cold: a refusal; neither gives testimony', () => {
    const mid = createInitialState()
    mid.affinity.shaoxy = 45
    play(mid, 'act_2_4')
    expect(mid.testimony).not.toContain('T07a')
    expect(text(mid)).toContain('就正常开会，大家都在')
    const cold = createInitialState()
    cold.affinity.shaoxy = 10
    play(cold, 'act_2_4')
    expect(text(cold)).toContain('别把我们外包扯进来')
  })

  it('2-4 even a friend only says that “someone” reported first: no name, and he will not say who', () => {
    const s = createInitialState()
    s.affinity.shaoxy = 70
    play(s, 'act_2_4', [1, 1])
    expect(s.testimony).toContain('T07a')
    expect(text(s)).toContain('我不想乱说')
    expect(text(s)).not.toContain('黎默')
  })

  it('2-4 lukewarm, holding the booking record: he wants to know where you got it, and gives nothing yet', () => {
    const s = createInitialState()
    s.affinity.shaoxy = 40
    s.evidence.push('E26')
    play(s, 'act_2_4')
    expect(s.testimony).not.toContain('T07a')
    expect(text(s)).toContain('先让我信得过你')
  })

  it('2-4 telling him what you know counts as telling the outsourcers (the phone and the draft leak)', () => {
    const s = createInitialState()
    s.affinity.shaoxy = 60
    s.intel.phone = 'clean'
    s.intel.draft = 'clean'
    play(s, 'act_2_4', [0])
    expect(s.intel.phone).toBe('leaked')
    expect(s.intel.draft).toBe('leaked')
    expect(s.affinity.shaoxy).toBe(63)
  })

  it('2-5 Su Wen: warm gives the autosave time E12, cold slams the door', () => {
    const warm = createInitialState()
    play(warm, 'act_2_5')
    expect(warm.evidence).toContain('E12')
    expect(warm.danger).toBe(10)
    const cold = createInitialState()
    cold.affinity.suwen = 30
    play(cold, 'act_2_5')
    expect(cold.evidence).not.toContain('E12')
  })

  it('2-7 Zheng Cen: if you know about the shop, he is rattled; if not, he lies and you may push', () => {
    const knows = createInitialState()
    knows.flags.clue_e25 = true
    play(knows, 'act_2_7')
    expect(knows.affinity.zhengcen).toBe(30)
    const lie = createInitialState()
    play(lie, 'act_2_7', [0])
    expect(lie.affinity.zhengcen).toBe(35)
    const calm = createInitialState()
    play(calm, 'act_2_7', [1])
    expect(calm.affinity.zhengcen).toBe(40)
  })

  it('2-8 the boss: refusing costs goodwill and gets you his question (T12)', () => {
    const s = createInitialState()
    play(s, 'act_2_8', [1])
    expect(s.testimony).toContain('T12')
    expect(s.affinity.boss).toBe(20)
  })

  it('2-8 the boss knows if you stood at his gate', () => {
    const s = createInitialState()
    s.flags.visited_boss_home = true
    play(s, 'act_2_8', [1])
    expect(text(s)).toContain('跑到我家楼下')
  })

  it('2-10 Laohan: every honest clue counts once, the blame on Zheng Cen costs trust', () => {
    const s = createInitialState()
    s.evidence.push('E10', 'E11')
    s.testimony.push('T06')
    s.flags['deduce:night1:solved'] = true
    play(s, 'act_2_10', [0, 0, 0, 0])
    expect(s.trust).toBe(20 + 10 + 10 + 10 - 5)
    expect(s.testimony).toContain('T30')
    expect(text(s)).toContain('我们没有对外说过')
  })

  it('2-10 nothing to hand over: he just sends you off', () => {
    const s = createInitialState()
    play(s, 'act_2_10')
    expect(s.trust).toBe(20)
    expect(text(s)).toContain('没别的了')
  })

  it('2-10 a clue can be handed over only once', () => {
    const s = createInitialState()
    s.evidence.push('E10')
    play(s, 'act_2_10', [0])
    play(s, 'act_2_10')                      // second visit: the option no longer appears
    expect(s.trust).toBe(30)
  })

  it('2-11 staying until nine is high-risk and ends on the dark floor', () => {
    const a = data.actions.find(x => x.id === '2-11')!
    expect(a).toMatchObject({ minHour: 20, risk: 'high', attack: 'attack_office_night' })
    const s = createInitialState()
    play(s, 'act_2_11')
    expect(s.danger).toBe(5)
    expect(text(s)).toContain('机房')
  })

  it('2-12 to 2-15: the useless and the dangerous ones', () => {
    const w = createInitialState()
    play(w, 'act_2_12')
    expect(w.affinity.boss).toBe(28)
    const g = createInitialState()
    play(g, 'act_2_13')
    expect(g.affinity.mengyao).toBe(40)
    const t = createInitialState()
    play(t, 'act_2_14')
    expect(t.trust).toBe(-10)
    expect(data.actions.find(x => x.id === '2-14')?.costHours).toBe(2)
    expect(data.actions.find(x => x.id === '2-15')).toMatchObject({ risk: 'high', attack: 'attack_stairs' })
  })

  it('2-18 chatting with Limo on your own initiative brings the old case, both lines logged and tagged', () => {
    const s = createInitialState()
    play(s, 'act_2_18', [0])
    expect(tags(s)).toEqual(expect.arrayContaining(['G4', 'G5']))
    expect(s.affinity.limo).toBe(73)
  })

  it('the meeting room booking screen gives E26', () => {
    const s = createInitialState()
    play(s, 'inspect_mb_booking')
    expect(s.evidence).toContain('E26')
    expect(data.rooms.find(r => r.id === 'meeting_b')!.hotspots.map(h => h.id)).toContain('mb_booking')
  })

  it('finding the missing projector bag also raises the stakes a little', () => {
    const s = createInitialState()
    play(s, 'inspect_mb_projector')
    expect(s.evidence).toContain('E11')
    expect(s.danger).toBe(5)
  })
})

describe('day 2 fixed events', () => {
  it('are in the order the day unfolds, and the street attack only if you stayed away from the stairs', () => {
    const ids = data.events.filter(e => e.day === 2).map(e => e.id)
    expect(ids).toEqual(['day2_meeting', 'day2_desk', 'day2_lunch', 'day2_anon', 'day2_dinner', 'day2_street', 'day2_boss_msg', 'day2_sms', 'day2_night'])
    expect(data.events.find(e => e.id === 'day2_street')?.requires).toEqual({ kind: 'flag', key: 'attack1_pending' })
  })

  it('every one of them plays to the end', () => {
    for (const e of data.events.filter(x => x.day === 2)) {
      const s = createInitialState()
      expect(() => play(s, e.scene, [0, 0, 0]), e.id).not.toThrow()
    }
  })
})

describe('the 15:00 attack', () => {
  it('going to the stairs and grabbing the rail: you hear the bell, Limo is marked away, you may search', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 15
    play(s, 'day2_anon', [0, 0, 1])           // go, grab the rail, do not search
    expect(s.testimony).toContain('T15')
    expect(s.intel.attack).toBe('clean')
    expect(s.evidence).not.toContain('E31')
    expect(wasLimoAway(s, 2, 15)).toBe(true)
  })

  it('looking back instead: no bell, but the orange sleeve and the same flag', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 15
    play(s, 'day2_anon', [0, 1, 1])
    expect(s.testimony).not.toContain('T15')
    expect(s.flags.trace_stairs_bad).toBe(true)
    expect(wasLimoAway(s, 2, 15)).toBe(true)
  })

  it('searching the landing afterwards finds the alcohol swab, costs an hour and adds danger', () => {
    const s = createInitialState()
    s.day = 2
    s.hour = 15
    play(s, 'day2_anon', [0, 0, 0])
    expect(s.evidence).toContain('E31')
    expect(s.danger).toBe(10)
    expect(s.hour).toBe(16)
  })

  it('staying away, or telling Laohan, postpones the attack to 19:00 at the subway exit', () => {
    for (const pick of [1, 2]) {
      const s = createInitialState()
      s.day = 2
      s.hour = 15
      play(s, 'day2_anon', [pick])
      expect(s.flags.attack1_pending, `pick ${pick}`).toBe(true)
      expect(s.testimony).not.toContain('T15')
    }
  })

  it('the 19:00 street scene marks Limo away and hands over to the street attack', () => {
    const s = createInitialState()
    s.day = 2
    play(s, 'day2_street', [0])
    expect(wasLimoAway(s, 2, 19)).toBe(true)
  })
})

describe('store: the evening of day 2', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function evening() {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 17
    for (const id of ['day2_meeting', 'day2_desk', 'day2_lunch', 'day2_anon', 'day2_dinner']) store.state.flags['event:' + id] = true
    store.state.evidence.push('E09')
    store.state.testimony.push('T05', 'T02', 'T12')
    return store
  }

  function toDeduction(store: ReturnType<typeof useGameStore>) {
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'deduce') {
      if (guard++ > 100) throw new Error('never reached the deduction')
      store.advance()
    }
  }

  it('going home still plays the 20:30 message, the 21:00 text and then the reasoning', () => {
    const store = evening()
    store.restAtHome()
    expect(store.screen).toBe('scene')
    const seen: string[] = []
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'deduce') {
      if (guard++ > 100) throw new Error('runaway')
      if (store.currentNode.type === 'say') seen.push(store.currentNode.text)
      store.advance()
    }
    expect(seen.join('\n')).toContain('谈谈你的奖金')
    expect(seen.join('\n')).toContain('再查下去，你会和她一样')
    expect(store.deduction?.def.id).toBe('night2')
  })

  it('the right three clues: the conclusion is unlocked and no penalty', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    expect(store.submitDeduction(['E09', 'T05', 'T02']).kind).toBe('solved')
    playOut(store)
    expect(store.state.flags.unlock_suwen_lie2).toBe(true)
    expect(store.state.flags.bossTheory).toBeUndefined()
  })

  it('the boss theory is accepted without a word of warning, and costs you the conclusion', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    expect(store.submitDeduction(['T12', 'E09']).kind).toBe('trap')
    playOut(store)
    expect(store.state.flags.bossTheory).toBe(true)
    expect(store.state.flags.unlock_suwen_lie2).toBeUndefined()
  })

  it('three wrong tries hand you the answer, at the price of persuasion', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    store.submitDeduction(['E09', 'T05'])
    store.submitDeduction(['E09', 'T02'])
    expect(store.submitDeduction(['T05', 'T02']).kind).toBe('forced')
    playOut(store)
    expect(store.state.flags.unlock_suwen_lie2).toBe(true)
    expect(store.state.flags['deduce:night2:forced']).toBe(true)
  })

  it('without the pieces the evening passes quietly', () => {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 17
    for (const id of ['day2_meeting', 'day2_desk', 'day2_lunch', 'day2_anon', 'day2_dinner']) store.state.flags['event:' + id] = true
    skipEvents(store, 3)                     // day 3 has its own tests
    store.restAtHome()
    playOut(store)
    expect(store.deduction).toBeNull()
    expect(store.state.flags.unlock_suwen_lie2).toBeUndefined()
    expect(store.state.day).toBe(3)
    expect(store.screen).toBe('hub')
  })
})

describe('BAD END 3', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('signing the resignation ends the run', () => {
    const store = useGameStore()
    store.screen = 'scene'
    store.playScene('act_2_8')
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'choice') {
      if (guard++ > 100) throw new Error('runaway')
      store.advance()
    }
    store.advance(0)                       // 签字
    playOut(store)
    expect(store.gameOver).toBe('bad3')
    expect(store.screen).toBe('end')
  })
})

describe('the day 2 pool has something for every kind of player', () => {
  it('has at least one key action and one useless-or-trap action each hour', () => {
    const day2 = data.actions.filter(a => a.days.includes(2))
    expect(day2.filter(a => a.kind === 'key').length).toBeGreaterThanOrEqual(5)
    expect(day2.filter(a => a.kind === 'useless' || a.kind === 'trap').length).toBeGreaterThanOrEqual(4)
  })

  it('every day 2 action plays to its end', () => {
    for (const a of data.actions.filter(x => x.days.includes(2) && x.scene)) {
      const s = createInitialState()
      s.evidence.push('E07')
      expect(() => play(s, a.scene!, [0, 0, 0, 0, 0]), a.id).not.toThrow()
    }
  })
})
