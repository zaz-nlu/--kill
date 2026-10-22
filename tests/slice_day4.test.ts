import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner, evalCondition } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import { nextEvent } from '../src/engine/events'
import { canDeduce } from '../src/engine/deduction'
import { hasArt, resolveSprite } from '../src/engine/characters'
import { wasLimoAway } from '../src/engine/danger'
import type { GameState } from '../src/engine/types'
import type { SceneNode } from '../src/engine/script'
import { playOut, skipEvents } from './helpers'

const data = loadData()

interface Played { nodes: SceneNode[]; memory: boolean[] }
function play(state: GameState, sceneId: string, choices: number[] = [], frames: 'solve' | 'skip' = 'skip'): Played {
  const memory: boolean[] = []
  const runner = new SceneRunner(state, data.scenes, { onMemory: on => memory.push(on) })
  const queue = [...choices]
  const nodes: SceneNode[] = []
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 800) throw new Error('scene did not terminate')
    const node = runner.current()!
    nodes.push(node)
    if (node.type === 'frames' && frames === 'solve') state.flags[`frames:${node.id}:solved`] = true
    runner.advance(node.type === 'choice' ? queue.shift() ?? 0 : undefined)
  }
  return { nodes, memory }
}
const said = (s: GameState) => s.backlog.map(l => l.text).join('\n')
const day4 = (hour = 13) => { const s = createInitialState(); s.day = 4; s.hour = hour; return s }
const ids = (s: GameState) => availableActions(s, data.actions).map(a => a.id)
const due = (s: GameState) => nextEvent(s, data.events)?.id ?? null
const usesMemory = (p: Played) => p.memory.includes(true)

describe('day 4 morning: nobody hands you the clues any more', () => {
  it('the five hand-outs are gone: you have to find or earn each of those clues', () => {
    for (const id of ['day4_note', 'day4_suwen', 'day4_stairs_copy', 'day4_shaoxy_bug', 'day4_noon', 'day4_hint']) {
      expect(data.events.find(e => e.id === id), id).toBeUndefined()
      expect(data.scenes[id], id).toBeUndefined()
    }
  })

  it('the stand-up recording comes on day 4 only if you asked for it; otherwise it turns up on day 5, too late to go through it', () => {
    const ev4 = data.events.find(e => e.id === 'day4_video')!
    const asked = day4(9); asked.flags.req_video = true
    expect(evalCondition(asked, ev4.requires!)).toBe(true)
    play(asked, 'day4_video')
    expect(asked.evidence).toContain('E19')
    expect(said(asked)).toContain('送到了')
    expect(evalCondition(day4(9), ev4.requires!)).toBe(false)

    const ev5 = data.events.find(e => e.id === 'day5_video')!
    const late = day4(9); late.day = 5
    expect(evalCondition(late, ev5.requires!)).toBe(true)
    play(late, 'day5_video')
    expect(late.evidence).toContain('E19')
    late.evidence.push('E19')
    expect(evalCondition(late, ev5.requires!)).toBe(false)
  })

  it('nobody tells you to go back over his words: the day-4 hint call is gone', () => {
    expect(data.events.find(e => e.id === 'day4_hint')).toBeUndefined()
  })

  it('the day after an attack, colleagues ask about the mark — Limo asks about the pain only if the attack was a secret', () => {
    const ev = data.events.find(e => e.id === 'day4_traces')!
    expect(evalCondition(day4(9), ev.requires!)).toBe(false)
    const s = day4(9); s.flags.trace_parking = true
    expect(evalCondition(s, ev.requires!)).toBe(true)
    s.intel.attack = 'clean'
    play(s, 'day4_traces')
    expect(s.backlog.some(l => l.tag === 'T22')).toBe(true)
    const leaked = day4(9); leaked.flags.trace_parking = true; leaked.intel.attack = 'leaked'
    play(leaked, 'day4_traces')
    expect(leaked.backlog.some(l => l.tag === 'T22')).toBe(false)
  })

  it('Meng Yao: when she has been taken away Lao Han says so; otherwise she asks you to the tea house if she likes you enough', () => {
    const taken = day4(9); taken.flags.mengyao_taken = true
    play(taken, 'day4_news')
    expect(said(taken)).toContain('不肯说给了谁')
    expect(taken.flags.mengyao_teahouse).toBeUndefined()
    const friend = day4(9); friend.affinity.mengyao = 60
    play(friend, 'day4_news')
    expect(friend.flags.mengyao_teahouse).toBe(true)
    const cold = day4(9); cold.affinity.mengyao = 30
    play(cold, 'day4_news')
    expect(cold.flags.mengyao_teahouse).toBeUndefined()
  })
})

