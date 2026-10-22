import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
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
    runner.advance(node.type === 'choice' ? queue.shift() ?? 0 : undefined)
  }
}
const tags = (s: GameState) => s.backlog.map(l => l.tag).filter(Boolean)
const said = (s: GameState) => s.backlog.map(l => l.text).join('\n')
const day3 = () => { const s = createInitialState(); s.day = 3; s.hour = 13; return s }

describe('day 3 actions: what they give and what they ask for', () => {
  it('3-1 Laohan and the C2 footage: trust opens it up in steps', () => {
    const own = day3(); own.trust = 35
    play(own, 'act_3_1')
    expect(own.evidence).not.toContain('E13')
    const open = day3(); open.trust = 45
    play(open, 'act_3_1')
    expect(open.evidence).toContain('E13')
    expect(open.evidence).not.toContain('E27')
    const full = day3(); full.trust = 55
    play(full, 'act_3_1')
    expect(full.evidence).toEqual(expect.arrayContaining(['E13', 'E27']))
    expect(full.danger).toBe(10)
  })

  it('3-1 also hands over the shop payment record if you had noticed the man in red', () => {
    const s = day3(); s.trust = 45; s.flags.clue_e25 = true
    play(s, 'act_3_1')
    expect(s.evidence).toContain('E25')
    const no = day3(); no.trust = 45
    play(no, 'act_3_1')
    expect(no.evidence).not.toContain('E25')
  })

  it('3-1 needs a little trust just to be received', () => {
    const s = day3()
    s.trust = 20
    expect(availableActions(s, data.actions).map(a => a.id)).not.toContain('3-1')
    s.trust = 30
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('3-1')
  })

  it('3-2 the building logs: with the warrant both, without it only the stairs (and it costs a meal)', () => {
    const w = day3(); w.trust = 50
    play(w, 'act_3_2')
    expect(w.evidence).toEqual(expect.arrayContaining(['E15', 'E16']))
    expect(w.danger).toBe(10)
    const treat = day3(); treat.money = 100
    play(treat, 'act_3_2', [0])
    expect(treat.evidence).toContain('E15')
    expect(treat.evidence).not.toContain('E16')
    expect(treat.money).toBe(80)
    const decline = day3()
    play(decline, 'act_3_2', [1])
    expect(decline.evidence).not.toContain('E15')
  })

  it('3-3 Su Wen breaks when shown the footage; the second lie needs the evening conclusion', () => {
    const a = day3(); a.evidence.push('E13')
    play(a, 'act_3_3', [0])
    expect(a.testimony).toContain('T10')
    expect(a.evidence).not.toContain('E14')
    expect(a.danger).toBe(15)
    const b = day3(); b.evidence.push('E13'); b.flags.unlock_suwen_lie2 = true
    play(b, 'act_3_3', [0])
    expect(b.evidence).toEqual(expect.arrayContaining(['E14', 'E12']))
  })

  it('3-3 the deleted draft log cannot be had once the boss has had it wiped', () => {
    const s = day3(); s.evidence.push('E13'); s.flags.unlock_suwen_lie2 = true; s.flags.e12_lost = true
    play(s, 'act_3_3', [0])
    expect(s.evidence).toContain('E14')
    expect(s.evidence).not.toContain('E12')
  })

  it('3-3 how you treat him afterwards matters: promise not to report +20, demand he turn himself in −10', () => {
    const soft = day3(); soft.evidence.push('E13')
    play(soft, 'act_3_3', [0])
    const hard = day3(); hard.evidence.push('E13')
    play(hard, 'act_3_3', [1])
    expect(soft.affinity.suwen).toBe(60 + 20 - 10)
    expect(hard.affinity.suwen).toBe(60 - 10 - 10)
  })

  it('3-3 needs the footage', () => {
    const s = day3()
    expect(availableActions(s, data.actions).map(a => a.id)).not.toContain('3-3')
    s.evidence.push('E13')
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('3-3')
  })

  it('3-4 the door controller: the reversal, E17 and E18, and the card becomes a secret worth keeping', () => {
    const s = day3()
    play(s, 'act_3_4')
    expect(s.evidence).toEqual(expect.arrayContaining(['E17', 'E18']))
    expect(s.danger).toBe(15)
    expect(said(s)).toContain('删除了一条记录')
  })

  it('3-4 is open to you if Su Wen has confessed, or likes you enough, and not otherwise', () => {
    const s = day3()
    s.affinity.suwen = 60
    expect(availableActions(s, data.actions).map(a => a.id)).not.toContain('3-4')
    s.affinity.suwen = 70
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('3-4')
    s.affinity.suwen = 60
    s.testimony.push('T10')
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('3-4')
  })

  it('3-5 Meng Yao: close enough and she begs for a day; telling Laohan gets her taken away', () => {
    const wait = day3(); wait.affinity.mengyao = 60
    play(wait, 'act_3_5', [0])
    expect(wait.flags.mengyao_taken).toBeUndefined()
    const tell = day3(); tell.affinity.mengyao = 60
    play(tell, 'act_3_5', [1])
    expect(tell.flags.mengyao_taken).toBe(true)
    expect(tell.trust).toBe(40)
    expect(tell.affinity.mengyao).toBe(0)
    const cold = day3(); cold.affinity.mengyao = 40
    play(cold, 'act_3_5')
    expect(said(cold)).toContain('卡丢了')
    expect(cold.flags.mengyao_taken).toBeUndefined()
  })

  it('3-6 Zheng Cen cannot lie about the lobby: he admits the kickbacks and is cleared', () => {
    const s = day3(); s.evidence.push('E25')
    play(s, 'act_3_6')
    expect(s.testimony).toContain('T11')
    expect(s.flags.zheng_cleared).toBe(true)
    expect(s.affinity.zhengcen).toBe(25)
    expect(availableActions({ ...day3(), evidence: [] } as GameState, data.actions).map(a => a.id)).not.toContain('3-6')
  })

  it('3-6 with only the scraps of the ledger (E44): he admits the kickbacks, but nothing clears him', () => {
    const s = day3(); s.evidence.push('E44')
    expect(availableActions(s, data.actions).map(a => a.id)).toContain('3-6')
    play(s, 'act_3_6')
    expect(s.testimony).toContain('T11')
    expect(s.flags.zheng_cleared).toBeUndefined()
  })

  it('3-7 Lu Cheng: a friend who can show the magnet gets Friday’s overheard line, and never a name', () => {
    const s = day3(); s.affinity.lucheng = 60; s.evidence.push('E10'); s.testimony.push('T21')
    play(s, 'act_3_7')
    expect(s.testimony).toContain('T09')
    expect(said(s)).toContain('郑岑，是我舅')
    expect(said(s)).not.toContain('黎默')
    const cold = day3(); cold.affinity.lucheng = 40; cold.evidence.push('E10')
    play(cold, 'act_3_7')
    expect(cold.testimony).not.toContain('T09')
  })

  it('3-7 without the magnet he will not talk about Friday, and without a reason he does not mention his uncle', () => {
    const s = day3(); s.affinity.lucheng = 75
    play(s, 'act_3_7')
    expect(s.testimony).not.toContain('T09')
    expect(said(s)).not.toContain('郑岑，是我舅')
    expect(said(s)).toContain('磁铁')
  })

  it('3-8 the search finds the deleted post as a snapshot', () => {
    const s = day3()
    play(s, 'act_3_8')
    expect(s.evidence).toContain('E24')
    expect(said(s)).toContain('网页快照')
  })

  it('3-9 Shao Xiaoyang opens up about Zhou Yu only if he trusts you a lot, and lets you help with his case', () => {
    const s = day3(); s.affinity.shaoxy = 75; s.evidence.push('E24')
    play(s, 'act_3_9', [0])
    expect(s.testimony).toContain('T19')
    expect(s.affinity.shaoxy).toBe(85)
    const cold = day3(); cold.affinity.shaoxy = 50; cold.evidence.push('E24')
    play(cold, 'act_3_9')
    expect(cold.testimony).not.toContain('T19')
  })

  it('3-10 telling Limo everything is a trap: it leaks every secret you hold and costs a lot of danger', () => {
    const s = day3()
    s.intel.phone = 'clean'; s.intel.draft = 'clean'; s.intel.trophy = 'clean'; s.intel.card = 'clean'
    play(s, 'act_3_10')
    expect(Object.values(s.intel).filter(v => v === 'leaked')).toHaveLength(4)
    expect(s.danger).toBe(20)
    expect(s.affinity.limo).toBe(80)
    expect(said(s)).toContain('孟遥的卡')
  })

  it('3-10 if you had not even found the card yet, he is the one who brings it up', () => {
    const s = day3()
    play(s, 'act_3_10')
    expect(said(s)).toContain('你从来没说过')
  })

  it('3-11 and 3-12 are a waste: the drinks cost ¥45 and the boss throws it back at you', () => {
    const t = day3()
    play(t, 'act_3_11')
    expect(t.money).toBe(105)
    expect(t.affinity.limo).toBe(70)       // he and Lu Cheng turn the drink down
    const b = day3()
    play(b, 'act_3_12')
    expect(b.affinity.boss).toBe(10)
  })

  it('3-13 the fire hose cabinet: you only dare open it when you have a reason', () => {
    const none = day3(); none.evidence.push('E15')
    play(none, 'act_3_13')
    expect(none.evidence).not.toContain('E21')
    const reason = day3(); reason.evidence.push('E15', 'E11')
    play(reason, 'act_3_13', [0, 0])
    expect(reason.evidence).toContain('E21')
    const alt = day3(); alt.evidence.push('E15', 'E07'); alt.testimony.push('T01')
    play(alt, 'act_3_13', [0, 0])
    expect(alt.evidence).toContain('E21')
  })

  it('3-13 shouting stops the attacker; running keeps the trophy too, and only hurts at the critical tier', () => {
    const shout = day3(); shout.evidence.push('E15', 'E11')
    play(shout, 'act_3_13', [0, 0])
    expect(shout.hp).toBe(3)
    const run = day3(); run.evidence.push('E15', 'E11')
    play(run, 'act_3_13', [0, 1])
    expect(run.evidence).toContain('E21')
    expect(run.hp).toBe(3)
    const hurt = day3(); hurt.evidence.push('E15', 'E11'); hurt.danger = 95
    play(hurt, 'act_3_13', [0, 1])
    expect(hurt.hp).toBe(1)
  })

  it('3-13 can be left alone: do not open it and nothing happens', () => {
    const s = day3(); s.evidence.push('E15', 'E11')
    play(s, 'act_3_13', [1])
    expect(s.evidence).not.toContain('E21')
  })

  it('3-15 the gloves point at Su Wen, but the footage had him in the machine room all night', () => {
    const s = day3(); s.evidence.push('E27')
    play(s, 'act_3_15')
    expect(s.evidence).toContain('E28')
    expect(said(s)).toContain('一步都没有')
  })

  it('3-16 sitting in the dark meeting room marks the night so the 21:00 attack finds you there', () => {
    const s = day3(); s.hour = 20
    play(s, 'act_3_16')
    expect(s.flags.at_office_night).toBe(true)
    expect(s.danger).toBe(10)
    expect(data.actions.find(a => a.id === '3-16')).toMatchObject({ minHour: 20, maxHour: 20 })
  })

  it('3-17 the car park is risky and gives only the stairwell log; 3-18 needs the desk to have been searched', () => {
    expect(data.actions.find(a => a.id === '3-17')).toMatchObject({ risk: 'high', attack: 'attack_parking', minHour: 19 })
    const s = day3(); s.hour = 19
    play(s, 'act_3_17')
    expect(s.evidence).toContain('E15')
    expect(s.evidence).not.toContain('E16')
    const g = day3(); g.hour = 19
    expect(availableActions(g, data.actions).map(a => a.id)).not.toContain('3-18')
    g.flags.desk_searched = true
    expect(availableActions(g, data.actions).map(a => a.id)).toContain('3-18')
  })

  it('3-18 Lao Wang names the driver and clears him: he went home at 19:12', () => {
    const s = day3(); s.hour = 19
    play(s, 'act_3_18')
    expect(s.evidence).toEqual(expect.arrayContaining(['E34', 'E41']))
  })

  it('3-19 after the boss’s offer Limo tells you not to take it, tagged G7', () => {
    const g = day3()
    expect(availableActions(g, data.actions).map(a => a.id)).not.toContain('3-19')
    g.flags.boss_offer_seen = true
    expect(availableActions(g, data.actions).map(a => a.id)).toContain('3-19')
    play(g, 'act_3_19')
    expect(tags(g)).toContain('G7')
  })
})

