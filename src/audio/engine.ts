import type { Accent, DangerCue, Mood } from './moods'
import { moodKey } from './moods'
import { BeatSynth } from './beat'
import { makeTune } from './tunes'
import { Dread } from './dread'

// Everything here is made from oscillators and filtered noise with the Web Audio API: no audio files.
// The engine is inert where there is no AudioContext (tests, very old shells), so callers never need to check.

export type SfxName =
  | 'tick' | 'choose' | 'gain' | 'hurt' | 'lights_out' | 'phone' | 'stab' | 'ambush' | 'right' | 'smash' | 'wrong' | 'clear' | 'fail'

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)
const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

const CROSSFADE = 3.2
const SAVE_KEY = 'jiudian-audio'

// How long (seconds) between random one-shots of each kind.
const ACCENT_GAP: Record<Accent, [number, number]> = {
  drip: [3, 8], clock: [1, 1], chime: [14, 30], car: [8, 16], thunder: [26, 50], creak: [10, 22], buzz: [6, 15],
}

// Heartbeat period per tier matches the pulse of the HUD icon (see HudBar.vue).
const HEART_PERIOD = { uneasy: 1.2, tense: 0.8, critical: 0.45 } as const
const HEART_LEVEL = { uneasy: 0.06, tense: 0.16, critical: 0.5 } as const

interface Saved { muted: boolean; volume: number }

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Saved>
      return { muted: v.muted === true, volume: typeof v.volume === 'number' ? clamp(v.volume, 0, 1) : 0.7 }
    }
  } catch { /* blocked storage: fall through */ }
  return { muted: false, volume: 0.7 }
}

// One mood's worth of running sound. Two overlap during a crossfade.
class Layer {
  readonly out: GainNode   // fades the whole layer
  readonly bed: GainNode   // continuous sound: drone, rain, hum
  readonly fx: GainNode    // notes and accents: dry plus its own reverb
  alive = true
  synth: { intensity: number } | null = null   // the driving track or tune, when the mood has one
  private nodes: AudioNode[] = []
  private sources: AudioScheduledSourceNode[] = []
  private timers = new Set<ReturnType<typeof setTimeout>>()

  constructor(readonly ctx: AudioContext, dest: AudioNode, impulse: AudioBuffer, reverb: number) {
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
    this.bed = ctx.createGain()
    this.bed.connect(this.out)
    this.fx = ctx.createGain()
    this.fx.connect(this.out)
    const conv = ctx.createConvolver()
    conv.buffer = impulse
    const wet = ctx.createGain()
    wet.gain.value = clamp(reverb, 0, 1) * 1.1
    this.fx.connect(conv)
    conv.connect(wet)
    wet.connect(this.out)
    this.nodes.push(this.out, this.bed, this.fx, conv, wet)
  }

  add<T extends AudioNode>(n: T): T {
    this.nodes.push(n)
    return n
  }

  start<T extends AudioScheduledSourceNode>(s: T): T {
    this.sources.push(s)
    this.nodes.push(s)
    s.start()
    return s
  }

  track(s: AudioScheduledSourceNode): void {
    this.sources.push(s)
  }