describe('day 4: Meng Yao confesses (the first flashback)', () => {
  it('4-1 the tea house is the 12:00 meal, and only if she asked you and likes you', () => {
    const s = day4(12); s.flags.mengyao_teahouse = true; s.affinity.mengyao = 60
    expect(ids(s)).toContain('4-1')
    const cold = day4(12); cold.flags.mengyao_teahouse = true; cold.affinity.mengyao = 40
    expect(ids(cold)).not.toContain('4-1')
    const never = day4(12); never.affinity.mengyao = 80
    expect(ids(never)).not.toContain('4-1')
  })

  it('4-1 gives T13 and plays the memories in grey', () => {
    const s = day4(12); s.danger = 0; s.affinity.mengyao = 60
    const p = play(s, 'act_4_1')
    expect(s.testimony).toContain('T13')
    expect(s.affinity.mengyao).toBe(80)
    expect(s.danger).toBe(15)
    expect(usesMemory(p)).toBe(true)
    expect(p.memory[p.memory.length - 1]).toBe(false)   // and it always comes back to the present
  })

  it('4-16 visiting her in custody needs trust, E13 and E05', () => {
    const s = day4(13); s.flags.mengyao_taken = true; s.trust = 60
    expect(ids(s)).not.toContain('4-16')
    s.evidence.push('E13', 'E05')
    expect(ids(s)).toContain('4-16')
    s.trust = 50
    expect(ids(s)).not.toContain('4-16')
  })

  it('4-16 gives the same confession', () => {
    const s = day4(13); s.flags.mengyao_taken = true
    const p = play(s, 'act_4_16')
    expect(s.testimony).toContain('T13')
    expect(usesMemory(p)).toBe(true)
  })

  it('there is no public breakdown at 13:00 any more: she stays shut unless you earned it', () => {
    expect(data.events.find(e => e.id === 'day4_noon')).toBeUndefined()
  })
})

describe('day 4: the recording', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('4-2 without the evening conclusion you see nothing wrong', () => {
    const s = day4(); s.evidence.push('E19')
    const p = play(s, 'act_4_2')
    expect(p.nodes.some(n => n.type === 'frames')).toBe(false)
    expect(s.evidence).not.toContain('E39')
    expect(said(s)).toContain('看不出破绽')
  })

  it('4-2 with it, solving the check gives E39, T31 and the memory of the man in the dark', () => {
    const s = day4(); s.evidence.push('E19'); s.flags.unlock_frame_check = true
    const p = play(s, 'act_4_2', [], 'solve')
    expect(p.nodes.some(n => n.type === 'frames')).toBe(true)
    expect(s.evidence).toContain('E39')
    expect(s.testimony).toEqual(expect.arrayContaining(['T31', 'T02b']))
    expect(usesMemory(p)).toBe(true)
    expect(s.danger).toBe(15)
  })

  it('4-2 with it, giving up on the check gives nothing yet', () => {
    const s = day4(); s.evidence.push('E19'); s.flags.unlock_frame_check = true
    play(s, 'act_4_2', [], 'skip')
    expect(s.evidence).not.toContain('E39')
    expect(s.testimony).not.toContain('T02b')
  })

  it('giving up on the check does not use the action up; solving it does', () => {
    const store = useGameStore()
    store.newGame(); playOut(store)
    store.state.day = 4; store.state.hour = 14
    store.state.evidence.push('E19'); store.state.flags.unlock_frame_check = true
    store.startAction('4-2')
    while (store.currentNode && store.currentNode.type !== 'frames') store.advance()
    store.skipFrames()
    playOut(store)
    expect(store.screen).toBe('hub')
    expect(store.state.flags['done:4-2']).toBeUndefined()
    expect(store.actions.map(a => a.id)).toContain('4-2')
    store.state.hour = 15
    store.startAction('4-2')
    while (store.currentNode && store.currentNode.type !== 'frames') store.advance()
    store.submitFrames(store.data.frames.e19.rows.filter(r => r.flaw).map(r => r.id))
    playOut(store)
    expect(store.state.flags['done:4-2']).toBe(true)
    expect(store.state.evidence).toContain('E39')
  })

  it('4-2 is on the menu once you have the recording', () => {
    const s = day4(); expect(ids(s)).not.toContain('4-2')
    s.evidence.push('E19')
    expect(ids(s)).toContain('4-2')
  })

  it('the early game names nobody: T02b is the first time the figure is Limo', () => {
    const t02 = data.testimony.find(t => t.id === 'T02')!
    const t02b = data.testimony.find(t => t.id === 'T02b')!
    expect(t02.desc).not.toContain('黎默')
    expect(t02b.desc).toContain('黎默')
  })

  it('asking Shao Xiaoyang to request the recording is offered in the day 3 talk about Zhou Yu', () => {
    const ask = day4(); ask.affinity.shaoxy = 70
    play(ask, 'act_3_9', [0, 0])
    expect(ask.flags.req_video).toBe(true)
    const skip = day4(); skip.affinity.shaoxy = 70
    play(skip, 'act_3_9', [0, 1])
    expect(skip.flags.req_video).toBeUndefined()
  })

  it('and in the day 2 talk about that night', () => {
    const ask = createInitialState(); ask.day = 2; ask.hour = 13; ask.affinity.shaoxy = 70
    play(ask, 'act_2_4', [1, 0])
    expect(ask.flags.req_video).toBe(true)
    const skip = createInitialState(); skip.day = 2; skip.hour = 13; skip.affinity.shaoxy = 70
    play(skip, 'act_2_4', [1, 1])
    expect(skip.flags.req_video).toBeUndefined()
    const cold = createInitialState(); cold.day = 2; cold.hour = 13; cold.affinity.shaoxy = 40
    play(cold, 'act_2_4')
    expect(cold.flags.req_video).toBeUndefined()
  })
})

