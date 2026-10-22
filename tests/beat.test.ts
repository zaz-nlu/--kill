import { describe, expect, it } from 'vitest'
import { BeatSynth } from '../src/audio/beat'
import { MOODS } from '../src/audio/moods'
import { fakeContext } from './fakeAudio'

const spec = MOODS.exam.beat!

function bar(n: number, intensity = 0) {
  const { ctx, started } = fakeContext()
  const synth = new BeatSynth(ctx, {} as AudioBuffer, spec, { dry: ctx.createGain(), wet: ctx.createGain() })
  synth.intensity = intensity
  const len = synth.scheduleBar(n, 10)
  return { len, started, synth }
}

describe('the showdown track', () => {
  it('is an eight-bar loop in a fast tempo, one chord per bar', () => {
    expect(spec.loop.length).toBe(8)
    expect(spec.bpm).toBeGreaterThanOrEqual(140)
  })

  it('schedules a whole bar ahead of time, 16 sixteenths long', () => {
    const { len, started } = bar(0)
    expect(len).toBeCloseTo((60 / spec.bpm) * 4)
    expect(started.length).toBeGreaterThan(60)
    for (const s of started) {
      expect(s.at).toBeGreaterThanOrEqual(10)
      expect(s.at).toBeLessThan(10 + len + 0.001)
    }
  })

  it('has a kick on every beat', () => {
    const { started, len } = bar(1)
    // kicks are the only sine oscillators that start exactly on the quarter notes with a noise click on top
    const beat = len / 4
    const onBeats = [0, 1, 2, 3].map(i => started.filter(s => s.type === 'osc' && Math.abs(s.at - (10 + i * beat)) < 1e-6).length)
    for (const n of onBeats) expect(n).toBeGreaterThanOrEqual(2)
  })

  it('goes faster and thicker as the pressure rises', () => {
    const calm = bar(5, 0)
    const edge = bar(5, 1)
    expect(edge.len).toBeLessThan(calm.len)
    expect((60 / edge.len) * 4).toBeCloseTo(spec.maxBpm)
    expect(edge.started.length).toBeGreaterThan(calm.started.length)
  })

  it('plays the second half of the loop fuller than the first, and the last bar is a fill', () => {
    expect(bar(4).started.length).toBeGreaterThan(bar(0).started.length)
    expect(bar(7).started.length).not.toBe(bar(6).started.length)
  })

  it('wraps round after the eighth bar', () => {
    expect(bar(16).started.length).toBe(bar(8).started.length)
    expect(bar(16).len).toBeCloseTo(bar(0).len)
  })
})