describe('day 3 fixed events', () => {
  it('come in the order the day unfolds', () => {
    expect(data.events.filter(e => e.day === 3).map(e => e.id)).toEqual([
      'day3_call', 'day3_morning', 'day3_noon', 'day3_boss_offer', 'day3_desk_searched',
      'day3_mengyao_taken', 'day3_laohan_call', 'day3_attack2', 'day3_night', 'day3_g8',
    ])
  })

  it('the morning: the trophy slip only if you kept the trophy to yourself, otherwise an innocent version', () => {
    const slip = day3(); slip.intel.trophy = 'clean'
    play(slip, 'day3_morning')
    expect(tags(slip)).toContain('T28')
    const leaked = day3(); leaked.intel.trophy = 'leaked'
    play(leaked, 'day3_morning')
    expect(tags(leaked)).not.toContain('T28')
    expect(said(leaked)).toContain('你不是说奖杯也被拿走了吗')
  })

  it('the morning: the "you grabbed the rail" slip needs an attack that you told nobody about', () => {
    const slip = day3(); slip.intel.attack = 'clean'; slip.flags.trace_stairs_good = true
    play(slip, 'day3_morning')
    expect(tags(slip)).toContain('T22')
    const told = day3(); told.intel.attack = 'leaked'; told.flags.trace_stairs_good = true
    play(told, 'day3_morning')
    expect(tags(told)).not.toContain('T22')
    expect(said(told)).toContain('听说你在楼梯上被人推了')
    const none = day3()
    play(none, 'day3_morning')
    expect(tags(none)).not.toContain('T22')
  })

  it('the morning: a fall instead of a grab gets its own version of the slip', () => {
    const s = day3(); s.intel.attack = 'clean'; s.flags.trace_stairs_bad = true
    play(s, 'day3_morning')
    expect(tags(s)).toContain('T22')
    expect(said(s)).toContain('脚怎么了')
  })

  it('the morning: Limo points you at the old post, and says the name if you have already found it', () => {
    const a = day3()
    play(a, 'day3_morning')
    expect(tags(a)).toContain('G6')
    expect(said(a)).not.toContain('周屿')
    const b = day3(); b.evidence.push('E24')
    play(b, 'day3_morning')
    expect(said(b)).toContain('那个外包叫周屿')
  })

  it('noon: the draft log is wiped if you do not already have it', () => {
    const lost = day3()
    play(lost, 'day3_noon')
    expect(lost.flags.e12_lost).toBe(true)
    const safe = day3(); safe.evidence.push('E12')
    play(safe, 'day3_noon')
    expect(safe.flags.e12_lost).toBeUndefined()
    expect(said(safe)).toContain('老板昨晚十点回来过')
  })

  it('the boss’s offer: refusing costs goodwill and raises the stakes, and opens the chat with Limo', () => {
    const s = day3()
    play(s, 'day3_boss_offer', [1])
    expect(s.affinity.boss).toBe(15)
    expect(s.danger).toBe(5)
    expect(s.flags.boss_offer_seen).toBe(true)
  })

  it('the desk was searched, and the cables were put back in order', () => {
    const s = day3()
    play(s, 'day3_desk_searched')
    expect(s.flags.desk_searched).toBe(true)
    expect(said(s)).toContain('按编号')
  })

  it('18:45 Laohan shows the sticky notes, E36: the heaviest clue of the first three days; and it costs the 19:00 hour', () => {
    const s = day3(); s.hour = 19
    play(s, 'day3_laohan_call')
    expect(s.evidence).toContain('E36')
    expect(s.danger).toBe(10)
    expect(s.hour).toBe(20)
    expect(data.events.find(e => e.id === 'day3_laohan_call')?.requires).toEqual({ kind: 'trustAtLeast', value: 30 })
  })

  it('the 21:00 attack follows where you are: in the office, in the car park, or merely followed', () => {
    const office = day3(); office.hour = 21; office.flags.at_office_night = true
    play(office, 'day3_attack2', [0, 0, 0, 0])
    expect(wasLimoAway(office, 3, 21)).toBe(true)
    expect(office.testimony).toEqual(expect.arrayContaining(['T16', 'T24']))
    const park = day3(); park.hour = 21; park.danger = 50
    play(park, 'day3_attack2', [0, 0, 0, 0])
    expect(wasLimoAway(park, 3, 21)).toBe(true)
    expect(park.testimony).toEqual(expect.arrayContaining(['T16', 'T23']))
    const calm = day3(); calm.hour = 21; calm.danger = 10
    play(calm, 'day3_attack2')
    expect(wasLimoAway(calm, 3, 21)).toBe(false)
    expect(calm.testimony).toEqual([])
  })

  it('22:00 Limo’s message: he agrees with whichever theory you chose', () => {
    const boss = day3(); boss.flags.bossTheory = true
    play(boss, 'day3_g8')
    expect(said(boss)).toContain('我就说是他')
    const calm = day3()
    play(calm, 'day3_g8')
    expect(said(calm)).toContain('最显眼的地方')
    expect(tags(calm)).toContain('G8')
  })

  it('22:00 if Meng Yao was taken away, he knows too much about "the card" unless you told him', () => {
    const slip = day3(); slip.flags.mengyao_taken = true; slip.intel.card = 'clean'
    play(slip, 'day3_g8')
    expect(tags(slip)).toContain('T29')
    const told = day3(); told.flags.mengyao_taken = true; told.intel.card = 'leaked'
    play(told, 'day3_g8')
    expect(tags(told)).not.toContain('T29')
  })

  it('every one of them plays to its end', () => {
    for (const e of data.events.filter(x => x.day === 3)) {
      const s = day3()
      s.hour = e.hour
      expect(() => play(s, e.scene, [0, 0, 0, 0]), e.id).not.toThrow()
    }
  })
})

