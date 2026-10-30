import type { DangerTier } from '../engine/danger'
import type { TuneId } from './tunes'

// What the ambience should sound like. Pure data plus one pure lookup, so it can be tested without any audio hardware.
// Notes are MIDI numbers (A4 = 69). The sound itself is made in engine.ts.

export type MoodId =
  | 'title' | 'office' | 'hr_office' | 'meeting_b' | 'stairwell' | 'cafe' | 'store' | 'police' | 'meeting_a'
  | 'street' | 'home' | 'exam' | 'ambush' | 'aftermath' | 'bad_end' | 'fail' | 'resolve'
  | 'day' | 'parking' | 'deduce' | 'limo' | 'comeback'
  | 'security' | 'server_room' | 'outsource' | 'boss_office' | 'vp_office' | 'pantry' | 'smoking' | 'lobby'
  | 'hr_outer' | 'hr_office_after'

export type Accent = 'drip' | 'clock' | 'chime' | 'car' | 'thunder' | 'creak' | 'buzz'

// The driving track of the finale (see beat.ts). `loop` is one chord per bar, `r` in semitones from `root`.
export interface BeatSpec {
  bpm: number       // tempo with nothing at stake
  maxBpm: number    // tempo with 说服力 at zero
  root: number      // MIDI note of the bass root
  loop: { r: number; minor: boolean }[]
  level: number     // 0..1
  style?: 'drive' | 'triumph'                       // 'triumph' = the comeback: major, an anthem on top
  anthem?: [number, number, number][][]             // per bar: [step, midi, length in steps]
}

export interface Mood {
  id: MoodId
  drone: { notes: number[]; wave: OscillatorType; level: number; cutoff: number } | null
  hum: number     // 0..1, mains / fluorescent hum
  rain: number    // 0..1, night only
  wind: number    // 0..1
  fan: number     // 0..1, projector / air-con noise
  melody: { root: number; scale: number[]; gap: [number, number]; level: number; voice: 'piano' | 'bell' } | null
  pulse: { bpm: number; level: number } | null
  beat: BeatSpec | null
  tune: TuneId | null   // a melodic piece (tunes.ts)
  fade?: number         // seconds to cross-fade into this mood (default 3.2)
  accents: Accent[]
  reverb: number  // 0..1
}

const quiet: Omit<Mood, 'id'> = { drone: null, hum: 0, rain: 0, wind: 0, fan: 0, melody: null, pulse: null, beat: null, tune: null, accents: [], reverb: 0.5 }
const mood = (id: MoodId, m: Partial<Omit<Mood, 'id'>>): Mood => ({ id, ...quiet, ...m })

const MINOR_PENT = [0, 3, 5, 7, 10]
const MAJOR_PENT = [0, 2, 4, 7, 9]
const DARK_PENT = [0, 1, 5, 7, 8] // Phrygian-ish, for places where something happened

