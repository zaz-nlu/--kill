// The creeping-fear layer. It sits on top of whatever mood is playing and grows with `level` (0..1): first a pair of
// close, beating low tones and a slow throb underneath; then glassy high tones that will not settle; then a whisper in
// the noise and now and then a swell that is cut off, or a groan from somewhere in the building.
// Everything is smoothed, so a rising heartbeat feels like the music itself going wrong rather than a layer switching on.

const rand = (a: number, b: number): number => a + Math.random() * (b - a)

export class Dread {
  private level = 0
  private built = false
  private master!: GainNode
  private drone!: GainNode
  private tritone!: GainNode
  private throb!: GainNode
  private throbRate!: OscillatorNode
  private shimmer!: GainNode
  private whisper!: GainNode
  private whisperBand!: BiquadFilterNode
  private events: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly ctx: AudioContext, private readonly dest: AudioNode, private readonly white: AudioBuffer) {}

  set(level: number): void {
    this.level = Math.max(0, Math.min(1, level))
    if (!this.built) {
      if (this.level < 0.02) return
      this.build()
    }
    this.apply()
    if (this.level > 0.45 && this.events === null) this.scheduleEvent()
    if (this.level <= 0.45 && this.events !== null) {
      clearTimeout(this.events)
      this.events = null
    }
  }

  private gain(v: number): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = v
    return g
  }

  private osc(type: OscillatorType, f: number): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.start()
    return o
  }

  private build(): void {
    const ctx = this.ctx
    this.built = true
    this.master = this.gain(0.7)
    this.master.connect(this.dest)

    // two low tones a semitone apart, and the tritone above them: a slow, sick beating (triangles, so a laptop can hear them)
    this.drone = this.gain(0)
    this.osc('triangle', 110).connect(this.drone)
    this.osc('triangle', 116.54).connect(this.drone)
    this.drone.connect(this.master)
    this.tritone = this.gain(0)
    this.osc('triangle', 155.56).connect(this.tritone)
    this.tritone.connect(this.master)

    // a sub tone that throbs; the rate follows the level (set in `apply`)
    this.throb = this.gain(0)
    const sub = this.osc('triangle', 82.41)
    const amp = this.gain(0.5)
    sub.connect(amp)
    amp.connect(this.throb)
    this.throbRate = this.osc('sine', 1)
    const depth = this.gain(0.5)
    this.throbRate.connect(depth)
    depth.connect(amp.gain)
    this.throb.connect(this.master)

    // glass: two high tones 14 Hz apart, trembling
    this.shimmer = this.gain(0)
    const hi = this.gain(1)
    this.osc('sine', 1760).connect(hi)
    this.osc('sine', 1774).connect(hi)
    const trem = this.osc('sine', 5.5)
    const tg = this.gain(0.35)
    trem.connect(tg)
    tg.connect(hi.gain)
    hi.connect(this.shimmer)
    this.shimmer.connect(this.master)

    // a whisper: noise squeezed through a narrow band that drifts
    const src = ctx.createBufferSource()
    src.buffer = this.white
    src.loop = true
    src.start(0, rand(0, 2))
    this.whisperBand = ctx.createBiquadFilter()
    this.whisperBand.type = 'bandpass'
    this.whisperBand.frequency.value = 1700
    this.whisperBand.Q.value = 9
    const drift = this.osc('sine', 0.23)
    const dg = this.gain(650)
    drift.connect(dg)
    dg.connect(this.whisperBand.frequency)
    this.whisper = this.gain(0)
    src.connect(this.whisperBand)
    this.whisperBand.connect(this.whisper)
    this.whisper.connect(this.master)
  }

  private apply(): void {
    const t = this.ctx.currentTime
    const x = this.level
    const glide = 0.9
    this.drone.gain.setTargetAtTime(x * 0.2, t, glide)
    this.tritone.gain.setTargetAtTime(x * x * 0.14, t, glide)
    this.throb.gain.setTargetAtTime(x * 0.3, t, glide)
    this.throbRate.frequency.setTargetAtTime(0.9 + 1.9 * x, t, glide)
    this.shimmer.gain.setTargetAtTime(Math.max(0, x - 0.25) ** 1.4 * 0.05, t, glide)
    this.whisper.gain.setTargetAtTime(Math.max(0, x - 0.4) * 0.11, t, glide)
  }

  // now and then, once it is bad enough: a swell that is cut off, or a groan
  private scheduleEvent(): void {
    this.events = setTimeout(() => {
      this.events = null
      if (this.level <= 0.45) return
      if (Math.random() < 0.55) this.swell()
      else this.groan()
      this.scheduleEvent()
    }, rand(4500, 10500) * (1.5 - this.level))
  }

  private panned(): StereoPannerNode {
    const pan = this.ctx.createStereoPanner()
    pan.pan.value = Math.random() < 0.5 ? -0.7 : 0.7
    pan.connect(this.master)
    setTimeout(() => { try { pan.disconnect() } catch { /* already gone */ } }, 6000)
    return pan
  }

  private swell(): void {
    const ctx = this.ctx
    const t = ctx.currentTime + 0.05
    const dur = rand(1.6, 2.6)
    const s = ctx.createBufferSource()
    s.buffer = this.white
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.2
    bp.frequency.setValueAtTime(350, t)
    bp.frequency.exponentialRampToValueAtTime(2800, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16 * this.level, t + dur)
    g.gain.setValueAtTime(0.0001, t + dur + 0.01) // cut dead
    s.connect(bp)
    bp.connect(g)
    g.connect(this.panned())
    s.start(t, rand(0, 2))
    s.stop(t + dur + 0.05)
  }

  private groan(): void {
    const ctx = this.ctx
    const t = ctx.currentTime + 0.05
    const dur = rand(1.4, 2.4)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(rand(52, 64), t)
    o.frequency.linearRampToValueAtTime(rand(36, 46), t + dur)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 170
    bp.Q.value = 7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.14 * this.level, t + dur * 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(bp)
    bp.connect(g)
    g.connect(this.panned())
    o.start(t)
    o.stop(t + dur + 0.1)
  }

  dispose(): void {
    if (this.events !== null) clearTimeout(this.events)
    this.events = null
    if (this.built) { try { this.master.disconnect() } catch { /* already gone */ } }
  }
}
