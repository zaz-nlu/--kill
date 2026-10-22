// The melodic pieces: a day tune, the late-night deduction, and 黎默's theme. Like the showdown track (beat.ts) they are
// made from oscillators and noise and scheduled a bar at a time on the audio clock, so they only need a BaseAudioContext.

import type { BeatOut } from './beat'

export type TuneId = 'day' | 'deduce' | 'limo'

export interface Tune {
  intensity: number                                   // 0..1, how much is at stake (only some tunes listen)
  scheduleBar(bar: number, t0: number): number        // schedules one bar and returns its length in seconds
}

type Adopt = <T extends AudioNode>(n: T) => T

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)

// Shared voices. Every tune routes into `dry` (straight to the mix) and `wet` (through the room).
abstract class Voices {
  protected readonly dry: GainNode
  protected readonly wet: GainNode

  protected constructor(protected readonly ctx: BaseAudioContext, protected readonly white: AudioBuffer, out: BeatOut, level: number, adopt: Adopt) {
    this.dry = adopt(ctx.createGain())
    this.dry.gain.value = level
    this.dry.connect(out.dry)
    this.wet = adopt(ctx.createGain())
    this.wet.gain.value = level
    this.wet.connect(out.wet)
  }

  protected env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  protected noise(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number): void {
    const s = this.ctx.createBufferSource()
    s.buffer = this.white
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    this.env(g, t, peak, 0.001, dur)
    s.connect(f)
    f.connect(g)
    g.connect(dest)
    s.start(t, Math.random() * 2)
    s.stop(t + dur + 0.05)
  }

