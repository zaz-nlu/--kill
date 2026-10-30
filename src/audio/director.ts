import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { useGameStore } from '../engine/store'
import { dangerTier } from '../engine/danger'
import { timeOfDay } from '../engine/backgrounds'
import { audio, type SfxName } from './engine'
import { attackKind, dangerCue, examIntensity, moodKey, resolveMood, tensionFor, type DangerCue, type Mood, type MoodContext } from './moods'

type Store = ReturnType<typeof useGameStore>

// What the director needs from a sound engine; tests pass a recorder instead of the real thing.
export interface AudioPort {
  unlock?: () => void
  suspend?: () => void
  resume?: () => void
  setMood: (m: Mood) => void
  setDanger: (c: DangerCue) => void
  setIntensity?: (x: number) => void
  setTension?: (x: number) => void
  sfx: (n: SfxName) => void
}

const CUES: ReadonlySet<string> = new Set<SfxName>(['lights_out', 'phone', 'stab'])

// Watches the game and tells the sound engine what to play. It never changes game state.
export function useAudioDirector(store: Store, port: AudioPort = audio): void {
  const night = computed(() => (store.stage.time ?? timeOfDay(store.state.hour)) === 'night')
  const ending = computed<MoodContext['ending']>(() => {
    if (store.screen !== 'end') return null
    return store.gameOver === 'hp' ? 'hp' : store.examFailed ? 'failed' : 'clear'
  })

  // In the cross-examination: choosing evidence (or an argument) is the showdown, and it lingers a few seconds after the
  // window closes so the answer lands on the same track. Hitting back from a bad position turns it into the comeback.
  const presenting = ref(false)
  let presentingTimer: ReturnType<typeof setTimeout> | null = null
  watch(() => store.screen === 'exam' && (store.examPresenting || store.argument !== null), on => {
    if (presentingTimer) clearTimeout(presentingTimer)
    presentingTimer = null
    if (on) presenting.value = true
    else presentingTimer = setTimeout(() => { presenting.value = false }, 5000)
  }, { immediate: true })
  const rally = ref(false)
  watch(() => (store.screen === 'exam' ? store.exam?.def.id ?? null : null), () => { rally.value = false })

  const context = computed<MoodContext>(() => ({
    screen: store.screen,
    bg: store.screen === 'title' ? 'title' : store.stage.bg,
    night: store.screen === 'title' ? true : night.value,
    hour: store.state.hour,
    sceneId: store.screen === 'scene' ? store.currentSceneId : null,
    persuasion: store.exam?.persuasion ?? null,
    ending: ending.value,
    deducing: store.screen === 'scene' && store.deduction !== null,
    againstLimo: /^finale_act\d/.test(store.exam?.def.id ?? ''),
    presenting: presenting.value,
    rally: rally.value,
    stageMood: store.stage.mood,
  }))
  const mood = computed(() => resolveMood(context.value))
  watch(() => moodKey(mood.value), () => port.setMood(mood.value), { immediate: true })

  // The finale track speeds up and thickens as 说服力 runs out, without restarting.
  watch(() => examIntensity(store.exam?.persuasion ?? null), x => port.setIntensity?.(x), { immediate: true })

  const danger = computed(() => dangerCue(dangerTier(store.state.danger), night.value, store.screen))
  watch(() => JSON.stringify(danger.value), () => port.setDanger(danger.value), { immediate: true })

  // The rising heartbeat, or a long climb, makes the night sound wrong.
  const tension = computed(() => tensionFor(context.value, danger.value.tier, danger.value.active, store.stage.tension))
  watch(tension, x => port.setTension?.(x), { immediate: true })

  // ---- one-shot sounds ----

  watch(() => store.cue, c => {
    if (c && CUES.has(c.id)) port.sfx(c.id as SfxName)
  })

  watch(() => store.currentNode, (now, before) => {
    if (!now || !before) return
    if (before.type === 'choice') port.sfx('choose')
    else if (now.type === 'say') port.sfx('tick')
  })

  watch(() => store.state.hp, (now, before) => {
    if (now < before) port.sfx('hurt')
  })

  watch(() => store.state.evidence.length + store.state.testimony.length, (now, before) => {
    if (now > before) port.sfx('gain')
  })

  // 21:00 on the clock: the tubes go out.
  watch(() => store.state.hour, (now, before) => {
    if (before < 21 && now >= 21 && now < 24 && store.screen !== 'title') port.sfx('lights_out')
  })

  // Someone steps out of the dark.
  watch(() => (store.screen === 'scene' ? store.currentSceneId : null), id => {
    // someone steps out of the dark: the music is cut dead, then the hit
    if (id && attackKind(id) === 'opening') port.sfx('ambush')
  })

  // Cross-examination: a reply either lands or costs persuasion.
  let lastPersuasion: number | null = null
  watch(() => store.exam, e => { lastPersuasion = e ? e.persuasion : null })
  watch(() => store.lastLinesView, lines => {
    const p = store.exam?.persuasion ?? null
    if (!lines.length || p === null) return
    const lost = lastPersuasion !== null && p < lastPersuasion
    // breaking a weak point is a blow, not a chime
    port.sfx(lost ? 'wrong' : store.examEvent?.kind === 'present' && store.lastOutcome === 'correct' ? 'smash' : 'right')
    // a right answer when one more mistake would end it: the tide turns. A wrong one afterwards loses it again.
    if (lost) rally.value = false
    else if (store.lastOutcome === 'correct' && examIntensity(p) >= 0.6) rally.value = true
    lastPersuasion = p
  })

  watch(ending, e => {
    if (e === 'clear') port.sfx('clear')
    else if (e === 'failed') port.sfx('fail')
  })

  // ---- browser plumbing ----

  const unlock = () => {
    port.unlock?.()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  const visibility = () => (document.hidden ? port.suspend?.() : port.resume?.())

  onMounted(() => {
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', visibility)
  })
  onBeforeUnmount(() => {
    if (presentingTimer) clearTimeout(presentingTimer)
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    document.removeEventListener('visibilitychange', visibility)
  })
}