describe('store: the third evening', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function evening() {
    const store = useGameStore()
    store.state.day = 3
    store.state.hour = 17
    for (const id of ['day3_call', 'day3_morning', 'day3_noon', 'day3_boss_offer', 'day3_desk_searched', 'day3_mengyao_taken', 'day3_laohan_call']) store.state.flags['event:' + id] = true
    store.state.evidence.push('E13', 'E15', 'E17', 'E24', 'E36')
    store.state.testimony.push('T12')
    return store
  }

  function toDeduction(store: ReturnType<typeof useGameStore>) {
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'deduce') {
      if (guard++ > 200) throw new Error('never reached the deduction')
      store.advance(store.currentNode.type === 'choice' ? 0 : undefined)
    }
  }

  it('going home plays the attack first and the reasoning after', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    expect(store.deduction?.def.id).toBe('night3')
  })

  it('the right three: the conclusion unlocks the frame-by-frame check on day 4', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    expect(store.submitDeduction(['E13', 'E15', 'E17']).kind).toBe('solved')
    playOut(store)
    expect(store.state.flags.unlock_frame_check).toBe(true)
  })

  it('the boss theory is the tempting wrong answer: no warning, no unlock', () => {
    const store = evening()
    store.restAtHome()
    toDeduction(store)
    expect(store.submitDeduction(['E24', 'E36', 'T12']).kind).toBe('trap')
    playOut(store)
    expect(store.state.flags.bossTheory).toBe(true)
    expect(store.state.flags.unlock_frame_check).toBeUndefined()
  })

  it('the sign-the-pledge option is the same ending as the resignation', () => {
    const store = useGameStore()
    store.screen = 'scene'
    store.playScene('day3_boss_offer')
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'choice') {
      if (guard++ > 100) throw new Error('runaway')
      store.advance()
    }
    store.advance(0)
    playOut(store)
    expect(store.gameOver).toBe('bad3')
    expect(store.screen).toBe('end')
  })

  it('going home on day 2 leads into the morning of day 3', () => {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 17
    skipEvents(store, 2)
    store.restAtHome()
    expect(store.state.day).toBe(3)
    expect(store.state.hour).toBe(8)
    expect(store.screen).toBe('hub')            // an early hour first...
    store.waitAnHour()                          // ...then 09:00: the morning events
    const first = store.currentNode
    expect(first && first.type === 'say' ? first.text : '').toContain('9 月 17 日')
  })
})

