import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { MOODS, examIntensity, lightsOut, moodIdFor, resolveMood, type DangerCue, type Mood, type MoodContext } from '../src/audio/moods'
import { useAudioDirector, type AudioPort } from '../src/audio/director'
import { AudioEngine, type SfxName } from '../src/audio/engine'
import { useGameStore } from '../src/engine/store'
import backgrounds from '../src/data/backgrounds.json'
import { playOut } from './helpers'

const ctx = (over: Partial<MoodContext> = {}): MoodContext => ({
  screen: 'hub', bg: 'office', night: true, hour: 12, sceneId: null, persuasion: null, ending: null, ...over,
})

describe('mood lookup', () => {
  it('has a mood for every background in the game', () => {
    for (const b of backgrounds) expect(MOODS[moodIdFor(ctx({ bg: b.id }))], b.id).toBeDefined()
    expect(new Set(backgrounds.map(b => moodIdFor(ctx({ bg: b.id })))).size).toBe(backgrounds.length)
  })

  it('puts the title, the exam and the endings above the background', () => {
    expect(moodIdFor(ctx({ screen: 'title', bg: 'office' }))).toBe('title')
    expect(moodIdFor(ctx({ screen: 'exam', bg: 'meeting_a' }))).toBe('exam')
    expect(moodIdFor(ctx({ screen: 'end', ending: 'hp' }))).toBe('bad_end')
    expect(moodIdFor(ctx({ screen: 'end', ending: 'failed' }))).toBe('fail')
    expect(moodIdFor(ctx({ screen: 'end', ending: 'clear' }))).toBe('resolve')
  })

  it('switches to the ambush mood for an attack scene and the aftermath mood for its outcomes', () => {
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'stairwell', sceneId: 'attack_stairs' }))).toBe('ambush')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'stairwell', sceneId: 'attack_stairs_good' }))).toBe('aftermath')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'stairwell', sceneId: 'attack_parking_bad' }))).toBe('aftermath')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'office', sceneId: 'bad_end_1' }))).toBe('bad_end')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'meeting_a', sceneId: 'finale_act1_end' }))).toBe('limo')
    expect(moodIdFor(ctx({ screen: 'scene', bg: 'office', sceneId: 'day2_desk' }))).toBe('office')
  })
})

describe('resolved mood', () => {
  it('has no rain by day', () => {
    expect(resolveMood(ctx({ bg: 'street', night: true })).rain).toBeGreaterThan(0.5)
    expect(resolveMood(ctx({ bg: 'street', night: false })).rain).toBe(0)
  })

  it('loses the fluorescent hum at 21:00 but not in places with their own lights', () => {
    expect(lightsOut(20)).toBe(false)
    expect(lightsOut(21)).toBe(true)
    expect(lightsOut(3)).toBe(true)
    expect(resolveMood(ctx({ bg: 'office', hour: 20 })).hum).toBeGreaterThan(0)
    expect(resolveMood(ctx({ bg: 'office', hour: 21 })).hum).toBe(0)
    expect(resolveMood(ctx({ bg: 'hr_office', hour: 22 })).hum).toBe(0)
    expect(resolveMood(ctx({ bg: 'store', hour: 22 })).hum).toBeGreaterThan(0)
  })

  it('gives the cross-examination a driving electronic track, and keeps it the same mood while persuasion drops', () => {
    const calm = resolveMood(ctx({ screen: 'exam', persuasion: 7 }))
    const edge = resolveMood(ctx({ screen: 'exam', persuasion: 1 }))
    expect(calm.beat).not.toBeNull()
    expect(calm.beat!.maxBpm).toBeGreaterThan(calm.beat!.bpm)
    expect(calm.beat!.bpm).toBeGreaterThanOrEqual(140)
    // the same mood, so the track is not restarted on every mistake
    expect(JSON.stringify(edge)).toBe(JSON.stringify(calm))
    // only the showdown and the comeback play a band
    for (const m of Object.values(MOODS)) if (m.id !== 'exam' && m.id !== 'comeback') expect(m.beat, m.id).toBeNull()
  })

  it('maps persuasion to a 0..1 pressure: nothing at the top, everything at zero', () => {
    expect(examIntensity(null)).toBe(0)
    expect(examIntensity(7)).toBe(0)
    expect(examIntensity(5)).toBeCloseTo(2 / 7)
    expect(examIntensity(1)).toBeGreaterThan(examIntensity(3))
    expect(examIntensity(0)).toBe(1)
    expect(examIntensity(-2)).toBe(1)
  })

  it('keeps every mood inside sane ranges', () => {
    for (const m of Object.values(MOODS)) {
      for (const k of ['hum', 'rain', 'wind', 'fan', 'reverb'] as const) {
        expect(m[k], `${m.id}.${k}`).toBeGreaterThanOrEqual(0)
        expect(m[k], `${m.id}.${k}`).toBeLessThanOrEqual(1)
      }
      if (m.melody) {
        expect(m.melody.gap[0]).toBeLessThanOrEqual(m.melody.gap[1])
        expect(m.melody.gap[0]).toBeGreaterThan(0)
      }
    }
  })
})