// Spec 6 / section 1. Hum is the fluorescent tubes: it stops at 21:00 (see `resolveMood`).
export const MOODS: Record<MoodId, Mood> = {
  // 雨夜的大厦
  title: mood('title', {
    drone: { notes: [33, 40, 45], wave: 'sine', level: 0.38, cutoff: 500 },
    rain: 0.55, wind: 0.2, accents: ['thunder'], reverb: 0.85,
    melody: { root: 57, scale: MINOR_PENT, gap: [5, 9], level: 0.45, voice: 'bell' },
  }),
  // 17 层开放办公区
  office: mood('office', {
    drone: { notes: [38, 45], wave: 'triangle', level: 0.45, cutoff: 320 },
    hum: 0.5, fan: 0.18, rain: 0.25, reverb: 0.45,
    melody: { root: 62, scale: MINOR_PENT, gap: [12, 20], level: 0.22, voice: 'piano' },
  }),
  // 宋砚的办公室: cold, a clock, two notes a semitone apart
  hr_office: mood('hr_office', {
    drone: { notes: [33, 34, 45], wave: 'sawtooth', level: 0.3, cutoff: 220 },
    hum: 0.6, rain: 0.15, accents: ['clock', 'creak'], reverb: 0.4,
  }),
  // 会议室 B: no window, only a projector fan
  meeting_b: mood('meeting_b', {
    drone: { notes: [36, 42], wave: 'triangle', level: 0.4, cutoff: 260 },
    hum: 0.3, fan: 0.4, accents: ['creak'], reverb: 0.5,
  }),
  // 东楼梯: where 周屿 fell, and where the sensor lights go out too quickly
  stairwell: mood('stairwell', {
    drone: { notes: [31, 37], wave: 'sine', level: 0.4, cutoff: 400 },
    wind: 0.25, rain: 0.1, accents: ['drip', 'buzz'], reverb: 1,
    melody: { root: 55, scale: DARK_PENT, gap: [14, 24], level: 0.2, voice: 'bell' },
  }),
  cafe: mood('cafe', {
    drone: { notes: [41, 48, 52], wave: 'sine', level: 0.32, cutoff: 900 },
    fan: 0.1, rain: 0.3, reverb: 0.5,
    melody: { root: 65, scale: MAJOR_PENT, gap: [5, 8], level: 0.35, voice: 'piano' },
  }),
  store: mood('store', {
    drone: { notes: [40, 47], wave: 'sine', level: 0.22, cutoff: 600 },
    hum: 0.4, fan: 0.15, rain: 0.3, accents: ['chime'], reverb: 0.3,
  }),
  police: mood('police', {
    drone: { notes: [38, 45], wave: 'triangle', level: 0.28, cutoff: 350 },
    hum: 0.5, fan: 0.25, accents: ['clock'], reverb: 0.35,
    pulse: { bpm: 48, level: 0.1 },
    melody: { root: 50, scale: MINOR_PENT, gap: [16, 24], level: 0.2, voice: 'piano' },
  }),
  // 大会议室 A: the finale room
  meeting_a: mood('meeting_a', {
    drone: { notes: [33, 40, 43], wave: 'sawtooth', level: 0.32, cutoff: 300 },
    hum: 0.4, fan: 0.12, pulse: { bpm: 66, level: 0.18 }, reverb: 0.5,
  }),
  // 雨夜的街
  street: mood('street', {
    drone: { notes: [35, 42], wave: 'sine', level: 0.3, cutoff: 350 },
    rain: 0.9, wind: 0.3, accents: ['car', 'thunder'], reverb: 0.55,
  }),
  // 林一程的家: quiet enough to hear the rain, and yourself
  home: mood('home', {
    drone: { notes: [36, 43, 48], wave: 'sine', level: 0.3, cutoff: 500 },
    rain: 0.4, accents: ['clock'], reverb: 0.6,
    melody: { root: 60, scale: MINOR_PENT, gap: [8, 12], level: 0.3, voice: 'piano' },
  }),
  // 对质 / 真相博弈: a driving electronic loop (beat.ts) in A minor with a major V, over a low A pedal.
  // It speeds up and thickens as 说服力 runs out (see `examIntensity`).
  exam: mood('exam', {
    drone: { notes: [33, 45], wave: 'triangle', level: 0.18, cutoff: 320 },
    reverb: 0.4, fade: 0.5, // quick: it has to cut in the moment a weak point is clicked
    beat: {
      bpm: 148, maxBpm: 164, root: 45, level: 0.8,
      // Am | F | G | E  Am | F | Dm | E
      loop: [
        { r: 0, minor: true }, { r: -4, minor: false }, { r: -2, minor: false }, { r: -5, minor: false },
        { r: 0, minor: true }, { r: -4, minor: false }, { r: -7, minor: true }, { r: -5, minor: false },
      ],
    },
  }),
  // 袭击: the lights go, something moves. (The music is cut dead at the moment of the attack; see the 'ambush' sound.)
  ambush: mood('ambush', {
    drone: { notes: [31, 36, 37], wave: 'sawtooth', level: 0.36, cutoff: 520 },
    rain: 0.5, accents: ['buzz'], pulse: { bpm: 120, level: 0.28 }, reverb: 0.7,
  }),
  aftermath: mood('aftermath', {
    drone: { notes: [35], wave: 'sine', level: 0.25, cutoff: 300 },
    rain: 0.5, wind: 0.2, reverb: 0.8,
  }),
  bad_end: mood('bad_end', {
    drone: { notes: [29, 41], wave: 'sine', level: 0.2, cutoff: 260 },
    rain: 0.2, reverb: 0.9,
  }),
  fail: mood('fail', {
    drone: { notes: [33, 34], wave: 'sawtooth', level: 0.22, cutoff: 260 },
    rain: 0.3, reverb: 0.8,
  }),
  // 白天: a bouncy little tune. Whatever is wrong, the sun is out.
  day: mood('day', { tune: 'day', reverb: 0.3 }),
  // 深夜的 B2 停车场: sodium-lamp buzz, dripping, a car somewhere far off, and a tritone under the floor
  parking: mood('parking', {
    drone: { notes: [28, 34], wave: 'sawtooth', level: 0.3, cutoff: 190 },
    hum: 0.45, wind: 0.18, accents: ['drip', 'buzz', 'car', 'creak'], reverb: 1,
    melody: { root: 52, scale: DARK_PENT, gap: [11, 19], level: 0.14, voice: 'bell' },
  }),
  // 深夜复盘: Sherlock-style thinking, staccato strings and a cello
  deduce: mood('deduce', {
    drone: { notes: [26], wave: 'sine', level: 0.16, cutoff: 260 },
    rain: 0.22, tune: 'deduce', reverb: 0.5, fade: 1.6,
  }),
  // 黎默的主题: cold, slow, a bell that falls by thirds
  limo: mood('limo', {
    drone: { notes: [28], wave: 'sine', level: 0.16, cutoff: 240 },
    rain: 0.08, tune: 'limo', reverb: 0.75, fade: 1.2,
  }),
  // 逆境翻盘: the same band as the showdown, but in D major with an anthem on top
  comeback: mood('comeback', {
    reverb: 0.5, fade: 0.9,
    beat: {
      bpm: 152, maxBpm: 152, root: 38, level: 0.52, style: 'triumph',
      // D | A | Bm | G  D | A | G | A
      loop: [
        { r: 0, minor: false }, { r: 7, minor: false }, { r: 9, minor: true }, { r: 5, minor: false },
        { r: 0, minor: false }, { r: 7, minor: false }, { r: 5, minor: false }, { r: 7, minor: false },
      ],
      anthem: [
        [[0, 74, 6], [6, 78, 2], [8, 81, 6], [14, 78, 2]],
        [[0, 76, 6], [6, 81, 2], [8, 85, 6], [14, 81, 2]],
        [[0, 83, 6], [6, 81, 2], [8, 78, 6], [14, 74, 2]],
        [[0, 79, 6], [6, 83, 2], [8, 86, 8]],
        [[0, 86, 6], [6, 85, 2], [8, 81, 6], [14, 78, 2]],
        [[0, 81, 6], [6, 85, 2], [8, 88, 6], [14, 85, 2]],
        [[0, 86, 4], [4, 83, 4], [8, 79, 4], [12, 83, 4]],
        [[0, 85, 8], [8, 88, 4], [12, 85, 4]],
      ],
    },
  }),
  // B1 物业监控室: fluorescent tube, a wall of old monitors, a clock on the wall
  security: mood('security', {
    drone: { notes: [31, 38], wave: 'triangle', level: 0.3, cutoff: 240 },
    hum: 0.7, fan: 0.2, accents: ['clock', 'buzz'], reverb: 0.3,
  }),
  // 机房: the racks never stop
  server_room: mood('server_room', {
    drone: { notes: [38, 45], wave: 'sine', level: 0.24, cutoff: 700 },
    hum: 0.3, fan: 0.65, accents: ['buzz'], reverb: 0.25,
  }),
  // 外包区: tired keyboards, rain on a big window
  outsource: mood('outsource', {
    drone: { notes: [36, 43], wave: 'triangle', level: 0.34, cutoff: 300 },
    hum: 0.4, fan: 0.15, rain: 0.4, reverb: 0.45,
    melody: { root: 57, scale: MINOR_PENT, gap: [14, 22], level: 0.2, voice: 'piano' },
  }),
  // 老板办公室: thick carpet, a slow clock, money
  boss_office: mood('boss_office', {
    drone: { notes: [36, 43, 48], wave: 'sine', level: 0.3, cutoff: 650 },
    rain: 0.2, accents: ['clock'], reverb: 0.7,
    melody: { root: 55, scale: MINOR_PENT, gap: [12, 18], level: 0.22, voice: 'bell' },
  }),
  // 副总办公室: smaller, showier, a little too warm
  vp_office: mood('vp_office', {
    drone: { notes: [38, 41], wave: 'triangle', level: 0.28, cutoff: 420 },
    hum: 0.3, rain: 0.2, accents: ['clock'], reverb: 0.4,
  }),
  // 茶水间: a fridge, a dripping tap
  pantry: mood('pantry', {
    drone: { notes: [41, 48], wave: 'sine', level: 0.22, cutoff: 600 },
    hum: 0.35, fan: 0.22, rain: 0.3, accents: ['drip'], reverb: 0.3,
  }),
  // 吸烟区: open to the rain and the river wind
  smoking: mood('smoking', {
    drone: { notes: [35, 42], wave: 'sine', level: 0.24, cutoff: 380 },
    rain: 0.85, wind: 0.45, accents: ['car', 'drip'], reverb: 0.5,
  }),
  // 一楼大堂: marble, a lift chime, the rain on the revolving door
  lobby: mood('lobby', {
    drone: { notes: [40, 47], wave: 'sine', level: 0.26, cutoff: 700 },
    hum: 0.3, rain: 0.3, accents: ['chime'], reverb: 0.9,
  }),
  // 人事外间 after the police: a door crossed with tape, an emergency light that buzzes
  hr_outer: mood('hr_outer', {
    drone: { notes: [31, 34], wave: 'sawtooth', level: 0.26, cutoff: 200 },
    hum: 0.3, rain: 0.2, accents: ['buzz', 'clock'], reverb: 0.6,
  }),
  // 宋砚的办公室 after: the same room, the tubes off, only the clock left
  hr_office_after: mood('hr_office_after', {
    drone: { notes: [33, 34, 45], wave: 'sine', level: 0.28, cutoff: 260 },
    rain: 0.3, accents: ['clock', 'creak'], reverb: 0.7,
  }),
  // 灯亮之后
  resolve: mood('resolve', {
    drone: { notes: [45, 52, 57], wave: 'sine', level: 0.3, cutoff: 800 },
    rain: 0.15, reverb: 0.85,
    melody: { root: 69, scale: MAJOR_PENT, gap: [3, 5], level: 0.4, voice: 'bell' },
  }),
}