describe('day 4: the afternoon', () => {
  it('14:00 the outsourcers are let go, and Limo pushes you towards the boss', () => {
    const s = day4(14)
    play(s, 'day4_announce')
    expect(said(s)).toContain('下周一')
    expect(said(s)).toContain('去问老板')
    expect(s.backlog.some(l => l.tag === 'G9')).toBe(true)
  })

  it('18:00 Limo invites you to dinner tomorrow', () => {
    const s = day4(18)
    play(s, 'day4_dinner')
    expect(s.flags.limo_dinner_invite).toBe(true)
  })

  it('4-3 fills in the lighting log when you have trust and lack it', () => {
    const s = day4(); s.trust = 50
    expect(ids(s)).toContain('4-3')
    play(s, 'act_4_3')
    expect(s.evidence).toContain('E16')
    expect(ids({ ...s, flags: { ...s.flags, 'done:4-3': true } } as GameState)).not.toContain('4-3')
    const has = day4(); has.trust = 50; has.evidence.push('E16')
    expect(ids(has)).not.toContain('4-3')
    const poor = day4(); poor.trust = 40
    expect(ids(poor)).not.toContain('4-3')
  })

  it('4-4 the fire hose cabinet: needs E15, and it is gone once you hold the trophy or lost it', () => {
    const s = day4(); s.evidence.push('E15', 'E11')
    expect(ids(s)).toContain('4-4')
    const got = day4(); got.evidence.push('E15', 'E11', 'E21')
    expect(ids(got)).not.toContain('4-4')
    const lost = day4(); lost.evidence.push('E15', 'E11'); lost.flags.e21_lost = true
    expect(ids(lost)).not.toContain('4-4')
  })

  it('4-5 handing the trophy to Lao Han raises trust and books the fingerprint result', () => {
    const s = day4(); s.evidence.push('E21'); s.trust = 20
    play(s, 'act_4_5')
    expect(s.trust).toBe(40)
    expect(s.flags.e22_booked).toBe(true)
    expect(s.flags.sd_together).toBeUndefined()
    const t = day4(); t.evidence.push('E21'); t.trust = 60
    play(t, 'act_4_5')
    expect(t.flags.sd_together).toBe(true)
  })

  it('4-6 watching Limo: the plaster, the bell, the alcohol wipes', () => {
    const s = day4()
    play(s, 'act_4_6')
    expect(s.danger).toBe(5)
    expect(said(s)).toContain('创可贴')
    expect(said(s)).toContain('铃铛')
    expect(said(s)).toContain('酒精')
  })

  it("4-7 Shao Xiaoyang's cat scratch is on the right hand — a red herring", () => {
    const s = day4()
    play(s, 'act_4_7')
    expect(said(s)).toContain('右手')
    expect(s.danger).toBe(0)
  })

  it('4-8 the overtime album, only for a close friend', () => {
    const lo = day4(); lo.affinity.shaoxy = 69
    expect(ids(lo)).not.toContain('4-8')
    const hi = day4(); hi.affinity.shaoxy = 70
    expect(ids(hi)).toContain('4-8')
    play(hi, 'act_4_8')
    expect(hi.evidence).toContain('E20')
    expect(hi.danger).toBe(10)
  })

  it('4-9 Lu Cheng: the WiFi at 60, the magnet question at 70', () => {
    const mid = day4(); mid.affinity.lucheng = 60
    play(mid, 'act_4_9')
    expect(mid.testimony).toContain('T14')
    expect(mid.testimony).not.toContain('T08b')
    const noMagnet = day4(); noMagnet.affinity.lucheng = 70
    play(noMagnet, 'act_4_9')
    expect(noMagnet.testimony).not.toContain('T08b')   // he will not say it to someone who has not shown the magnet
    const hi = day4(); hi.affinity.lucheng = 70; hi.evidence.push('E10')
    play(hi, 'act_4_9')
    expect(hi.testimony).toEqual(expect.arrayContaining(['T14', 'T08b']))
    expect(said(hi)).not.toContain('黎默')
  })

  it('4-10 who was where during the two attacks needs trust or Meng Yao', () => {
    const none = day4()
    expect(ids(none)).not.toContain('4-10')
    const t = day4(); t.trust = 50
    expect(ids(t)).toContain('4-10')
    const m = day4(); m.affinity.mengyao = 70
    expect(ids(m)).toContain('4-10')
    play(t, 'act_4_10')
    expect(t.testimony).toEqual(expect.arrayContaining(['T17', 'T18']))
    expect(t.danger).toBe(10)
  })

  it('4-12 the memorial weibo needs E24', () => {
    const s = day4()
    expect(ids(s)).not.toContain('4-12')
    s.evidence.push('E24')
    expect(ids(s)).toContain('4-12')
    play(s, 'act_4_12')
    expect(s.danger).toBe(10)
  })

  it('4-13 asking the boss about Zhou Yu needs T13 and costs his goodwill', () => {
    const s = day4(); s.testimony.push('T13')
    expect(ids(s)).toContain('4-13')
    const before = s.affinity.boss
    play(s, 'act_4_13')
    expect(s.affinity.boss).toBe(Math.max(0, before - 30))
  })

  it('4-14 updating the résumé does nothing at all', () => {
    const s = day4()
    play(s, 'act_4_14')
    expect(s.evidence).toHaveLength(0)
    expect(s.testimony).toHaveLength(0)
    expect(s.danger).toBe(0)
  })

  it('there is always something to do on day 4, even if you have nothing', () => {
    for (const h of [9, 10, 11, 13, 14, 15, 16, 17, 19, 20]) {
      const s = day4(h)
      expect(availableActions(s, data.actions).length, `hour ${h}`).toBeGreaterThan(0)
    }
    for (const h of [12, 18]) expect(availableActions(day4(h), data.actions).length, `meal ${h}`).toBeGreaterThan(0)
  })
})

