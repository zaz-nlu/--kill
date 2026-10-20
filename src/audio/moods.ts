import type { DangerTier } from '../engine/danger'

// What the ambience should sound like. Pure data plus one pure lookup, so it can be tested without any audio hardware.
// Notes are MIDI numbers (A4 = 69). The sound itself is made in engine.ts.

export type MoodId =
  | 'title' | 'office' | 'hr_office' | 'meeting_b' | 'stairwell' | 'cafe' | 'store' | 'police' | 'meeting_a'
  | 'street' | 'home' | 'exam' | 'ambush' | 'aftermath' | 'bad_end' | 'fail' | 'resolve'

export type Accent = 'drip' | 'clock' | 'chime' | 'car' | 'thunder' | 'creak' | 'buzz'

export interface Mood {
  id: MoodId
  drone: { notes: number[]; wave: OscillatorType; level: number; cutoff: number } | null
  hum: number     // 0..1, mains / fluorescent hum
  rain: number    // 0..1, night only
  wind: number    // 0..1
  fan: number     // 0..1, projector / air-con noise
  melody: { root: number; scale: number[]; gap: [number, number]; level: number; voice: 'piano' | 'bell' } | null
  pulse: { bpm: number; level: number } | null
  accents: Accent[]
  reverb: number  // 0..1
}

const quiet: Omit<Mood, 'id'> = { drone: null, hum: 0, rain: 0, wind: 0, fan: 0, melody: null, pulse: null, accents: [], reverb: 0.5 }
const mood = (id: MoodId, m: Partial<Omit<Mood, 'id'>>): Mood => ({ id, ...quiet, ...m })

const MINOR_PENT = [0, 3, 5, 7, 10]
const MAJOR_PENT = [0, 2, 4, 7, 9]
const DARK_PENT = [0, 1, 5, 7, 8] // Phrygian-ish, for places where something happened
const CLUSTER = [0, 1, 6, 7]

// Spec 6 / section 1. Hum is the fluorescent tubes: it stops at 21:00 (see `resolveMood`).
export const MOODS: Record<MoodId, Mood> = {
  // 雨夜的大厦
  title: mood('title', {
    drone: { notes: [33, 40, 45], wave: 'sine', level: 0.5, cutoff: 500 },
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
    hum: 0.3, fan: 0.55, accents: ['creak'], reverb: 0.5,
  }),
  // 东楼梯: where 周屿 fell, and where the sensor lights go out too quickly
  stairwell: mood('stairwell', {
    drone: { notes: [31, 37], wave: 'sine', level: 0.5, cutoff: 400 },
    wind: 0.35, rain: 0.1, accents: ['drip', 'buzz'], reverb: 1,
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
  // 对质: a pulse that quickens as 说服力 runs out (see `resolveMood`)
  exam: mood('exam', {
    drone: { notes: [33, 40, 44], wave: 'sawtooth', level: 0.34, cutoff: 380 },
    hum: 0.25, pulse: { bpm: 92, level: 0.28 }, reverb: 0.45,
    melody: { root: 57, scale: CLUSTER, gap: [3, 5], level: 0.2, voice: 'piano' },
  }),
  // 袭击: the lights go, something moves
  ambush: mood('ambush', {
    drone: { notes: [31, 36, 37], wave: 'sawtooth', level: 0.5, cutoff: 520 },
    rain: 0.5, accents: ['buzz'], pulse: { bpm: 120, level: 0.35 }, reverb: 0.7,
  }),
  aftermath: mood('aftermath', {
    drone: { notes: [35], wave: 'sine', level: 0.25, cutoff: 300 },
    rain: 0.5, wind: 0.2, reverb: 0.8,
  }),
  bad_end: mood('bad_end', {
    drone: { notes: [29], wave: 'sine', level: 0.4, cutoff: 200 },
    rain: 0.2, reverb: 0.9,
  }),
  fail: mood('fail', {
    drone: { notes: [33, 34], wave: 'sawtooth', level: 0.22, cutoff: 260 },
    rain: 0.3, reverb: 0.8,
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
}

// Places that carry their own lights, so the 21:00 switch-off does not silence them.
const OWN_LIGHT: ReadonlySet<MoodId> = new Set(['store', 'police', 'exam', 'meeting_a'])

export interface MoodContext {
  screen: 'title' | 'scene' | 'hub' | 'shop' | 'investigate' | 'exam' | 'end'
  bg: string
  night: boolean
  hour: number
  sceneId: string | null              // only meaningful while screen === 'scene'
  persuasion: number | null           // only meaningful in an exam
  ending: 'hp' | 'failed' | 'clear' | null
}

export function moodIdFor(c: MoodContext): MoodId {
  if (c.screen === 'title') return 'title'
  if (c.screen === 'end') return c.ending === 'hp' ? 'bad_end' : c.ending === 'failed' ? 'fail' : 'resolve'
  if (c.screen === 'exam') return 'exam'
  if (c.screen === 'scene' && c.sceneId) {
    if (c.sceneId.startsWith('bad_end')) return 'bad_end'
    if (c.sceneId.endsWith('_end') && c.sceneId.startsWith('finale')) return 'resolve'
    if (c.sceneId.startsWith('attack_')) return /_(good|bad)$/.test(c.sceneId) ? 'aftermath' : 'ambush'
  }
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
  if (base.id === 'exam' && base.pulse && c.persuasion !== null) {
    // 说服力 starts at 5, tops out at 7. The less is left, the harder it hits.
    const pressure = 1 - Math.max(0, Math.min(7, c.persuasion)) / 7
    out.pulse = { bpm: Math.round(base.pulse.bpm + pressure * 36), level: base.pulse.level + pressure * 0.2 }
    if (base.drone) out.drone = { ...base.drone, cutoff: base.drone.cutoff + pressure * 500 }
  }
  return out
}

// A stable key: the director only re-applies a mood when this changes.
export function moodKey(m: Mood): string {
  return JSON.stringify(m)
}

export interface DangerCue { tier: DangerTier; night: boolean; active: boolean }

// Spec 6.8: footsteps from "tense" up, only on the night streets and stairs; a heartbeat from "uneasy" up.
export function dangerCue(tier: DangerTier, night: boolean, screen: MoodContext['screen']): DangerCue {
  return { tier, night, active: screen === 'scene' || screen === 'hub' || screen === 'investigate' || screen === 'shop' }
}
