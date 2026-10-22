import { describe, expect, it } from 'vitest'
import { BeatSynth } from '../src/audio/beat'
import { makeTune, type TuneId } from '../src/audio/tunes'
import { MOODS, attackKind, moodIdFor, resolveMood, tensionFor, type MoodContext } from '../src/audio/moods'
import { loadData } from '../src/engine/data'
import { createInitialState } from '../src/engine/state'
import { SceneRunner } from '../src/engine/script'
import { fakeContext } from './fakeAudio'

const ctx = (over: Partial<MoodContext> = {}): MoodContext => ({
  screen: 'hub', bg: 'office', night: true, hour: 12, sceneId: null, persuasion: null, ending: null, ...over,
})

describe('which music plays where', () => {
  it('a bouncy tune by day in the ordinary places, the old night sound in the evening', () => {
    for (const bg of ['office', 'cafe', 'store', 'street', 'home']) {
      expect(moodIdFor(ctx({ bg, night: false })), bg).toBe('day')
      expect(moodIdFor(ctx({ bg, night: true })), bg).toBe(bg)
    }
  })

  it('the places where it happened keep their own sound, even at noon', () => {
    for (const bg of ['hr_office', 'meeting_b', 'stairwell', 'police']) expect(moodIdFor(ctx({ bg, night: false })), bg).toBe(bg)
  })

  it('the deep-night car park is its own eerie place, and so is the walk to it', () => {
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'street', sceneId: 'act_3_17' }))).toBe('parking')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'street', sceneId: 'day3_attack2_parking' }))).toBe('ambush')
    expect(MOODS.parking.hum).toBeGreaterThan(0)
    expect(resolveMood(ctx({ screen: 'scene', bg: 'street', sceneId: 'act_3_17', hour: 22 })).hum).toBeGreaterThan(0)
  })

  it('the nightly reasoning has its own thinking music, and it wins over the place', () => {
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'home', deducing: true }))).toBe('deduce')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'home', deducing: false }))).toBe('home')
    expect(MOODS.deduce.tune).toBe('deduce')
  })

  it('a scene can ask for a mood by name', () => {
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'office', stageMood: 'parking' }))).toBe('parking')
  })

  it('the cross-examination has three voices: his theme, the showdown, the comeback', () => {
    const exam = { screen: 'exam', bg: 'meeting_a', persuasion: 4 } as const
    expect(moodIdFor(ctx({ ...exam, againstLimo: true }))).toBe('limo')                     // he is speaking
    expect(moodIdFor(ctx({ ...exam, againstLimo: true, presenting: true }))).toBe('exam')   // you are choosing evidence
    expect(moodIdFor(ctx({ ...exam, againstLimo: true, presenting: true, rally: true }))).toBe('comeback')
    expect(moodIdFor(ctx({ ...exam, againstLimo: false }))).toBe('exam')                    // anyone else on the stand: the showdown
  })

  it('his theme also plays when his masks come off outside the exam; the boss being led away is the comeback', () => {
    for (const id of ['finale_intro', 'finale_act1_end', 'finale_act2_end', 'finale_act3_end', 'finale_act4_end']) {
      expect(moodIdFor(ctx({ screen: 'scene', bg: 'meeting_a', sceneId: id })), id).toBe('limo')
    }
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'meeting_a', sceneId: 'finale_boss_b_end' }))).toBe('comeback')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'meeting_a', sceneId: 'finale_e23' }))).toBe('resolve')
  })

  it('every new mood is wired to something that can actually play', () => {
    expect(MOODS.day.tune).toBe('day')
    expect(MOODS.limo.tune).toBe('limo')
    expect(MOODS.comeback.beat?.style).toBe('triumph')
    expect(MOODS.comeback.beat?.anthem?.length).toBe(MOODS.comeback.beat?.loop.length)
    for (const m of Object.values(MOODS)) expect(m.tune !== null && m.beat !== null, m.id).toBe(false)
  })
})

describe('attacks cut the music', () => {
  it('tells the scene where someone steps out of the dark from its aftermath', () => {
    for (const id of ['attack_stairs', 'attack_parking', 'attack_office_night', 'attack_street', 'attack1_go', 'day3_attack2', 'day4_confront_night', 'day5_attack4']) {
      expect(attackKind(id), id).toBe('opening')
      expect(moodIdFor(ctx({ screen: 'scene', sceneId: id })), id).toBe('ambush')
    }
    for (const id of ['attack_stairs_good', 'attack_parking_bad', 'attack1_after', 'day5_attack4_tail']) {
      expect(attackKind(id), id).toBe('after')
      expect(moodIdFor(ctx({ screen: 'scene', sceneId: id })), id).toBe('aftermath')
    }
    expect(attackKind('attack_parking_elbow')).toBe('during')
    expect(attackKind('act_1_12')).toBeNull()
    expect(attackKind('day4_night')).toBeNull()
  })

  it('every attack scene in the data is one of those three', () => {
    const data = loadData()
    const attacks = Object.keys(data.scenes).filter(id => /attack|confront/.test(id))
    expect(attacks.length).toBeGreaterThan(15)
    for (const id of attacks) expect(attackKind(id), id).not.toBeNull()
  })
})