describe('the day 3 pool', () => {
  it('has something for every hour, and a mix of kinds', () => {
    const day3Acts = data.actions.filter(a => a.days.includes(3))
    expect(day3Acts.length).toBeGreaterThanOrEqual(18)
    expect(day3Acts.some(a => a.kind === 'key')).toBe(true)
    expect(day3Acts.some(a => a.kind === 'trap')).toBe(true)
    expect(day3Acts.some(a => a.kind === 'useless')).toBe(true)
  })

  it('a fresh start on day 3 still has several things to do each hour', () => {
    for (const h of [9, 10, 11, 13, 14, 15, 16, 17]) {
      const s = createInitialState()
      s.day = 3
      s.hour = h
      s.trust = 30
      expect(availableActions(s, data.actions).length, `hour ${h}`).toBeGreaterThanOrEqual(5)
    }
  })

  it('every day 3 action with a scene plays to its end', () => {
    for (const a of data.actions.filter(x => x.days.includes(3) && x.scene)) {
      const s = day3()
      s.hour = 19
      s.evidence.push('E07', 'E11', 'E13', 'E15', 'E24', 'E25', 'E27')
      s.testimony.push('T01')
      expect(() => play(s, a.scene!, [0, 0, 0, 0, 0]), a.id).not.toThrow()
    }
  })
})