  after(sec: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      if (this.alive) fn()
    }, sec * 1000)
    this.timers.add(t)
  }

  loop(gap: [number, number], fn: () => void, first = rand(gap[0], gap[1])): void {
    const go = (wait: number) => this.after(wait, () => { fn(); go(rand(gap[0], gap[1])) })
    go(first)
  }

  fadeIn(sec: number): void {
    const g = this.out.gain
    const t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(1, t + sec)
  }

  dispose(fadeSec: number): void {
    this.alive = false
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    const g = this.out.gain
    const t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + fadeSec)
    setTimeout(() => {
      for (const s of this.sources) { try { s.stop() } catch { /* already stopped */ } }
      for (const n of this.nodes) { try { n.disconnect() } catch { /* already gone */ } }
    }, fadeSec * 1000 + 300)
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private sfxFx!: GainNode
  private impulse!: AudioBuffer
  private white!: AudioBuffer
  private brown!: AudioBuffer
  private layer: Layer | null = null
  private layerKey = ''
  private wantMood: Mood | null = null
  private danger: DangerCue = { tier: 'calm', night: false, active: false }
  private heartTimer: ReturnType<typeof setTimeout> | null = null
  private stepTimer: ReturnType<typeof setTimeout> | null = null
  private duckBase = 1
  private intensity = 0
  private tension = 0
  private dread: Dread | null = null
  private saved = readSaved()

  get muted(): boolean { return this.saved.muted }
  get volume(): number { return this.saved.volume }
  get running(): boolean { return this.ctx !== null }

  // Browsers only allow sound after a click or key press, so the graph is built on the first one.
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctor) return
    try {
      this.ctx = new Ctor()
    } catch {
      return
    }
    this.build(this.ctx)
    if (this.wantMood) this.setMood(this.wantMood)
    this.applyDanger()
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setVolume(v: number): void {
    this.saved.volume = clamp(v, 0, 1)
    this.applyMaster()
    this.persist()
  }

  setMuted(m: boolean): void {
    this.saved.muted = m
    this.applyMaster()
    this.persist()
  }

  private persist(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.saved)) } catch { /* blocked storage */ }
  }

  private applyMaster(): void {
    if (!this.ctx) return
    const target = this.saved.muted ? 0 : this.saved.volume ** 2
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06)
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain()
    this.master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.85
    this.musicBus.connect(this.master)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.9
    this.sfxBus.connect(this.master)

    this.impulse = this.makeImpulse(ctx, 2.8)
    this.white = this.makeNoise(ctx, 3, false)
    this.brown = this.makeNoise(ctx, 3, true)

    // sound effects get a touch of room too
    this.sfxFx = ctx.createGain()
    const conv = ctx.createConvolver()
    conv.buffer = this.impulse
    const wet = ctx.createGain()
    wet.gain.value = 0.7
    this.sfxFx.connect(this.sfxBus)
    this.sfxFx.connect(conv)
    conv.connect(wet)
    wet.connect(this.sfxBus)

    this.dread = new Dread(ctx, this.musicBus, this.white)
    this.dread.set(this.tension)

    this.applyMaster()
  }

  private makeNoise(ctx: AudioContext, sec: number, brown: boolean): AudioBuffer {
    const buf = ctx.createBuffer(2, ctx.sampleRate * sec, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let last = 0
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1
        if (brown) {
          last = (last + 0.02 * w) / 1.02
          d[i] = last * 3.5
        } else {
          d[i] = w
        }
      }
    }
    return buf
  }

  // A decaying burst of noise, darker toward the tail, stands in for a stairwell-sized room.
  private makeImpulse(ctx: AudioContext, sec: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * sec)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const k = i / len
        lp += ((Math.random() * 2 - 1) - lp) * (0.9 - 0.8 * k)
        d[i] = lp * (1 - k) ** 2.4
      }
    }
    return buf
  }

  // ---- mood ----

  setMood(mood: Mood): void {
    this.wantMood = mood
    const ctx = this.ctx
    if (!ctx) return
    const key = moodKey(mood)
    if (key === this.layerKey) return
    this.layerKey = key
    const next = new Layer(ctx, this.musicBus, this.impulse, mood.reverb)
    this.buildMood(next, mood)
    const old = this.layer
    this.layer = next
    const fade = mood.fade ?? CROSSFADE
    next.fadeIn(old ? fade : 2)
    old?.dispose(fade)
  }

  // 0..1: how wrong the night should sound (a rising heartbeat, a long climb). Smoothed in the Dread layer.
  setTension(x: number): void {
    this.tension = clamp(x, 0, 1)
    this.dread?.set(this.tension)
  }

  // 0..1: how hard the driving track should hit. Applies to the track that is playing and to any later one.
  setIntensity(x: number): void {
    this.intensity = clamp(x, 0, 1)
    if (this.layer?.synth) this.layer.synth.intensity = this.intensity
  }

  // The track is scheduled a bar at a time on the audio clock, a little ahead of itself.
  private startBeat(l: Layer, m: Mood): void {
    if (!m.beat && !m.tune) return
    const ctx = l.ctx
    const out = { dry: l.bed, wet: l.fx }
    const synth = m.beat
      ? new BeatSynth(ctx, this.white, m.beat, out, n => l.add(n))
      : makeTune(m.tune!, ctx, this.white, out, n => l.add(n))
    synth.intensity = this.intensity
    l.synth = synth
    let bar = 0
    let next = ctx.currentTime + 0.2
    const tick = () => {
      if (next < ctx.currentTime - 0.3) next = ctx.currentTime + 0.1 // the timer was starved (hidden tab): do not play catch-up
      while (next < ctx.currentTime + 0.6) next += synth.scheduleBar(bar++, next)
      l.after(0.1, tick)
    }
    tick()
  }

  private noiseSrc(l: Layer, brown: boolean): AudioBufferSourceNode {
    const s = l.ctx.createBufferSource()
    s.buffer = brown ? this.brown : this.white
    s.loop = true
    s.start(0, rand(0, 2)) // each bed starts at a different point in the noise
    l.add(s)
    l.track(s)
    return s
  }

  private lfo(l: Layer, rate: number, depth: number, target: AudioParam): void {
    const o = l.add(l.ctx.createOscillator())
    o.frequency.value = rate
    const g = l.add(l.ctx.createGain())
    g.gain.value = depth
    o.connect(g)
    g.connect(target)
    l.start(o)
  }

  private buildMood(l: Layer, m: Mood): void {
    const ctx = l.ctx

    if (m.drone) {
      const d = m.drone
      const each = d.level / Math.sqrt(d.notes.length)
      const lp = l.add(ctx.createBiquadFilter())
      lp.type = 'lowpass'
      lp.frequency.value = d.cutoff
      lp.Q.value = 0.8
      this.lfo(l, 0.06, d.cutoff * 0.35, lp.frequency)
      const swell = l.add(ctx.createGain())
      swell.gain.value = 0.8
      this.lfo(l, rand(0.04, 0.09), 0.2, swell.gain)
      lp.connect(swell)
      swell.connect(l.bed)
      for (const n of d.notes) {
        for (const cents of [-6, 5]) {
          const o = l.add(ctx.createOscillator())
          o.type = d.wave
          o.frequency.value = mtof(n)
          o.detune.value = cents + rand(-2, 2)
          const g = l.add(ctx.createGain())
          g.gain.value = each * 0.5
          o.connect(g)
          g.connect(lp)
          l.start(o)
        }
      }
    }

    if (m.hum > 0) {
      const g = l.add(ctx.createGain())
      g.gain.value = m.hum * 0.06
      g.connect(l.bed)
      for (const [f, a] of [[50, 1], [100, 0.7], [150, 0.4]] as const) {
        const o = l.add(ctx.createOscillator())
        o.frequency.value = f
        const og = l.add(ctx.createGain())
        og.gain.value = a
        o.connect(og)
        og.connect(g)
        l.start(o)
      }
      // the tube's buzz
      const saw = l.add(ctx.createOscillator())
      saw.type = 'sawtooth'
      saw.frequency.value = 100
      const bp = l.add(ctx.createBiquadFilter())
      bp.type = 'bandpass'
      bp.frequency.value = 1300
      bp.Q.value = 5
      const bg = l.add(ctx.createGain())
      bg.gain.value = m.hum * 0.05
      saw.connect(bp)
      bp.connect(bg)
      bg.connect(l.bed)
      l.start(saw)
    }

    if (m.rain > 0) {
      const w = this.noiseSrc(l, false)
      const hp = l.add(ctx.createBiquadFilter())
      hp.type = 'highpass'
      hp.frequency.value = 900
      const lp = l.add(ctx.createBiquadFilter())
      lp.type = 'lowpass'
      lp.frequency.value = 2200 + m.rain * 5500 // muffled behind glass when it is light, bright in the open
      const g = l.add(ctx.createGain())
      g.gain.value = m.rain * 0.16
      this.lfo(l, 0.11, m.rain * 0.04, g.gain)
      w.connect(hp)
      hp.connect(lp)
      lp.connect(g)
      g.connect(l.bed)
      const b = this.noiseSrc(l, true)
      const blp = l.add(ctx.createBiquadFilter())
      blp.type = 'lowpass'
      blp.frequency.value = 520
      const bg = l.add(ctx.createGain())
      bg.gain.value = m.rain * 0.15
      b.connect(blp)
      blp.connect(bg)
      bg.connect(l.bed)
    }

    if (m.wind > 0) {
      const w = this.noiseSrc(l, false)
      const bp = l.add(ctx.createBiquadFilter())
      bp.type = 'bandpass'
      bp.frequency.value = 380
      bp.Q.value = 1.4
      this.lfo(l, 0.13, 160, bp.frequency)
      const g = l.add(ctx.createGain())
      g.gain.value = m.wind * 0.2
      this.lfo(l, 0.07, m.wind * 0.08, g.gain)
      w.connect(bp)
      bp.connect(g)
      g.connect(l.bed)
    }

    if (m.fan > 0) {
      const b = this.noiseSrc(l, true)
      const bp = l.add(ctx.createBiquadFilter())
      bp.type = 'bandpass'
      bp.frequency.value = 300
      bp.Q.value = 0.6
      const g = l.add(ctx.createGain())
      g.gain.value = m.fan * 0.32
      b.connect(bp)
      bp.connect(g)
      g.connect(l.bed)
      const w = this.noiseSrc(l, false)
      const hp = l.add(ctx.createBiquadFilter())
      hp.type = 'bandpass'
      hp.frequency.value = 2600
      hp.Q.value = 0.5
      const wg = l.add(ctx.createGain())
      wg.gain.value = m.fan * 0.015
      w.connect(hp)
      hp.connect(wg)
      wg.connect(l.bed)
    }

    if (m.pulse) {
      const { bpm, level } = m.pulse
      l.loop([60 / bpm, 60 / bpm], () => this.thump(l.ctx, l.bed, l.ctx.currentTime + 0.02, level), 0.1)
    }

    this.startBeat(l, m)

    if (m.melody) {
      const { root, scale, gap, level, voice } = m.melody
      let idx = Math.floor(rand(0, scale.length))
      l.loop(gap, () => {
        idx = clamp(idx + pick([-2, -1, -1, 0, 1, 1, 2]), -scale.length, scale.length * 2)
        const oct = Math.floor(idx / scale.length)
        const midi = root + scale[((idx % scale.length) + scale.length) % scale.length] + 12 * oct
        const t = ctx.currentTime + 0.05
        const vel = level * rand(0.7, 1)
        if (voice === 'piano') this.pianoNote(ctx, l.fx, midi, vel, t)
        else this.bellNote(ctx, l.fx, midi, vel, t)
        if (Math.random() < 0.2) this.bellNote(ctx, l.fx, midi - 12, vel * 0.6, t + 0.15) // an octave below, a beat late
      }, rand(1.5, 4))
    }

    for (const a of m.accents) l.loop(ACCENT_GAP[a], () => this.accent(l, a), a === 'clock' ? 0.3 : rand(2, ACCENT_GAP[a][1]))
  }

  // ---- building blocks ----

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private tone(ctx: AudioContext, dest: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, decay: number, endF?: number): void {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (endF) o.frequency.exponentialRampToValueAtTime(endF, t + attack + decay)
    const g = ctx.createGain()
    this.env(g, t, peak, attack, decay)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + attack + decay + 0.1)
  }

  private burst(ctx: AudioContext, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, brown = false, attack = 0.003): void {
    const s = ctx.createBufferSource()
    s.buffer = brown ? this.brown : this.white
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    this.env(g, t, peak, attack, dur)
    s.connect(f)
    f.connect(g)
    g.connect(dest)
    s.start(t, rand(0, 2))
    s.stop(t + attack + dur + 0.1)
  }

  private thump(ctx: AudioContext, dest: AudioNode, t: number, peak: number): void {
    this.tone(ctx, dest, 'sine', 66, t, peak, 0.004, 0.32, 36)
    this.burst(ctx, dest, t, 0.05, 'lowpass', 220, 0.7, peak * 0.4)
  }

  private pianoNote(ctx: AudioContext, dest: AudioNode, midi: number, vel: number, t: number): void {
    const f = mtof(midi)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = Math.min(5000, f * 5)
    lp.connect(dest)
    this.tone(ctx, lp, 'triangle', f, t, vel * 0.5, 0.008, 3.4)
    this.tone(ctx, lp, 'sine', f * 2, t, vel * 0.16, 0.006, 1.6)
    this.tone(ctx, lp, 'sine', f * 3.01, t, vel * 0.05, 0.004, 0.8)
  }

  private bellNote(ctx: AudioContext, dest: AudioNode, midi: number, vel: number, t: number): void {
    const f = mtof(midi)
    this.tone(ctx, dest, 'sine', f, t, vel * 0.5, 0.004, 5)
    this.tone(ctx, dest, 'sine', f * 2.76, t, vel * 0.18, 0.003, 2.6)
    this.tone(ctx, dest, 'sine', f * 5.4, t, vel * 0.06, 0.002, 1.2)
  }

  private accent(l: Layer, a: Accent): void {
    const ctx = l.ctx
    const t = ctx.currentTime + 0.02
    switch (a) {
      case 'drip': {
        const f = rand(1200, 2300)
        this.tone(ctx, l.fx, 'sine', f, t, 0.12, 0.002, 0.22, f * 0.55)
        break
      }
      case 'clock': {
        this.tickOnce(ctx, l.bed, t)
        break
      }
      case 'chime': {
        this.tone(ctx, l.fx, 'sine', 880, t, 0.09, 0.004, 1.5)
        this.tone(ctx, l.fx, 'sine', 659.3, t + 0.36, 0.09, 0.004, 1.9)
        break
      }
      case 'car': {
        const s = ctx.createBufferSource()
        s.buffer = this.white
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.Q.value = 1.4
        bp.frequency.setValueAtTime(260, t)
        bp.frequency.linearRampToValueAtTime(760, t + 2.4)
        bp.frequency.linearRampToValueAtTime(240, t + 5)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.12, t + 2.4)
        g.gain.linearRampToValueAtTime(0.0001, t + 5)
        const pan = ctx.createStereoPanner()
        const dir = Math.random() < 0.5 ? 1 : -1
        pan.pan.setValueAtTime(-0.8 * dir, t)
        pan.pan.linearRampToValueAtTime(0.8 * dir, t + 5)
        s.connect(bp)
        bp.connect(g)
        g.connect(pan)
        pan.connect(l.fx)
        s.start(t, rand(0, 2))
        s.stop(t + 5.2)
        break
      }
      case 'thunder': {
        const s = ctx.createBufferSource()
        s.buffer = this.brown
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(240, t)
        lp.frequency.exponentialRampToValueAtTime(70, t + 6)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.45, t + 0.9)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 6.5)
        s.connect(lp)
        lp.connect(g)
        g.connect(l.fx)
        s.start(t, rand(0, 2))
        s.stop(t + 6.8)
        break
      }
      case 'creak': {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(52, t)
        o.frequency.linearRampToValueAtTime(rand(58, 70), t + 1.1)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 190
        bp.Q.value = 9
        const g = ctx.createGain()
        this.env(g, t, 0.07, 0.35, 0.9)
        o.connect(bp)
        bp.connect(g)
        g.connect(l.fx)
        o.start(t)
        o.stop(t + 1.5)
        break
      }
      case 'buzz': {
        // a sensor light that cannot decide
        for (let i = 0; i < 3; i++) {
          const at = t + i * rand(0.07, 0.14)
          this.tone(ctx, l.fx, 'square', 100, at, 0.04, 0.002, 0.04)
          this.burst(ctx, l.fx, at, 0.02, 'highpass', 2500, 1, 0.05)
        }
        break
      }
    }
  }

  private tickOnce(ctx: AudioContext, dest: AudioNode, t: number): void {
    this.burst(ctx, dest, t, 0.03, 'bandpass', Math.random() < 0.5 ? 2600 : 2000, 3, 0.09, false, 0.001)
  }

  // ---- danger: heartbeat and footsteps (spec 6.8) ----

  setDanger(c: DangerCue): void {
    this.danger = c
    this.applyDanger()
  }

  private applyDanger(): void {
    if (this.heartTimer) clearTimeout(this.heartTimer)
    if (this.stepTimer) clearTimeout(this.stepTimer)
    this.heartTimer = this.stepTimer = null
    const ctx = this.ctx
    if (!ctx) return
    const { tier, night, active } = this.danger

    // At the top tier the heartbeat is louder than the music.
    this.duckBase = active && tier === 'critical' ? 0.5 : 1
    this.musicBus.gain.setTargetAtTime(0.85 * this.duckBase, ctx.currentTime, 0.6)

    if (active && tier !== 'calm') {
      const beat = () => {
        const t = this.ctx!.currentTime + 0.02
        const level = HEART_LEVEL[tier]
        this.thump(this.ctx!, this.sfxBus, t, level)
        this.thump(this.ctx!, this.sfxBus, t + Math.min(0.16, HEART_PERIOD[tier] * 0.3), level * 0.65)
        this.heartTimer = setTimeout(beat, HEART_PERIOD[tier] * 1000)
      }
      beat()
    }

    if (active && night && (tier === 'tense' || tier === 'critical')) {
      const next = (wait: number) => {
        this.stepTimer = setTimeout(() => {
          this.footsteps(tier === 'critical' ? 0.22 : 0.13)
          next(rand(7, 15))
        }, wait * 1000)
      }
      next(rand(3, 8))
    }
  }

  // Someone behind you, a little off to one side.
  private footsteps(level: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const pan = ctx.createStereoPanner()
    pan.pan.value = pick([-0.55, 0.55])
    pan.connect(this.sfxBus)
    const n = Math.floor(rand(5, 10))
    const start = ctx.currentTime + 0.1
    for (let i = 0; i < n; i++) {
      const t = start + i * 0.54
      const fade = 1 - i / (n + 2)
      const p = level * fade * (i % 2 ? 0.8 : 1)
      this.tone(ctx, pan, 'sine', i % 2 ? 78 : 92, t, p, 0.004, 0.14, 50)
      this.burst(ctx, pan, t, 0.07, 'lowpass', 520, 0.8, p * 0.7)
    }
    setTimeout(() => { try { pan.disconnect() } catch { /* already gone */ } }, (n * 0.54 + 1) * 1000)
  }

  // ---- one-shots ----

  private duck(level: number, hold: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const g = this.musicBus.gain
    const t = ctx.currentTime
    const base = 0.85 * this.duckBase
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(base * level, t + 0.04)
    g.setValueAtTime(base * level, t + hold)
    g.linearRampToValueAtTime(base, t + hold + 1.6)
  }

  sfx(name: SfxName): void {
    const ctx = this.ctx
    if (!ctx || this.saved.muted || ctx.state !== 'running') return
    const t = ctx.currentTime + 0.01
    const dry = this.sfxBus
    const room = this.sfxFx
    switch (name) {
      case 'tick':
        this.burst(ctx, dry, t, 0.025, 'bandpass', 1800, 1.2, 0.035, false, 0.002)
        break
      case 'choose':
        this.tone(ctx, dry, 'sine', 330, t, 0.07, 0.003, 0.1, 460)
        this.burst(ctx, dry, t, 0.03, 'highpass', 2400, 1, 0.03)
        break
      case 'gain': // a clue lands: two glass notes
        this.bellNote(ctx, room, 76, 0.26, t)
        this.bellNote(ctx, room, 83, 0.2, t + 0.12)
        break
      case 'hurt':
        this.tone(ctx, dry, 'sine', 95, t, 0.55, 0.004, 0.35, 38)
        this.burst(ctx, dry, t, 0.28, 'lowpass', 700, 0.7, 0.45)
        this.tone(ctx, dry, 'sine', 3150, t + 0.05, 0.028, 0.05, 2.4) // the ringing in your ears
        this.duck(0.3, 1.2)
        break
      case 'lights_out': // 21:00. The relay clunks, the tubes die.
        this.tone(ctx, dry, 'square', 92, t, 0.4, 0.002, 0.12, 44)
        this.burst(ctx, dry, t, 0.12, 'lowpass', 900, 0.7, 0.4)
        this.tone(ctx, dry, 'sawtooth', 520, t + 0.05, 0.08, 0.02, 1.1, 42)
        this.burst(ctx, room, t + 0.08, 0.5, 'bandpass', 160, 1, 0.12, true, 0.02)
        this.duck(0.25, 1.6)
        break
      case 'phone': // 21:08. It buzzes against the desk.
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.27
          this.tone(ctx, dry, 'sawtooth', 160, at, 0.2, 0.01, 0.17)
          this.burst(ctx, dry, at, 0.15, 'bandpass', 700, 2, 0.12)
        }
        break
      case 'ambush': {
        // The music dies on the spot. Nothing but your own pulse for a second and a half, then the hit.
        this.duck(0.0001, 1.9)
        const at = t + 1.5
        for (const m of [58, 59, 65, 66, 70]) this.tone(ctx, room, 'sine', mtof(m), at, 0.12, 0.005, 2.4)
        this.burst(ctx, room, at, 0.9, 'lowpass', 2200, 0.7, 0.34, false, 0.02)
        this.tone(ctx, dry, 'sine', 95, at, 0.5, 0.004, 0.35, 38)
        break
      }
      case 'stab':
        for (const m of [58, 59, 65, 66, 70]) this.tone(ctx, room, 'sine', mtof(m), t, 0.1, 0.005, 2.4)
        this.burst(ctx, room, t, 0.9, 'lowpass', 2200, 0.7, 0.3, false, 0.25)
        this.duck(0.35, 1.8)
        break
      case 'right':
        this.bellNote(ctx, room, 81, 0.24, t)
        this.bellNote(ctx, room, 88, 0.22, t + 0.1)
        break
      case 'smash': // a weak point is broken: the blow, then glass. The track ducks for an instant and comes back.
        this.tone(ctx, dry, 'sine', 120, t, 0.7, 0.002, 0.45, 34)
        this.burst(ctx, dry, t, 0.22, 'lowpass', 900, 0.8, 0.5, false, 0.002)
        this.burst(ctx, dry, t + 0.03, 0.55, 'highpass', 3500, 0.8, 0.28, false, 0.002)
        for (let i = 0; i < 6; i++) this.tone(ctx, room, 'sine', mtof(100 + Math.floor(rand(0, 12))), t + 0.05 + i * 0.045, 0.05, 0.002, 0.25)
        this.duck(0.2, 0.35)
        break
      case 'wrong':
        this.tone(ctx, dry, 'sawtooth', 196, t, 0.16, 0.01, 0.45, 130)
        this.tone(ctx, dry, 'sawtooth', 277, t, 0.12, 0.01, 0.45, 180)
        this.burst(ctx, dry, t, 0.2, 'lowpass', 500, 0.7, 0.2)
        break
      case 'clear':
        ;[69, 73, 76, 81].forEach((m, i) => this.bellNote(ctx, room, m, 0.26, t + i * 0.14))
        break
      case 'fail':
        this.tone(ctx, room, 'sine', 110, t, 0.35, 0.02, 1.8, 52)
        this.bellNote(ctx, room, 57, 0.18, t)
        this.bellNote(ctx, room, 58, 0.14, t + 0.05)
        break
    }
  }
}

export const audio = new AudioEngine()