describe('tension: the rising heartbeat makes the night sound wrong', () => {
  const night = ctx({ screen: 'hub', bg: 'home', night: true })
  it('grows with the danger tier', () => {
    const t = (tier: 'calm' | 'uneasy' | 'tense' | 'critical') => tensionFor(night, tier, true)
    expect(t('calm')).toBe(0)
    expect(t('uneasy')).toBeGreaterThan(0)
    expect(t('tense')).toBeGreaterThan(t('uneasy'))
    expect(t('critical')).toBeGreaterThan(t('tense'))
    expect(t('critical')).toBeLessThanOrEqual(1)
  })

  it('is worse where it happened, and nothing by day in an ordinary place', () => {
    const stairs = ctx({ screen: 'scene', bg: 'stairwell', night: true })
    expect(tensionFor(stairs, 'tense', true)).toBeGreaterThan(tensionFor(night, 'tense', true))
    expect(tensionFor(ctx({ bg: 'office', night: false }), 'critical', true)).toBe(0)
    expect(tensionFor(ctx({ bg: 'stairwell', night: false }), 'tense', true)).toBeGreaterThan(0)
  })

  it('a scene can raise it by itself, but it never reaches the day tune, the thinking, or the showdown', () => {
    expect(tensionFor(night, 'calm', true, 0.8)).toBeCloseTo(0.8)
    expect(tensionFor(ctx({ bg: 'office', night: false }), 'critical', true, 0.9)).toBe(0)
    expect(tensionFor(ctx({ screen: 'scene', bg: 'home', deducing: true }), 'critical', true)).toBe(0)
    expect(tensionFor(ctx({ screen: 'exam', bg: 'meeting_a' }), 'critical', false)).toBe(0)
  })

  it('stays quiet when nothing is going on (the title, the end screen)', () => {
    expect(tensionFor(ctx({ screen: 'title' }), 'critical', false)).toBe(0)
    expect(tensionFor(ctx({ screen: 'end', ending: 'clear' }), 'critical', false)).toBe(0)
  })
})

