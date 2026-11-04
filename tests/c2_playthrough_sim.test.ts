import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { availableSteps, isStatementCleared } from '../src/engine/crossexam'
import { actionsOnMap, openPlaces } from '../src/engine/notebook'
import { playOut } from './helpers'

// A simulated player works through case 2 on the real store, with the real exams: random order, random choices in scenes,
// random glances in the rooms, risky night work on some runs, a wrong presentation now and then. Ten seeded runs; the case
// is meant to be winnable by an ordinary player, so most of them must reach the true ending.

function rngFor(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface RunResult { won: boolean; why: string; hp: number; attacks: number; days: number; steps: number; peak: number; did: string[] }

function playRun(seed: number, opts: { wrongPresent: number; nightWork: number; avoidTalks: number; worst?: boolean }): RunResult {
  const rnd = rngFor(seed)
  setActivePinia(createPinia())
  const store = useGameStore()
  store.setRng(opts.worst ? () => 0 : rnd)   // worst case: every attack that can land, lands
  store.startChapter('c2')
  const pickRandom = (texts: string[]) => (opts.worst ? texts.length - 1 : Math.floor(rnd() * texts.length))
  const shuffle = <T,>(xs: T[]): T[] => xs.map(x => [rnd(), x] as const).sort((p, q) => p[0] - q[0]).map(p => p[1])
  const chapter = store.chapter
  // some players would rather dig on their own at night than win the two colleagues over
  const avoid = rnd() < opts.avoidTalks ? new Set(['c2-1-4', 'c2-1-5']) : new Set<string>()
  const held = () => new Set([...store.state.evidence, ...store.state.testimony])
  const visible = () => {
    const open = openPlaces(chapter.map ?? [], held(), store.state.flags)
    return actionsOnMap(store.actions, chapter.map ?? [], open)
  }

  const playExam = () => {
    let guard = 0
    while (store.screen === 'exam') {
      if (guard++ > 600) throw new Error('exam loop')
      if (store.examHold) { store.examContinue(); continue }
      const exam = store.exam!
      const sts = exam.def.statements
      let moved = false
      for (const [i, st] of sts.entries()) {
        if (isStatementCleared(exam, st.id)) continue
        const steps = availableSteps(exam, st.id)
        const step = steps.find(x => x.kind !== 'press')
        store.examGoto(i)
        if (!step) {
          if (steps.some(x => x.kind === 'press')) { store.examPress(); moved = true; break }
          continue
        }
        if (step.kind === 'present') {
          const mine = step.accepts.filter(id => held().has(id))
          if (mine.length === 0) continue
          if (rnd() < opts.wrongPresent) {
            const junk = [...held()].filter(id => !step.accepts.includes(id))
            if (junk.length) store.examPresent(junk[Math.floor(rnd() * junk.length)])
            if (store.screen !== 'exam' || store.examHold) { moved = true; break }
          }
          store.examPresent(mine[0])
        } else if (step.kind === 'argument') {
          store.examChoose(step.id, step.options.findIndex(o => o.correct))
        }
        moved = true
        break
      }
      if (!moved) break
    }
  }

  const doRoom = () => {
    let guard = 0
    while (store.screen === 'investigate' && store.room) {
      if (guard++ > 40) throw new Error('room loop')
      const open = shuffle(store.hotspots.filter(h => !h.seen))
      if (open.length === 0 || store.looksLeft === 0) { store.leaveRoom(); break }
      store.inspect(open[0].id)
      playOut(store, pickRandom)
    }
  }

  const tryAction = (a: (typeof store.actions)[number]) => {
    did.push(a.id)
    store.startAction(a.id)
    if (store.tip) store.dismissTip()
    if (store.screen === 'scene') playOut(store, pickRandom)
    // a gate that refused: hand over what the person likes, then ask again
    if (store.state.flags['urge:' + a.id] && a.npc) {
      const fav = store.data.npcs.find(n => n.id === a.npc)?.favorite
      if (fav && !store.state.inventory[fav]) store.buy(fav)
      if (fav && store.state.inventory[fav]) {
        store.startAction(a.id, fav)
        if (store.tip) store.dismissTip()
      }
    }
    if (store.screen === 'scene') playOut(store, pickRandom)
  }

  let steps = 0
  let attacks = 0
  let peak = 0
  const did: string[] = []
  while (steps++ < 1500) {
    if (store.screen === 'scene') { playOut(store, pickRandom); continue }
    if (store.screen === 'investigate') { doRoom(); continue }
    if (store.screen === 'exam') { playExam(); if (store.screen === 'exam') break; continue }
    if (store.screen === 'shop') { store.leaveShop(); continue }
    if (store.screen === 'end' || store.gameOver) break
    if (store.screen !== 'hub') break

    const all = visible().filter(a => !a.meal && !avoid.has(a.id))
    const trial = all.find(a => a.pinned)
    const others = all.filter(a => !a.pinned)
    // night work is risky; only some players take it, and only when it is the only way, or on a whim
    const bold = others.filter(a => a.risk === 'high')
    const plain = others.filter(a => a.risk !== 'high')
    const pool = [...plain, ...bold.filter(() => rnd() < opts.nightWork)]
    const before = store.state.flags.c2_attacked
    if (trial && (pool.length === 0 || rnd() < 0.2)) {
      tryAction(trial)
    } else if (pool.length > 0) {
      tryAction(shuffle(pool)[0])
    } else if (store.state.hour < (chapter.calendar[store.state.day - 1]?.lastHour ?? 21)) {
      store.waitAnHour()
    } else {
      store.restAtHome()
    }
    peak = Math.max(peak, store.state.danger)
    if (store.state.flags.c2_attacked && !before) attacks++
  }
  const won = !!store.state.flags['ending:true']
  return {
    won, hp: store.state.hp, attacks, days: store.state.day, steps, peak, did,
    why: won ? 'ok' : `${store.gameOver ?? 'stuck'} on day ${store.state.day} ${store.state.hour}:00, screen ${store.screen}, has ${store.state.evidence.length}E/${store.state.testimony.length}T`,
  }
}

describe('case 2, played end to end by simulated players', () => {
  it('ten ordinary runs: at least seven reach the true ending', () => {
    const results = Array.from({ length: 10 }, (_, i) => playRun(1000 + i * 7919, { wrongPresent: 0.15, nightWork: 0.5, avoidTalks: 0.4 }))
    for (const [i, r] of results.entries()) console.log(`run ${i + 1}: ${r.won ? 'WIN' : 'LOSE'} hp=${r.hp} attacks=${r.attacks} peak=${r.peak} ${r.why} :: ${r.did.join(' ')}`)
    expect(results.filter(r => r.won).length).toBeGreaterThanOrEqual(7)
  }, 300000)

  it('ten reckless runs (always working at night, many wrong presentations): the case still closes in most of them', () => {
    const results = Array.from({ length: 10 }, (_, i) => playRun(5000 + i * 104729, { wrongPresent: 0.3, nightWork: 1, avoidTalks: 1 }))
    for (const [i, r] of results.entries()) console.log(`reckless ${i + 1}: ${r.won ? 'WIN' : 'LOSE'} hp=${r.hp} attacks=${r.attacks} peak=${r.peak} ${r.why} :: ${r.did.join(' ')}`)
    expect(results.filter(r => r.won).length).toBeGreaterThanOrEqual(6)
  }, 300000)

  it('worst case (every possible attack lands, the player always turns round): the hero is hurt but never finished, and the case still closes', () => {
    const results = Array.from({ length: 10 }, (_, i) => playRun(9000 + i * 31, { wrongPresent: 0.3, nightWork: 1, avoidTalks: 1, worst: true }))
    for (const [i, r] of results.entries()) console.log(`worst ${i + 1}: ${r.won ? 'WIN' : 'LOSE'} hp=${r.hp} attacks=${r.attacks} peak=${r.peak} ${r.why}`)
    expect(results.every(r => r.hp >= 1)).toBe(true)
    expect(results.filter(r => r.won).length).toBeGreaterThanOrEqual(7)
  }, 300000)
})
