import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type { GameState, Line, NpcId, Speaker } from './types'
import { createInitialState } from './state'
import { loadData } from './data'
import { SceneRunner, type SceneNode } from './script'
import { logLines, presentableIds, quoteList, toggleNote, type NoteResult } from './log'
import { advanceHour, availableActions, endDay } from './calendar'
import { buyItem, giveGift, openShop, type BuyResult, type GiftResult } from './gifts'
import { applyEffect } from './effects'
import { markSeen, visibleHotspots } from './rooms'
import type { TimeOfDay } from './backgrounds'
import { loadSave, serializeState } from './save'
import {
  availableSteps, chooseOption, computePersuasion, present, press, startExam,
  type ExamResult, type ExamState,
} from './crossexam'

export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'investigate' | 'exam' | 'end'

export interface StageSlot { id: string; expr: string }
export interface StageState {
  bg: string
  time: TimeOfDay | null           // null = follow the clock
  left: StageSlot | null
  right: StageSlot | null
  side: 'left' | 'right' | null    // who is speaking; null = narration
}

const FIXED_NAMES: Record<string, string> = { lyc: '林一程', songyan: '宋砚', narration: '' }
const SHOP_HOURS = [12, 18]
const EXAM_WITNESS: Speaker = 'limo'
const SAVE_KEY = 'jiudian-save'

function readSlot(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY)
  } catch {
    return null
  }
}

const NOTHING: ExamResult = {
  outcome: 'ignored', lines: [], persuasion: 0, statementCleared: false, examCleared: false, failed: false,
}