const BY_BACKGROUND: Record<string, MoodId> = {
  title: 'title', office: 'office', hr_office: 'hr_office', meeting_b: 'meeting_b', stairwell: 'stairwell',
  cafe: 'cafe', store: 'store', police: 'police', meeting_a: 'meeting_a', street: 'street', home: 'home',
  security: 'security', server_room: 'server_room', outsource: 'outsource', boss_office: 'boss_office',
  vp_office: 'vp_office', parking: 'parking', pantry: 'pantry', smoking: 'smoking', lobby: 'lobby',
  hr_outer: 'hr_outer', hr_office_after: 'hr_office_after',
}

// Places that carry their own lights, so the 21:00 switch-off does not silence them.
const OWN_LIGHT: ReadonlySet<MoodId> = new Set(['store', 'police', 'exam', 'meeting_a', 'parking', 'security', 'server_room', 'lobby'])

export interface MoodContext {
  screen: 'title' | 'scene' | 'hub' | 'shop' | 'investigate' | 'exam' | 'end'
  bg: string
  night: boolean
  hour: number
  sceneId: string | null              // only meaningful while screen === 'scene'
  persuasion: number | null           // only meaningful in an exam
  ending: 'hp' | 'failed' | 'clear' | null
  // the finale and the reasoning (all optional, so plain contexts stay valid)
  deducing?: boolean                  // the nightly reasoning is on screen
  againstLimo?: boolean               // the cross-examination is the one with 黎默 on the stand
  presenting?: boolean                // ...and the player is choosing evidence or an argument
  rally?: boolean                     // ...and the player is turning a lost position round
  stageMood?: MoodId | null           // a scene asked for this mood by name
}

