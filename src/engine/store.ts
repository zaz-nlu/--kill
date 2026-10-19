import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type { GameState, NpcId, Speaker } from './types'
import { createInitialState } from './state'
import { loadData } from './data'
import { SceneRunner, type SceneNode } from './script'
import { toggleNote, type NoteResult } from './log'
import { advanceHour, availableActions, endDay } from './calendar'
import { buyItem, giveGift, openShop, type BuyResult, type GiftResult } from './gifts'

export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'exam' | 'end'

const FIXED_NAMES: Record<string, string> = { lyc: '林一程', songyan: '宋砚', narration: '' }
const SHOP_HOURS = [12, 18]

export const useGameStore = defineStore('game', () => {
  const data = loadData()
  const state = reactive(createInitialState()) as GameState
  const screen = ref<Screen>('title')
  const runner = shallowRef<SceneRunner | null>(null)
  const tick = ref(0) // bumped after every runner change so `currentNode` recomputes
  const notice = ref('')
  let onSceneEnd: (() => void) | null = null

  const currentNode = computed<SceneNode | null>(() => {
    void tick.value
    return runner.value ? runner.value.current() : null
  })

  const actions = computed(() => availableActions(state, data.actions))
  const canShop = computed(() => SHOP_HOURS.includes(state.hour))

  // After every runner change: if the scene just ended, run its follow-up once.
  function settle(): void {
    tick.value += 1
    if (runner.value && runner.value.current() === null && onSceneEnd) {
      const cb = onSceneEnd
      onSceneEnd = null
      cb()
    }
  }

  function playScene(sceneId: string, done?: () => void): void {
    onSceneEnd = done ?? null
    runner.value = new SceneRunner(state, data.scenes)
    runner.value.start(sceneId)
    settle()
  }

  function newGame(): void {
    Object.assign(state, createInitialState())
    notice.value = ''
    screen.value = 'scene'
    playScene('prologue', () => {
      endDay(state, { rested: false }) // day 1 -> day 2
      playScene('day2_desk', () => {
        state.hour = 12
        playScene('day2_lunch', () => {
          screen.value = 'hub'
        })
      })
    })
  }

  function advance(choice?: number): void {
    runner.value?.advance(choice)
    settle()
  }

  function note(lineId: string): NoteResult {
    return toggleNote(state, lineId)
  }

  function speakerName(speaker: Speaker): string {
    if (speaker in FIXED_NAMES) return FIXED_NAMES[speaker]
    return data.npcs.find(n => n.id === speaker)?.name ?? speaker
  }

  function itemName(itemId: string): string {
    return data.items.find(i => i.id === itemId)?.name ?? itemId
  }

  function startAction(actionId: string, giftItemId?: string): void {
    const a = actions.value.find(x => x.id === actionId)
    if (!a) return
    screen.value = 'scene'
    playScene(a.scene, () => {
      advanceHour(state, a.costHours)
      if (giftItemId && a.npc) gift(a.npc, giftItemId)
      screen.value = 'hub'
    })
  }

  function goShop(): void {
    if (!canShop.value) return
    openShop(state)
    screen.value = 'shop'
  }

  function leaveShop(): void {
    screen.value = 'hub'
  }

  function buy(itemId: string): BuyResult {
    const r = buyItem(state, data.items, itemId)
    notice.value = r.ok ? `买了 ${itemName(itemId)}` : '买不了'
    return r
  }

  function gift(npcId: NpcId, itemId: string): GiftResult {
    const r = giveGift(state, data.npcs, npcId, itemId)
    notice.value = r.ok ? `把 ${itemName(itemId)} 送给了 ${speakerName(npcId)}` : '送不出去'
    return r
  }

  function restAtHome(): void {
    endDay(state, { rested: true })
    screen.value = 'end' // the slice stops after day 2
  }

  return {
    data, state, screen, currentNode, notice, actions, canShop,
    playScene, newGame, advance, note, speakerName, itemName,
    startAction, goShop, leaveShop, buy, gift, restAtHome,
  }
})