describe('the tunes', () => {
  const bar = (id: TuneId, n: number, intensity = 0) => {
    const { ctx: c, started } = fakeContext()
    const tune = makeTune(id, c, {} as AudioBuffer, { dry: c.createGain() as unknown as AudioNode, wet: c.createGain() as unknown as AudioNode })
    tune.intensity = intensity
    const len = tune.scheduleBar(n, 10)
    return { len, started }
  }

  for (const id of ['day', 'deduce', 'limo'] as const) {
    it(`${id}: plays whole bars inside their own length, forever`, () => {
      for (let n = 0; n < 17; n++) {
        const { len, started } = bar(id, n)
        expect(len).toBeGreaterThan(1)
        expect(started.length, `bar ${n}`).toBeGreaterThan(5)
        for (const s of started) {
          expect(s.at).toBeGreaterThanOrEqual(10)
          expect(s.at).toBeLessThan(10 + len + 0.5)
        }
      }
    })
  }

  it('day is a light, quick tune in sixteen bars; the thinking music is steady; his theme is slow', () => {
    expect(bar('day', 0).len * 16).toBeGreaterThan(25)
    expect(bar('day', 0).len).toBeLessThan(2.5)
    expect(bar('deduce', 0).len).toBeCloseTo(2, 1)
    expect(bar('limo', 0).len).toBeGreaterThan(bar('deduce', 0).len)
  })

  it('the deduction adds a layer on every pass: the strings, then the cello', () => {
    const a = bar('deduce', 0).started.length
    const b = bar('deduce', 8).started.length
    const c = bar('deduce', 16).started.length
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it("his theme speeds up and gets a heartbeat that matters under pressure", () => {
    const calm = bar('limo', 3, 0)
    const edge = bar('limo', 3, 1)
    expect(edge.len).toBeLessThan(calm.len)
    expect(edge.started.length).toBeGreaterThanOrEqual(calm.started.length)
  })
})

describe('the comeback', () => {
  const spec = MOODS.comeback.beat!
  const bar = (n: number) => {
    const { ctx: c, started } = fakeContext()
    const synth = new BeatSynth(c, {} as AudioBuffer, spec, { dry: c.createGain() as unknown as AudioNode, wet: c.createGain() as unknown as AudioNode })
    return { len: synth.scheduleBar(n, 10), started }
  }

  it('is a fast major-key loop of eight bars with an anthem on top', () => {
    expect(spec.loop.length).toBe(8)
    expect(spec.bpm).toBeGreaterThan(140)
    expect(spec.loop.filter(c => c.minor).length).toBeLessThan(3)
    for (const notes of spec.anthem!) for (const [step, midi, len] of notes) {
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step + len).toBeLessThanOrEqual(16)
      expect(midi).toBeGreaterThan(60)
    }
  })

  it('schedules a whole bar, with more going on than the same bar without the anthem', () => {
    const { len, started } = bar(1)
    expect(len).toBeCloseTo((60 / spec.bpm) * 4)
    const noAnthem = fakeContext()
    const plain = new BeatSynth(noAnthem.ctx, {} as AudioBuffer, { ...spec, style: 'drive', anthem: undefined }, { dry: noAnthem.ctx.createGain() as unknown as AudioNode, wet: noAnthem.ctx.createGain() as unknown as AudioNode })
    plain.scheduleBar(1, 10)
    expect(started.length).not.toBe(noAnthem.started.length)
  })
})

describe('climbing the east stairs (1-12) is a series of choices', () => {
  const data = loadData()

  function climb(plan: (texts: string[]) => number, state = createInitialState()) {
    const runner = new SceneRunner(state, data.scenes)
    const picks: string[] = []
    runner.start('act_1_12')
    let guard = 0
    while (runner.current()) {
      if (guard++ > 400) throw new Error('runaway')
      const node = runner.current()!
      if (node.type === 'choice') {
        const texts = node.options.map(o => o.text)
        const i = plan(texts)
        picks.push(texts[i])
        runner.advance(i)
      } else runner.advance()
    }
    return { state, picks }
  }

  const farthest = (texts: string[]) => {
    const ups = texts.map((x, i) => (x.startsWith('上到') ? i : -1)).filter(i => i >= 0)
    if (ups.length) return ups[ups.length - 1]
    const rest = texts.findIndex(x => x.startsWith('在平台'))
    return rest >= 0 ? rest : texts.length - 1
  }

  it('offers a few floors to go to, a rest, and the way back down', () => {
    const first = data.scenes['stm_0_4'][0]
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    const texts = first.options.map(o => o.text)
    expect(texts.filter(t => t.startsWith('上到')).length).toBe(3)
    expect(texts.some(t => t.includes('3 层'))).toBe(true)
    expect(texts.some(t => t.includes('9 层'))).toBe(true)
    expect(texts.some(t => t.startsWith('在平台'))).toBe(false)   // fresh legs do not need a rest
    expect(texts.at(-1)).toBe('不爬了，下楼')
  })

  it('the farther you go in one go, the more it costs, and you cannot go farther than you can stand', () => {
    const m = data.scenes['stm_3_1'][0]
    if (m.type !== 'choice') throw new Error('not a menu')
    expect(m.options.filter(o => o.text.startsWith('上到')).length).toBe(1)      // one breath left: one landing
    const dead = data.scenes['stm_3_0'][0]
    if (dead.type !== 'choice') throw new Error('not a menu')
    expect(dead.options.filter(o => o.text.startsWith('上到')).length).toBe(0)   // none left: rest or go down
  })

  it('getting to the top takes at least two rests, adds danger for each, and still hands over the magnet', () => {
    const { state, picks } = climb(farthest)
    const rests = picks.filter(p => p.startsWith('在平台')).length
    expect(rests).toBeGreaterThanOrEqual(2)
    expect(state.evidence).toContain('E10')
    expect(state.flags.stairs_top).toBe(true)
    expect(state.danger).toBeGreaterThanOrEqual(10 + 3 * rests)
  })

  it('giving up on the way down leaves the action on offer: no magnet, no flag', () => {
    const { state } = climb(texts => (texts.some(t => t.startsWith('上到')) ? 0 : texts.length - 1))
    expect(state.evidence).not.toContain('E10')
    expect(state.flags.stairs_top).toBeUndefined()
    const a = data.actions.find(x => x.id === '1-12')!
    expect(a.until).toBe('stairs_top')
  })

  it('the stairwell gets more wrong the higher you go and the more tired you are', () => {
    const tension = (id: string): number => {
      const s = data.scenes[id].find(n => n.type === 'music')
      return s && s.type === 'music' ? s.tension ?? 0 : -1
    }
    expect(tension('st_1_4')).toBeLessThan(tension('st_3_4'))
    expect(tension('st_3_4')).toBeLessThan(tension('st_5_4'))
    expect(tension('st_4_4')).toBeLessThan(tension('st_4_0'))     // same landing, no breath left
    expect(tension('st_6_0')).toBeLessThanOrEqual(0.95)
    expect(tension('str_4_0')).toBeGreaterThan(tension('st_4_0'))   // sitting in the dark is worse still
  })

  it('a music node reaches the hook with the mood and/or the tension it names', () => {
    const scenes = { ...data.scenes, __t: [
      { type: 'music', tension: 0.6 },
      { type: 'say', speaker: 'narration', text: 'x' },
      { type: 'music', mood: 'parking' },
      { type: 'say', speaker: 'narration', text: 'y' },
    ] } as typeof data.scenes
    const seen: { mood?: string; tension?: number }[] = []
    const runner = new SceneRunner(createInitialState(), scenes, { onMusic: m => { seen.push(m) } })
    runner.start('__t')
    while (runner.current()) runner.advance()
    expect(seen).toEqual([{ mood: undefined, tension: 0.6 }, { mood: 'parking', tension: undefined }])
  })
})