// Attack scenes: 'opening' is the scene where someone steps out of the dark (the music is cut there), 'after' is the
// aftermath of one, 'during' is everything in between.
const ATTACK = /^(attack_|attack\d_|day\d_attack|day4_confront|day4_night_)/
const ATTACK_OPENING = /^(attack_(stairs|parking|office_night|street)|attack1_go|day3_attack2|day4_confront_night|day5_attack4)$/
const ATTACK_AFTER = /_(good|bad|tail|after|search|skip|tell)$/
export function attackKind(sceneId: string): 'opening' | 'during' | 'after' | null {
  if (!ATTACK.test(sceneId)) return null
  if (ATTACK_AFTER.test(sceneId)) return 'after'
  return ATTACK_OPENING.test(sceneId) ? 'opening' : 'during'
}

// Daytime places where the little tune plays. (Where something happened, the place keeps its own sound.)
const DAY_TUNE_AT: ReadonlySet<string> = new Set(['office', 'cafe', 'store', 'street', 'home'])

export function moodIdFor(c: MoodContext): MoodId {
  if (c.screen === 'title') return 'title'
  if (c.screen === 'end') return c.ending === 'hp' ? 'bad_end' : c.ending === 'failed' ? 'fail' : 'resolve'
  if (c.screen === 'exam') {
    // Hitting back from behind: the comeback. Choosing evidence: the showdown. 黎默 speaking: his own theme.
    if (c.rally) return 'comeback'
    if (c.againstLimo && !c.presenting) return 'limo'
    return 'exam'
  }
  if (c.screen === 'scene' && c.sceneId) {
    const id = c.sceneId
    if (id.startsWith('bad_end')) return 'bad_end'
    const attack = attackKind(id)
    if (attack) return attack === 'after' ? 'aftermath' : 'ambush'
    if (/^finale_act\d_end$/.test(id)) return 'comeback'                 // the act is won: the last blow lands on the anthem
    if (id === 'finale_intro') return 'limo'                             // 黎默 on his feet
    if (id === 'finale_boss_b_end') return 'comeback'                    // the boss is taken away
    if (id.startsWith('finale')) return 'resolve'
    if (/parking|^act_3_17/.test(id)) return 'parking'
  }
  if (c.deducing) return 'deduce'
  if (c.stageMood) return c.stageMood
  if (!c.night && c.screen !== 'investigate' && DAY_TUNE_AT.has(c.bg)) return 'day'
  return BY_BACKGROUND[c.bg] ?? 'office'
}