export const useGameStore = defineStore('game', () => {
  const data = loadData()
  const state = reactive(createInitialState()) as GameState
  const screen = ref<Screen>('title')
  const runner = shallowRef<SceneRunner | null>(null)
  const tick = ref(0) // bumped after every runner change so `currentNode` recomputes
  const notice = ref('')
  let onSceneEnd: (() => void) | null = null

  const loadError = ref('')
  const hasSave = ref(readSlot() !== null)

  // cross-examination
  const exam = ref<ExamState | null>(null)
  const examIndex = ref(0)
  const examFailed = ref(false)
  const lastLines = ref<Line[]>([])

  const currentNode = computed<SceneNode | null>(() => {
    void tick.value
    return runner.value ? runner.value.current() : null
  })

  // investigating a room
  const roomId = ref<string | null>(null)
  let roomCost = 0
  const room = computed(() => data.rooms.find(r => r.id === roomId.value) ?? null)
  const hotspots = computed(() => (room.value ? visibleHotspots(state, room.value) : []))

  const actions = computed(() => availableActions(state, data.actions))
  const canShop = computed(() => SHOP_HOURS.includes(state.hour))

  // ---- stage: background + the two characters on screen ----

  const stage = reactive<StageState>({ bg: 'office', time: null, left: null, right: null, side: null })

  function clearActors(): void {
    stage.left = null
    stage.right = null
    stage.side = null
  }

  function setBackground(id: string, time: TimeOfDay | null = null): void {
    if (id !== stage.bg || time !== stage.time) clearActors() // a new place: the actors leave
    stage.bg = id
    stage.time = time
  }

  // The protagonist stands on the left, everyone else on the right; narration dims nobody.
  function putOnStage(speaker: Speaker, expr = 'normal'): void {
    if (speaker === 'narration') {
      stage.side = null
    } else if (speaker === 'lyc') {
      stage.left = { id: speaker, expr }
      stage.side = 'left'
    } else {
      stage.right = { id: speaker, expr }
      stage.side = 'right'
    }
  }

  function toHub(): void {
    screen.value = 'hub'
    setBackground('office')
  }

  // After every runner change: sync the stage, and if the scene just ended, run its follow-up once.
  function settle(): void {
    tick.value += 1
    const node = runner.value ? runner.value.current() : null
    if (node && node.type === 'say') putOnStage(node.speaker, node.expr)
    if (runner.value && node === null && onSceneEnd) {
      const cb = onSceneEnd
      onSceneEnd = null
      cb()
    }
  }

  function playScene(sceneId: string, done?: () => void): void {
    onSceneEnd = done ?? null
    clearActors()
    runner.value = new SceneRunner(state, data.scenes, { onBackground: setBackground })
    runner.value.start(sceneId)
    settle()
  }

  function newGame(): void {
    Object.assign(state, createInitialState())
    notice.value = ''
    exam.value = null
    examFailed.value = false
    screen.value = 'scene'
    playScene('prologue', () => {
      endDay(state, { rested: false }) // day 1 -> day 2
      playScene('day2_desk', () => {
        state.hour = 12
        playScene('day2_lunch', toHub)
      })
    })
  }

  function restart(): void {
    screen.value = 'title'
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
    if (a.room) {
      enterRoom(a.room, a.costHours)
      return
    }
    if (!a.scene) return
    screen.value = 'scene'
    playScene(a.scene, () => {
      advanceHour(state, a.costHours)
      if (giftItemId && a.npc) gift(a.npc, giftItemId)
      toHub()
    })
  }

  function enterRoom(id: string, costHours: number): void {
    const r = data.rooms.find(x => x.id === id)
    if (!r) return
    roomId.value = id
    roomCost = costHours
    screen.value = 'investigate'
    clearActors()
    setBackground(r.bg)
  }

  function inspect(hotspotId: string): void {
    const r = room.value
    const h = hotspots.value.find(x => x.id === hotspotId)
    if (!r || !h) return
    screen.value = 'scene'
    playScene(h.scene, () => {
      markSeen(state, h.id)
      screen.value = 'investigate'
      setBackground(r.bg)
    })
  }

  function leaveRoom(): void {
    advanceHour(state, roomCost)
    roomId.value = null
    roomCost = 0
    toHub()
  }

  function goShop(): void {
    if (!canShop.value) return
    openShop(state)
    screen.value = 'shop'
    setBackground('store')
  }

  function leaveShop(): void {
    toHub()
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

  // ---- save / load / debug jump ----

  function saveGame(): boolean {
    try {
      localStorage.setItem(SAVE_KEY, serializeState(state))
      hasSave.value = true
      notice.value = '已存档'
      return true
    } catch {
      notice.value = '存档失败'
      return false
    }
  }

  function loadGame(): void {
    const r = loadSave(readSlot())
    if (r.ok) {
      Object.assign(state, r.state)
      exam.value = null
      examFailed.value = false
      loadError.value = ''
      toHub()
      return
    }
    loadError.value = r.reason === 'empty' ? '没有存档' : '存档无法读取'
    screen.value = 'title'
  }

  // After day 2 the slice offers the finale; `exam` is only set once the finale has started.
  const canJumpToFinale = computed(() => state.day === 3 && exam.value === null)

  function jumpToFinale(): void {
    Object.assign(state, createInitialState())
    state.day = 5
    state.hour = 14
    const kit = data.debugKit
    for (const id of kit.evidence) applyEffect(state, { kind: 'evidence', id })
    for (const id of kit.testimony) applyEffect(state, { kind: 'testimony', id })
    logLines(state, kit.backlog)
    exam.value = null
    examFailed.value = false
    notice.value = ''
    screen.value = 'scene'
    playScene('finale_intro', () => startExamById('finale_act1'))
  }

  // ---- cross-examination ----

  const examStatement = computed(() => exam.value?.def.statements[examIndex.value] ?? null)

  const lastLinesView = computed(() => lastLines.value.map(l => ({ name: speakerName(l.speaker), text: l.text })))

  const argument = computed(() => {
    if (!exam.value || !examStatement.value) return null
    const step = availableSteps(exam.value, examStatement.value.id).find(s => s.kind === 'argument')
    if (!step || step.kind !== 'argument') return null
    return { stepId: step.id, prompt: step.prompt, options: step.options.map(o => o.text) }
  })

  // Evidence and testimony the player actually holds. Quotes are listed separately and never named.
  const recordIds = computed(() => [...new Set([...state.evidence, ...state.testimony])])

  const recordNames = computed(() => {
    const out: Record<string, string> = {}
    for (const id of recordIds.value) {
      const def = data.evidence.find(e => e.id === id) ?? data.testimony.find(t => t.id === id)
      out[id] = def ? def.name : id
    }
    return out
  })

  const quotes = computed(() => quoteList(state))

  function startExamById(id: string): void {
    const def = data.exams[id]
    if (!def) return
    exam.value = startExam(def, computePersuasion(state))
    examIndex.value = 0
    examFailed.value = false
    lastLines.value = []
    screen.value = 'exam'
    setBackground('meeting_a')
    resetExamStage()
  }

  // The witness stands alone on the right between replies.
  function resetExamStage(): void {
    clearActors()
    stage.right = { id: EXAM_WITNESS, expr: 'normal' }
  }

  function examGoto(index: number): void {
    const n = exam.value?.def.statements.length ?? 0
    examIndex.value = Math.max(0, Math.min(n - 1, index))
    resetExamStage()
  }

  function afterExamStep(result: ExamResult): ExamResult {
    if (screen.value !== 'exam') return result
    logLines(state, result.lines)
    lastLines.value = result.lines
    for (const l of result.lines) putOnStage(l.speaker, l.expr)
    if (result.failed) {
      examFailed.value = true
      screen.value = 'end'
    } else if (result.examCleared) {
      const onClear = exam.value?.def.onClear
      if (onClear) {
        screen.value = 'scene'
        playScene(onClear, () => {
          screen.value = 'end'
        })
      } else {
        screen.value = 'end'
      }
    }
    return result
  }

  function examPresent(itemId: string): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    return afterExamStep(present(exam.value, examStatement.value.id, itemId, presentableIds(state)))
  }

  function examPress(): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    return afterExamStep(press(exam.value, examStatement.value.id))
  }

  function examChoose(stepId: string, optionIndex: number): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    return afterExamStep(chooseOption(exam.value, examStatement.value.id, stepId, optionIndex))
  }

  return {
    data, state, screen, stage, currentNode, notice, actions, canShop,
    playScene, newGame, restart, advance, note, speakerName, itemName,
    startAction, room, hotspots, inspect, leaveRoom, goShop, leaveShop, buy, gift, restAtHome,
    loadError, hasSave, saveGame, loadGame, canJumpToFinale, jumpToFinale,
    exam, examIndex, examFailed, examStatement, lastLinesView, argument, recordIds, recordNames, quotes,
    startExamById, examGoto, examPresent, examPress, examChoose,
  }
})
