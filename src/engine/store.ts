import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type { GameState, Speaker } from './types'
import { createInitialState } from './state'
import { loadData } from './data'
import { SceneRunner, type SceneNode } from './script'
import { toggleNote, type NoteResult } from './log'

export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'exam' | 'end'

const FIXED_NAMES: Record<string, string> = { lyc: '林一程', songyan: '宋砚', narration: '' }

export const useGameStore = defineStore('game', () => {
  const data = loadData()
  const state = reactive(createInitialState()) as GameState
  const screen = ref<Screen>('title')
  const runner = shallowRef<SceneRunner | null>(null)
  const tick = ref(0) // bumped after every runner change so `currentNode` recomputes

  const currentNode = computed<SceneNode | null>(() => {
    void tick.value
    return runner.value ? runner.value.current() : null
  })

  function playScene(sceneId: string): void {
    runner.value = new SceneRunner(state, data.scenes)
    runner.value.start(sceneId)
    tick.value += 1
  }

  function newGame(): void {
    Object.assign(state, createInitialState())
    screen.value = 'scene'
    playScene('prologue')
  }

  function advance(choice?: number): void {
    runner.value?.advance(choice)
    tick.value += 1
  }

  function note(lineId: string): NoteResult {
    return toggleNote(state, lineId)
  }

  function speakerName(speaker: Speaker): string {
    if (speaker in FIXED_NAMES) return FIXED_NAMES[speaker]
    return data.npcs.find(n => n.id === speaker)?.name ?? speaker
  }

  return { data, state, screen, currentNode, playScene, newGame, advance, note, speakerName }
})