// 21:00 – 05:59: the tubes are off.
export const lightsOut = (hour: number): boolean => hour >= 21 || hour < 6

// The mood as it should actually sound right now: daytime has no rain, and after 21:00 the hum dies.
export function resolveMood(c: MoodContext): Mood {
  const base = MOODS[moodIdFor(c)]
  const out: Mood = { ...base }
  if (!c.night) {
    out.rain = 0
    if (base.id === 'street') out.wind = Math.min(out.wind, 0.15)
  }
  if (lightsOut(c.hour) && !OWN_LIGHT.has(base.id)) out.hum = 0
  return out
}

// 说服力 starts every act at 6. The less is left, the harder the music hits: 0 (safe) .. 1 (one mistake from losing).
// It is not part of the mood on purpose: the track keeps playing and only its tempo and thickness change.
export function examIntensity(persuasion: number | null): number {
  if (persuasion === null) return 0
  return 1 - Math.max(0, Math.min(8, persuasion)) / 8
}

// A stable key: the director only re-applies a mood when this changes.
export function moodKey(m: Mood): string {
  return JSON.stringify(m)
}

// Where the creeping fear of a rising heartbeat does not belong: the day tune, the thinking, the showdown, the endings.
const NO_DREAD: ReadonlySet<MoodId> = new Set(['day', 'deduce', 'limo', 'exam', 'comeback', 'title', 'meeting_a', 'resolve', 'fail', 'bad_end'])
const TIER_TENSION: Record<DangerTier, number> = { calm: 0, uneasy: 0.22, tense: 0.55, critical: 0.9 }

// 0..1: how wrong the night should sound. The heartbeat (danger tier) sets a floor; a scene can raise it (a long climb
// up the stairs); in the places where it happened it is a little worse.
export function tensionFor(c: MoodContext, tier: DangerTier, active: boolean, stage = 0): number {
  const id = moodIdFor(c)
  if (NO_DREAD.has(id)) return 0
  const eerie = id === 'stairwell' || id === 'parking' || id === 'ambush'
  const base = active && (c.night || eerie) ? TIER_TENSION[tier] * (eerie ? 1.15 : 1) : 0
  return Math.max(0, Math.min(1, Math.max(base, stage)))
}

export interface DangerCue { tier: DangerTier; night: boolean; active: boolean }

// Spec 6.8: footsteps from "tense" up, only on the night streets and stairs; a heartbeat from "uneasy" up.
export function dangerCue(tier: DangerTier, night: boolean, screen: MoodContext['screen']): DangerCue {
  return { tier, night, active: screen === 'scene' || screen === 'hub' || screen === 'investigate' || screen === 'shop' }
}
