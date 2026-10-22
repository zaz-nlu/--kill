import type { BeatSpec } from './moods'

// The "truth showdown" track: a driving electronic loop made from oscillators and noise, scheduled bar by bar on the
// audio clock (not on timers), so it stays in time. It needs only a BaseAudioContext, so the same code can be rendered
// offline to check levels. Four-on-the-floor kick, sidechained rolling bass, arpeggio lead with an echo, tresillo stabs,
// snare fills and a riser at the end of every eight bars. `intensity` (0..1) pushes the tempo and thickens the mix.
// With `style: 'triumph'` (the comeback) the same band plays in a major key: rolling eighths, a sustained pad, off-beat
// stabs and an anthem on the lead instead of the arpeggio.

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)

export interface BeatOut {
  dry: AudioNode   // goes straight to the mix
  wet: AudioNode   // goes to the mix and through the room reverb
}

type Adopt = <T extends AudioNode>(n: T) => T

const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1]   // indices into the chord's tones, one per sixteenth
const TRESILLO = [0, 3, 6, 8, 11, 14]                             // 3+3+2+3+3+2

export class BeatSynth {
  intensity = 0
  private readonly sc: GainNode      // bass and stabs: ducked by every kick
  private readonly drums: GainNode
  private readonly room: GainNode    // drums that also want a little reverb
  private readonly lead: GainNode
  private readonly echo: DelayNode

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly white: AudioBuffer,
    private readonly spec: BeatSpec,
    out: BeatOut,
    adopt: Adopt = n => n,
  ) {
    const mix = adopt(ctx.createGain())
    mix.gain.value = spec.level
    mix.connect(out.dry)
    this.sc = adopt(ctx.createGain())
    this.sc.connect(mix)
    this.drums = adopt(ctx.createGain())
    this.drums.connect(mix)
    this.room = adopt(ctx.createGain())
    this.room.gain.value = spec.level * 0.5
    this.room.connect(out.wet)

    this.lead = adopt(ctx.createGain())
    this.lead.gain.value = spec.level
    const lpf = adopt(ctx.createBiquadFilter())
    lpf.type = 'lowpass'
    lpf.frequency.value = 5200
    this.lead.connect(lpf)
    lpf.connect(out.wet)
    // a dotted-eighth echo (its time is set every bar to follow the tempo)
    this.echo = adopt(ctx.createDelay(1))
    this.echo.delayTime.value = 0.3
    const send = adopt(ctx.createGain())
    send.gain.value = 0.5
    const echoLp = adopt(ctx.createBiquadFilter())
    echoLp.type = 'lowpass'
    echoLp.frequency.value = 2400
    const feedback = adopt(ctx.createGain())
    feedback.gain.value = 0.4
    this.lead.connect(send)
    send.connect(this.echo)
    this.echo.connect(echoLp)
    echoLp.connect(out.wet)
    echoLp.connect(feedback)
    feedback.connect(this.echo)
  }

  bpm(): number {
    const { bpm, maxBpm } = this.spec
    return bpm + (maxBpm - bpm) * Math.max(0, Math.min(1, this.intensity))
  }

  // Schedules one bar starting at `t0` and returns its length in seconds.
  scheduleBar(bar: number, t0: number): number {
    const { spec, intensity: I } = this
    const step = 60 / this.bpm() / 4
    const len = spec.loop.length
    const pos = bar % len
    const chord = spec.loop[pos]
    const rootMidi = spec.root + chord.r
    const third = chord.minor ? 3 : 4
    const tones = [0, third, 7, 12, 12 + third, 19]
    const full = pos >= len / 2 || I > 0.45     // the second half of the loop is the full band
    const fillBar = pos % 4 === 3
    const lastBar = pos === len - 1
    const triumph = spec.style === 'triumph'

    this.echo.delayTime.setValueAtTime(step * 3, t0)

    if ((pos === 0 && bar > 0) || (triumph && pos % 2 === 0 && bar > 0)) this.crash(t0)
    if (lastBar) this.riser(t0, step * 16)
    if (triumph) {
      this.pad(t0, rootMidi + 24, third, step * 16)
      for (const [s, midi, steps] of spec.anthem?.[pos] ?? []) this.anthemNote(t0 + s * step, midi, steps * step)
    }

    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step

      // kick, with a ghost kick when the pressure is on
      const ghost = I > 0.5 && pos % 2 === 1 && s === 10
      if (s % 4 === 0 || ghost) {
        this.kick(t, ghost ? 0.7 : 1)
        this.pump(t)
      }

      // snare / clap on 2 and 4, rolls in the fills
      const roll = (lastBar && s >= 8) || (fillBar && !lastBar && s >= 12)
      if (roll) {
        const from = lastBar ? 8 : 12
        const k = (s - from) / (16 - from)
        this.snare(t, 0.16 + 0.2 * k + 0.06 * I)
      } else if (s === 4 || s === 12) {
        this.snare(t, 0.42)
      }

      // hats: sixteenths with an accent, open hats on the off-beat eighths
      if (s % 4 === 2) this.hat(t, true, 0.11)
      else this.hat(t, false, [0.14, 0.06, 0.1, 0.06][s % 4])

      // bass: rolling sixteenths with an octave pop; the bar before a change walks up to the next chord
      const walk = fillBar && s >= 14 ? (s === 14 ? 7 : 10) : 0
      const pop = s % 4 === 2 ? 12 : 0
      if (!triumph || s % 2 === 0) this.bass(t, rootMidi + walk + pop, step)

      // arpeggio: eighths in the first half of the loop, sixteenths in the second (a light sparkle under the anthem)
      if (full || s % 2 === 0) {
        const lvl = (full ? 1 : 0.55) * (0.75 + 0.5 * I) * (triumph ? 0.45 : 1)
        this.arp(t, rootMidi + 24 + tones[ARP[s]], 0.13 * lvl, step)
      }

      // stabs: on the tresillo once the band is full (earlier under pressure); on the off-beat eighths in the comeback
      if (triumph) {
        if (s % 4 === 2 && !(lastBar && s >= 8)) this.stab(t, rootMidi + 24, third, 0.075)
      } else if ((full || I > 0.35) && TRESILLO.includes(s) && !(lastBar && s >= 8)) {
        this.stab(t, rootMidi + 24, third, 0.07 + 0.03 * I)
      }
    }
    return step * 16
  }

  // ---- parts ----

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private noise(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002): void {
    const s = this.ctx.createBufferSource()
    s.buffer = this.white
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    this.env(g, t, peak, attack, dur)
    s.connect(f)
    f.connect(g)
    g.connect(dest)
    s.start(t, Math.random() * 2)
    s.stop(t + attack + dur + 0.05)
  }

  // every kick squeezes the bass and the stabs for a moment
  private pump(t: number): void {
    this.sc.gain.setValueAtTime(0.26, t)
    this.sc.gain.linearRampToValueAtTime(1, t + 0.17)
  }

  private kick(t: number, v: number): void {
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(175, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13)
    const g = this.ctx.createGain()
    this.env(g, t, 0.6 * v, 0.002, 0.26)
    o.connect(g)
    g.connect(this.drums)
    o.start(t)
    o.stop(t + 0.4)
    this.noise(this.drums, t, 0.012, 'highpass', 2500, 0.7, 0.16 * v, 0.0008)
  }

  private snare(t: number, v: number): void {
    this.noise(this.drums, t, 0.17, 'bandpass', 1500, 0.9, v)
    this.noise(this.room, t, 0.1, 'highpass', 2800, 0.7, v * 0.5)
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(210, t)
    o.frequency.exponentialRampToValueAtTime(130, t + 0.08)
    const g = this.ctx.createGain()
    this.env(g, t, v * 0.4, 0.002, 0.09)
    o.connect(g)
    g.connect(this.drums)
    o.start(t)
    o.stop(t + 0.2)
  }

  private hat(t: number, open: boolean, v: number): void {
    this.noise(this.drums, t, open ? 0.13 : 0.03, 'highpass', open ? 6000 : 7500, 0.7, v, 0.001)
  }

  private crash(t: number): void {
    this.noise(this.room, t, 1.3, 'highpass', 5200, 0.5, 0.11, 0.003)
  }

  private riser(t: number, dur: number): void {
    const s = this.ctx.createBufferSource()
    s.buffer = this.white
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0002, t)
    g.gain.exponentialRampToValueAtTime(0.1 * (0.7 + 0.5 * this.intensity), t + dur)
    s.connect(bp)
    bp.connect(g)
    g.connect(this.room)
    s.start(t, Math.random() * 2)
    s.stop(t + dur + 0.05)
  }

  private bass(t: number, midi: number, step: number): void {
    const f = mtof(midi)
    const o = this.ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 5
    lp.frequency.setValueAtTime(1500, t)
    lp.frequency.exponentialRampToValueAtTime(260, t + step * 1.1)
    const g = this.ctx.createGain()
    this.env(g, t, 0.15, 0.004, step * 1.2)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.sc)
    o.start(t)
    o.stop(t + step * 1.4)
    const sub = this.ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = f
    const sg = this.ctx.createGain()
    this.env(sg, t, 0.12, 0.004, step * 1.3)
    sub.connect(sg)
    sg.connect(this.sc)
    sub.start(t)
    sub.stop(t + step * 1.5)
  }

  private arp(t: number, midi: number, peak: number, step: number): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 3
    lp.frequency.setValueAtTime(4200, t)
    lp.frequency.exponentialRampToValueAtTime(900, t + step * 1.4)
    const g = this.ctx.createGain()
    this.env(g, t, peak, 0.003, step * 1.5)
    lp.connect(g)
    g.connect(this.lead)
    for (const cents of [-9, 9]) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = cents
      o.connect(lp)
      o.start(t)
      o.stop(t + step * 1.7)
    }
  }

  // a held chord under the anthem
  private pad(t: number, rootMidi: number, third: number, dur: number): void {
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.045, t + 0.08)
    g.gain.setValueAtTime(0.045, t + dur - 0.1)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g)
    g.connect(this.sc)
    for (const iv of [0, third, 7]) {
      for (const cents of [-9, 9]) {
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(rootMidi + iv)
        o.detune.value = cents
        o.connect(lp)
        o.start(t)
        o.stop(t + dur + 0.1)
      }
    }
  }

  // the anthem: a bright detuned lead with a short attack, played through the echo
  private anthemNote(t: number, midi: number, dur: number): void {
    const f = mtof(midi)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4800
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.15, t + 0.012)
    g.gain.setValueAtTime(0.15, t + Math.max(0.02, dur - 0.1))
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g)
    g.connect(this.lead)
    for (const [type, cents] of [['sawtooth', -8], ['sawtooth', 8], ['square', 0]] as const) {
      const o = this.ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      o.detune.value = cents
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }

  private stab(t: number, rootMidi: number, third: number, peak: number): void {
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.2
    lp.frequency.setValueAtTime(3400, t)
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.16)
    const g = this.ctx.createGain()
    this.env(g, t, peak, 0.004, 0.17)
    lp.connect(g)
    g.connect(this.sc)
    for (const iv of [0, third, 7]) {
      for (const cents of [-11, 0, 11]) {
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(rootMidi + iv)
        o.detune.value = cents
        o.connect(lp)
        o.start(t)
        o.stop(t + 0.3)
      }
    }
  }
}