  protected tone(dest: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, decay: number, endF?: number): void {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (endF) o.frequency.exponentialRampToValueAtTime(endF, t + attack + decay)
    const g = this.ctx.createGain()
    this.env(g, t, peak, attack, decay)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + attack + decay + 0.1)
  }

  // a wooden bar: a sine with a quick overtone and a tick of noise
  protected marimba(t: number, midi: number, v: number, dest: AudioNode = this.dry): void {
    const f = mtof(midi)
    this.tone(dest, 'sine', f, t, v, 0.002, 0.42)
    this.tone(dest, 'sine', f * 4, t, v * 0.22, 0.001, 0.09)
    this.noise(dest, t, 0.015, 'bandpass', Math.min(5000, f * 3), 2, v * 0.12)
  }

  protected glock(t: number, midi: number, v: number): void {
    const f = mtof(midi)
    this.tone(this.wet, 'sine', f, t, v, 0.002, 1.1)
    this.tone(this.wet, 'sine', f * 2.76, t, v * 0.25, 0.002, 0.5)
  }

  // a soft felt piano
  protected piano(t: number, midi: number, v: number, dest: AudioNode = this.wet): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = Math.min(4200, f * 4)
    lp.connect(dest)
    this.tone(lp, 'triangle', f, t, v, 0.006, 1.7)
    this.tone(lp, 'sine', f * 2, t, v * 0.25, 0.004, 0.9)
  }

  // a plucked bass
  protected pluckBass(t: number, midi: number, v: number, decay = 0.24): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(900, t)
    lp.frequency.exponentialRampToValueAtTime(240, t + decay)
    lp.connect(this.dry)
    this.tone(lp, 'triangle', f, t, v, 0.004, decay)
    this.tone(this.dry, 'sine', f, t, v * 0.6, 0.004, decay * 1.2)
  }

  // a short bowed-string stab (staccato)
  protected stac(t: number, midi: number, v: number, decay = 0.1): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 2
    lp.frequency.setValueAtTime(3600, t)
    lp.frequency.exponentialRampToValueAtTime(1100, t + decay)
    const g = this.ctx.createGain()
    this.env(g, t, v, 0.004, decay)
    lp.connect(g)
    g.connect(this.dry)
    for (const cents of [-7, 7]) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = cents
      o.connect(lp)
      o.start(t)
      o.stop(t + decay + 0.1)
    }
  }

  // a held cello note with a little vibrato
  protected cello(t: number, midi: number, v: number, dur: number): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1500
    lp.Q.value = 0.9
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(v, t + 0.07)
    g.gain.setValueAtTime(v, t + Math.max(0.08, dur - 0.12))
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1)
    lp.connect(g)
    g.connect(this.wet)
    const vib = this.ctx.createOscillator()
    vib.frequency.value = 5.4
    const vg = this.ctx.createGain()
    vg.gain.value = 7
    vib.connect(vg)
    vib.start(t)
    vib.stop(t + dur + 0.2)
    for (const cents of [-6, 6]) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = cents
      vg.connect(o.detune)
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.2)
    }
  }

  protected sine(t: number, midi: number, v: number, dur: number): void {
    this.tone(this.dry, 'sine', mtof(midi), t, v, 0.03, dur)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 白天: a bouncy little tune on a marimba, with a plucked bass and a woodblock. C major, sixteen bars, A and B halves.

const DAY_CHORDS = [
  { root: 48, minor: false }, { root: 45, minor: true }, { root: 41, minor: false }, { root: 43, minor: false },
  { root: 48, minor: false }, { root: 45, minor: true }, { root: 50, minor: true }, { root: 43, minor: false },
  { root: 41, minor: false }, { root: 43, minor: false }, { root: 52, minor: true }, { root: 45, minor: true },
  { root: 41, minor: false }, { root: 43, minor: false }, { root: 48, minor: false }, { root: 48, minor: false },
]

// eight eighth-notes per bar; null = rest
const DAY_MELODY: (number | null)[][] = [
  [76, 79, 76, 72, 74, 76, 72, null],
  [69, 72, 76, 72, 69, 72, 74, null],
  [77, 76, 72, 69, 72, 74, 76, 77],
  [74, 71, 74, 79, 77, 74, 71, null],
  [76, 79, 84, 79, 76, 79, 76, 72],
  [69, 72, 76, 81, 79, 76, 72, null],
  [74, 77, 81, 77, 74, 77, 74, 72],
  [71, 74, 77, 74, 71, 67, 71, null],
  [77, 76, 72, 77, 76, 72, 69, null],
  [74, 77, 79, 77, 74, 71, 74, null],
  [76, 79, 83, 79, 76, 71, 76, null],
  [72, 76, 81, 76, 72, 69, 72, 76],
  [77, 81, 84, 81, 77, 72, 77, null],
  [79, 77, 74, 71, 74, 77, 79, 83],
  [84, 79, 76, 72, 76, 79, 84, null],
  [84, null, 79, null, 76, null, 72, null],
]

export class DayTune extends Voices implements Tune {
  intensity = 0
  constructor(ctx: BaseAudioContext, white: AudioBuffer, out: BeatOut, adopt: Adopt = n => n) {
    super(ctx, white, out, 1.2, adopt)
  }

  scheduleBar(bar: number, t0: number): number {
    const eighth = 60 / 116 / 2
    const pos = bar % DAY_MELODY.length
    const chord = DAY_CHORDS[pos]
    const third = chord.minor ? 3 : 4
    for (let i = 0; i < 8; i++) {
      const t = t0 + i * eighth
      const swing = i % 2 ? eighth * 0.12 : 0       // a gentle bounce on the off-beats
      const note = DAY_MELODY[pos][i]
      if (note !== null) this.marimba(t + swing, note, 0.17 - (i % 2) * 0.03)
      // walking bass: root, fifth, root, a step up to the next chord
      const walk = [0, null, 7, null, 12, null, 7, third][i]
      if (walk !== null) this.pluckBass(t, chord.root + walk - (walk >= 12 ? 12 : 0), 0.13)
      // chord pluck on the off-beats
      if (i % 4 === 2) {
        for (const iv of [0, third, 7]) this.marimba(t, chord.root + 24 + iv, 0.045, this.wet)
      }
      // woodblock on 2 and 4, a shaker underneath
      if (i === 2 || i === 6) this.noise(this.dry, t, 0.03, 'bandpass', 1900, 3, 0.07)
      this.noise(this.dry, t, 0.025, 'highpass', 7500, 0.7, i % 2 ? 0.018 : 0.03)
    }
    if (pos === 7 || pos === 15) this.glock(t0 + eighth * 7, 91, 0.06)
    return eighth * 8
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 深夜复盘: staccato strings in D minor over a ticking pulse, a piano finding something, then a cello that thinks aloud.
// Each pass through the eight bars adds a layer, so a long think keeps getting deeper.

const DEDUCE_ROOTS = [0, 0, -4, 5, 0, 0, -4, 7]            // from D2 (38): Dm Dm Bb Gm Dm Dm Bb A
const DEDUCE_ACCENT = new Set([0, 3, 6, 8, 11, 14])       // 3 + 3 + 2 + 3 + 3 + 2
const DEDUCE_OSTINATO = [0, 7, 12, 7]
// cello melody: [step, midi, length in steps] per bar
const DEDUCE_CELLO: [number, number, number][][] = [
  [[0, 62, 8], [8, 65, 4], [12, 64, 4]],
  [[0, 62, 12], [12, 64, 4]],
  [[0, 65, 8], [8, 62, 8]],
  [[0, 67, 8], [8, 65, 4], [12, 62, 4]],
  [[0, 69, 8], [8, 67, 4], [12, 65, 4]],
  [[0, 64, 8], [8, 65, 4], [12, 62, 4]],
  [[0, 70, 8], [8, 69, 4], [12, 67, 4]],
  [[0, 69, 8], [8, 73, 4], [12, 74, 4]],
]

export class DeduceTune extends Voices implements Tune {
  intensity = 0
  constructor(ctx: BaseAudioContext, white: AudioBuffer, out: BeatOut, adopt: Adopt = n => n) {
    super(ctx, white, out, 1.05, adopt)
  }

  scheduleBar(bar: number, t0: number): number {
    const step = 60 / 120 / 4
    const pos = bar % 8
    const pass = Math.floor(bar / 8)
    const root = 38 + DEDUCE_ROOTS[pos]
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step
      // the pulse never stops: a pedal on every beat and a wooden tick
      if (s % 4 === 0) {
        this.sine(t, root + 12, 0.17, 0.5)
        this.noise(this.dry, t, 0.02, 'bandpass', 2400, 4, 0.07)
      }
      // strings: sparse on the first pass, running from the second
      const accent = DEDUCE_ACCENT.has(s)
      if (pass >= 1 || accent) {
        const midi = root + 24 + DEDUCE_OSTINATO[s % 4]
        this.stac(t, midi, (accent ? 0.075 : 0.032) * (pass >= 1 ? 1 : 0.7) * (0.85 + 0.3 * this.intensity))
      }
    }
    if (pass >= 1 && pos === 3) {
      // the piano finds something
      ;[74, 77, 81].forEach((m, i) => this.piano(t0 + (8 + i * 2) * step, m, 0.1))
    }
    if (pass >= 2) {
      for (const [s, midi, len] of DEDUCE_CELLO[pos]) this.cello(t0 + s * step, midi, 0.1, len * step)
    }
    return step * 16
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 黎默的主题: slow, cold and controlled. A felt-piano arpeggio, a low pedal, a silver bell falling by thirds
// (the one on his bag), and a heartbeat that gets louder as the pressure builds. E minor, ending on B so it never resolves.

const LIMO_CHORDS = [
  { root: 40, minor: true }, { root: 36, minor: false }, { root: 45, minor: true }, { root: 47, minor: false },
  { root: 40, minor: true }, { root: 36, minor: false }, { root: 45, minor: true }, { root: 47, minor: false },
]
const LIMO_ARP = [0, 2, 3, 2, 1, 2, 3, 2]
// the bell: [step (of 16), midi] per bar, falling like a bell on a bag
const LIMO_BELL: [number, number][][] = [
  [[0, 83], [3, 79], [6, 76]], [], [[0, 84], [3, 79], [6, 76]], [],
  [[0, 83], [3, 79], [6, 76]], [], [[0, 81], [3, 76], [6, 72]], [[10, 83], [13, 79]],
]

export class LimoTune extends Voices implements Tune {
  intensity = 0
  constructor(ctx: BaseAudioContext, white: AudioBuffer, out: BeatOut, adopt: Adopt = n => n) {
    super(ctx, white, out, 0.85, adopt)
  }

  scheduleBar(bar: number, t0: number): number {
    const I = Math.max(0, Math.min(1, this.intensity))
    const step = 60 / (72 + 14 * I) / 4
    const pos = bar % 8
    const chord = LIMO_CHORDS[pos]
    const third = chord.minor ? 3 : 4
    const tones = [0, third, 7, 12]
    // the pedal under everything
    this.cello(t0, chord.root, 0.09, step * 15)
    // the arpeggio, one note every two sixteenths
    for (let i = 0; i < 8; i++) {
      this.piano(t0 + i * 2 * step, chord.root + 24 + tones[LIMO_ARP[i]], 0.075 + 0.025 * I)
    }
    // the bell
    for (const [s, midi] of LIMO_BELL[pos]) this.glock(t0 + s * step, midi, 0.075)
    // a heartbeat: quiet at first, close at the end
    const beat = 0.05 + 0.2 * I
    for (const s of [0, 8]) {
      this.tone(this.dry, 'sine', 62, t0 + s * step, beat, 0.004, 0.24, 36)
      this.tone(this.dry, 'sine', 58, t0 + (s + 1.6) * step, beat * 0.65, 0.004, 0.2, 34)
    }
    // under pressure, a cold shiver in the high register
    if (I > 0.5 && pos % 2 === 1) this.tone(this.wet, 'sine', mtof(chord.root + 48), t0 + 4 * step, 0.03 * I, 0.6, 1.8, mtof(chord.root + 47))
    return step * 16
  }
}

export function makeTune(id: TuneId, ctx: BaseAudioContext, white: AudioBuffer, out: BeatOut, adopt?: Adopt): Tune {
  switch (id) {
    case 'day': return new DayTune(ctx, white, out, adopt)
    case 'deduce': return new DeduceTune(ctx, white, out, adopt)
    case 'limo': return new LimoTune(ctx, white, out, adopt)
  }
}