describe('engine without a sound card', () => {
  it('does nothing and does not throw', () => {
    const e = new AudioEngine()
    e.unlock()
    e.setMood(MOODS.title)
    e.setDanger({ tier: 'critical', night: true, active: true })
    e.sfx('hurt')
    e.setVolume(0.3)
    e.setMuted(true)
    e.setIntensity(0.8)
    e.setMood(MOODS.exam)
    expect(e.running).toBe(false)
    expect(e.muted).toBe(true)
    expect(e.volume).toBeCloseTo(0.3)
  })
})

class Recorder implements AudioPort {
  moods: string[] = []
  dangers: DangerCue[] = []
  sounds: SfxName[] = []
  unlocked = 0
  unlock = () => { this.unlocked++ }
  setMood = (m: Mood) => { this.moods.push(m.id) }
  setDanger = (c: DangerCue) => { this.dangers.push(c) }
  intensities: number[] = []
  setIntensity = (x: number) => { this.intensities.push(x) }
  sfx = (n: SfxName) => { this.sounds.push(n) }
}

function directed() {
  setActivePinia(createPinia())
  const store = useGameStore()
  const port = new Recorder()
  mount(defineComponent({ setup() { useAudioDirector(store, port); return () => h('div') } }))
  return { store, port }
}

describe('audio director', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts on the title mood and leaves it when the game starts', async () => {
    const { store, port } = directed()
    expect(port.moods).toEqual(['title'])
    store.newGame()
    await nextTick()
    expect(port.moods.at(-1)).toBe('office')
  })

  it('plays the showdown track in the cross-examination and pushes it harder as persuasion drops', async () => {
    const { store, port } = directed()
    store.newGame()
    await nextTick()
    expect(port.intensities.at(-1)).toBe(0)
    store.state.evidence.push(...store.data.debugKit.evidence)   // with the evidence in hand, no step is passed over
    store.state.testimony.push(...store.data.debugKit.testimony)
    store.startExamById('finale_act1')
    await nextTick()
    expect(port.moods.at(-1)).toBe('limo')            // he is on the stand: his theme
    store.setExamPresenting(true)
    await nextTick()
    expect(port.moods.at(-1)).toBe('exam')            // you are choosing evidence: the showdown
    expect(port.intensities.at(-1)).toBeCloseTo(examIntensity(store.exam!.persuasion))
    const moodsBefore = port.moods.length
    store.exam!.persuasion = 1
    await nextTick()
    expect(port.intensities.at(-1)).toBeCloseTo(6 / 7)
    expect(port.moods.length).toBe(moodsBefore)   // not restarted
  })

  it('follows the background through the prologue and plays its sound cues in order', async () => {
    const { store, port } = directed()
    store.newGame()
    const seen: string[] = []
    let guard = 0
    while (store.screen === 'scene' && store.currentNode) {
      if (guard++ > 500) throw new Error('runaway')
      const n = store.currentNode
      store.advance(n.type === 'choice' ? 0 : undefined)
      await nextTick()
      seen.push(port.moods.at(-1)!)
    }
    for (const m of ['hr_office', 'meeting_b', 'street']) expect(port.moods, m).toContain(m)
    const cues = port.sounds.filter(s => s === 'lights_out' || s === 'phone' || s === 'stab')
    expect(cues).toEqual(['lights_out', 'phone', 'stab'])
    expect(port.sounds).toContain('tick')
    expect(port.sounds).toContain('gain') // T01 / T02 are picked up along the way
  })

  it('asks for a heartbeat and footsteps only when the danger tier says so', async () => {
    const { store, port } = directed()
    store.newGame()
    playOut(store)
    await nextTick()
    store.state.danger = 65
    await nextTick()
    expect(port.dangers.at(-1)).toMatchObject({ tier: 'tense', active: true })
    store.state.danger = 0
    await nextTick()
    expect(port.dangers.at(-1)).toMatchObject({ tier: 'calm' })
  })

  it('plays the hurt sound when health drops', async () => {
    const { store, port } = directed()
    store.newGame()
    await nextTick()
    store.state.hp -= 1
    await nextTick()
    expect(port.sounds).toContain('hurt')
  })

  it('unlocks the engine on the first click', async () => {
    const { port } = directed()
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(port.unlocked).toBe(1)
  })
})