describe('day 4: the trap — confronting Limo', () => {
  it('4-11 is marked as risky and asks you twice', () => {
    const a = data.actions.find(x => x.id === '4-11')!
    expect(a.label).toContain('可能会激怒对方')
    const s = day4()
    const p = play(s, 'act_4_11', [1])           // back out at the first prompt
    expect(s.affinity.limo).toBe(70)
    expect(s.flags.confronted_limo).toBeUndefined()
    expect(p.nodes.filter(n => n.type === 'choice').length).toBeGreaterThanOrEqual(1)
  })

  it('backing out at the second prompt is free too', () => {
    const s = day4()
    play(s, 'act_4_11', [0, 1])
    expect(s.affinity.limo).toBe(70)
    expect(s.danger).toBe(0)
    expect(s.flags.confronted_limo).toBeUndefined()
  })

  it('pressing on zeroes his goodwill, maxes the danger, and the trophy is lost if you do not hold it', () => {
    const s = day4()
    play(s, 'act_4_11', [0, 0])
    expect(s.affinity.limo).toBe(0)
    expect(s.danger).toBe(100)
    expect(s.flags.confronted_limo).toBe(true)
    expect(s.flags.e21_lost).toBe(true)
  })

  it('with the trophy already in hand it is not lost', () => {
    const s = day4(); s.evidence.push('E21')
    play(s, 'act_4_11', [0, 0])
    expect(s.flags.e21_lost).toBeUndefined()
  })

  it('that night, a lethal attack in which he does not hold back', () => {
    const ev = data.events.find(e => e.id === 'day4_confront_night')!
    const s = day4(21)
    expect(evalCondition(s, ev.requires!)).toBe(false)
    s.flags.confronted_limo = true
    expect(evalCondition(s, ev.requires!)).toBe(true)
    s.hp = 3; s.danger = 100
    play(s, 'day4_confront_night', [0, 0, 0])
    expect(s.hp).toBeLessThan(3)
  })
})

describe('Lao Liu has a face', () => {
  it('the driver has art for his three looks, and a default one', () => {
    expect(hasArt('laoliu')).toBe(true)
    for (const e of ['normal', 'angry', 'nervous', 'happy']) expect(resolveSprite('laoliu', e), e).not.toBeNull()
  })

  it('the alley scene shows him angry, and rattled when you shout', () => {
    const exprs = (id: string) => (data.scenes[id] as { type: string; speaker?: string; expr?: string }[])
      .filter(n => n.type === 'say' && n.speaker === 'laoliu').map(n => n.expr)
    expect(exprs('day4_laoliu')).toContain('angry')
    expect(exprs('day4_laoliu_shout')).toContain('nervous')
  })
})

describe('day 4 evening: Lao Liu at the door', () => {
  const setup = () => { const s = day4(19); s.danger = 50; return s }

  it('shouting scares him off and costs nothing, but you leave with his words', () => {
    const s = setup()
    play(s, 'day4_laoliu', [0, 1])
    expect(s.testimony).toContain('T33')
    expect(s.hp).toBe(3)
  })

  it('clutching the bag gets you pushed over, but only a dangerous night costs a point of health', () => {
    const calm = setup()
    play(calm, 'day4_laoliu', [1, 1])
    expect(calm.testimony).toContain('T33')
    expect(calm.hp).toBe(3)
    const bad = setup(); bad.danger = 95
    play(bad, 'day4_laoliu', [1, 1])
    expect(bad.hp).toBe(2)
  })

  it('telling Lao Han is worth trust', () => {
    const s = setup(); const before = s.trust
    play(s, 'day4_laoliu', [0, 0])
    expect(s.trust).toBe(before + 10)
    expect(s.flags.told_laohan_liu).toBe(true)
    const quiet = setup()
    play(quiet, 'day4_laoliu', [0, 1])
    expect(quiet.flags.told_laohan_liu).toBeUndefined()
  })

  it('the man is told apart from Limo: right hand, talks, sandalwood', () => {
    const t33 = data.testimony.find(t => t.id === 'T33')!
    for (const w of ['右手', '檀香', '皮鞋']) expect(t33.desc).toContain(w)
  })

  it('it fires at 19:30 whether or not you went home early', () => {
    const ev = data.events.find(e => e.id === 'day4_laoliu')!
    expect(ev.day).toBe(4)
    expect(ev.hour).toBe(19)
  })
})

describe('day 4 night: the fourth reasoning', () => {
  it('needs the video, the lights and the time log', () => {
    const d = data.deductions.night4
    expect(d.answer.sort()).toEqual(['E09', 'E16', 'E19'])
    const s = day4(21)
    expect(canDeduce(s, d)).toBe(false)
    s.evidence.push('E09', 'E16', 'E19')
    expect(canDeduce(s, d)).toBe(true)
  })

  it('a player who missed the third evening gets that reasoning here first', () => {
    const s = day4(21); s.evidence.push('E13', 'E15', 'E17')
    const n = new SceneRunner(s, data.scenes)
    n.start('day4_night')
    while (n.current() && n.current()!.type !== 'deduce') n.advance()
    expect(n.current()).toMatchObject({ type: 'deduce', id: 'night3' })
  })
})

describe('the reference route through day 4', () => {
  it('reaches every key piece of evidence without a dead end, and is not stopped by any trap', () => {
    const s = day4(9)
    s.trust = 60
    s.flags.unlock_frame_check = true; s.flags.mengyao_teahouse = true; s.flags.req_video = true
    s.affinity = { ...s.affinity, mengyao: 70, shaoxy: 70, lucheng: 70 }
    s.evidence.push('E05', 'E07', 'E09', 'E10', 'E11', 'E13', 'E15', 'E16', 'E24')
    s.testimony.push('T01')
    for (const id of ['day4_news', 'day4_video']) play(s, id)
    const ok = (id: string) => ids(s).includes(id)
    for (const [aid, scene] of [['4-1', 'act_4_1'], ['4-2', 'act_4_2'], ['4-4', 'act_4_4'], ['4-5', 'act_4_5'],
      ['4-8', 'act_4_8'], ['4-9', 'act_4_9'], ['4-10', 'act_4_10'], ['4-12', 'act_4_12']]) {
      s.hour = aid === '4-1' ? 12 : 14
      if (aid === '4-1') s.flags.mengyao_teahouse = true
      expect(ok(aid), aid).toBe(true)
      play(s, scene, [0], aid === '4-2' ? 'solve' : 'skip')
      s.flags[`done:${aid}`] = true
    }
    expect(s.evidence).toEqual(expect.arrayContaining(['E19', 'E39', 'E21', 'E20']))
    expect(s.testimony).toEqual(expect.arrayContaining(['T13', 'T31', 'T02b', 'T14', 'T08b', 'T17', 'T18']))
    expect(s.flags.e22_booked).toBe(true)
    expect(s.flags.sd_together).toBe(true)
    expect(s.flags.confronted_limo).toBeUndefined()
  })
})

describe('day 4 in the whole game', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('all events are in order and exist', () => {
    const evs = data.events.filter(e => e.day === 4)
    expect(evs.map(e => e.id)).toEqual(expect.arrayContaining([
      'day4_news', 'day4_video',
      'day4_traces', 'day4_announce', 'day4_dinner', 'day4_laoliu', 'day4_confront_night', 'day4_night',
    ]))
    for (const e of evs) expect(data.scenes[e.scene], e.id).toBeDefined()
  })

  it('going home on day 4 plays the evening, then the fifth day begins', () => {
    const store = useGameStore()
    store.newGame(); playOut(store)
    store.state.day = 4; store.state.hour = 15
    skipEvents(store, 4)
    store.state.flags['event:day4_laoliu'] = false
    store.state.flags['event:day4_night'] = false
    store.restAtHome()
    playOut(store)
    expect(store.state.flags['event:day4_laoliu']).toBe(true)
    expect(store.state.day).toBe(5)
    expect(store.screen === 'hub' || store.screen === 'scene').toBe(true)
  })

  it('the dev jump to the finale is only on offer once the story is over', () => {
    const store = useGameStore()
    store.state.day = 5
    expect(store.canJumpToFinale).toBe(false)
    store.state.day = 6
    expect(store.canJumpToFinale).toBe(true)
  })

  it('the stair attack of 4-4 leaves his desk empty in that hour', () => {
    const store = useGameStore()
    store.newGame(); playOut(store)
    store.state.day = 4; store.state.hour = 14
    store.state.evidence.push('E15', 'E11')
    store.startAction('4-4')
    playOut(store, () => 0)
    expect(wasLimoAway(store.state, 4, 14)).toBe(true)
  })

  it('every day 4 action has a scene and a place', () => {
    for (const a of data.actions.filter(x => x.days.includes(4))) {
      expect(a.scene ?? a.room, a.id).toBeTruthy()
      if (a.scene) expect(data.scenes[a.scene], a.id).toBeDefined()
    }
  })

  it('every action is a real scene, not a notice: at least five lines of dialogue', () => {
    const count = (nodes: SceneNode[]): number =>
      nodes.reduce((n, x) => n + (x.type === 'say' ? 1 : x.type === 'branch' ? count(x.then) + count(x.else) : 0), 0)
    for (const a of data.actions.filter(x => x.days.includes(4) && x.scene)) {
      expect(count(data.scenes[a.scene!] ?? []), a.id).toBeGreaterThanOrEqual(5)
    }
  })
})
