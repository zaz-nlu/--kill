import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type { GameState, Line, NpcId, Speaker } from './types'
import { createInitialState } from './state'
import { loadData } from './data'
import { SceneRunner, type SceneNode } from './script'
import { logLines, presentableIds, toggleNote, type NoteResult } from './log'
import { advanceHour, availableActions, endDay } from './calendar'
import { buyItem, giveGift, openShop, type BuyResult, type GiftResult } from './gifts'
import {
  availableSteps, chooseOption, computePersuasion, present, press, startExam,
  type ExamResult, type ExamState,
} from './crossexam'

export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'exam' | 'end'

const FIXED_NAMES: Record<string, string> = { lyc: '林一程', songyan: '宋砚', narration: '' }
const SHOP_HOURS = [12, 18]

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

  // cross-examination
  const exam = ref<ExamState | null>(null)
  const examIndex = ref(0)
  const examFailed = ref(false)
  const lastLines = ref<Line[]>([])

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
    exam.value = null
    examFailed.value = false
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

  // ---- cross-examination ----

  const examStatement = computed(() => exam.value?.def.statements[examIndex.value] ?? null)

  const lastLinesView = computed(() => lastLines.value.map(l => ({ name: speakerName(l.speaker), text: l.text })))

  const argument = computed(() => {
    if (!exam.value || !examStatement.value) return null
    const step = availableSteps(exam.value, examStatement.value.id).find(s => s.kind === 'argument')
    if (!step || step.kind !== 'argument') return null
    return { stepId: step.id, prompt: step.prompt, options: step.options.map(o => o.text) }
  })

  const recordIds = computed(() => presentableIds(state))

  const recordNames = computed(() => {
    const out: Record<string, string> = {}
    for (const id of recordIds.value) {
      const def = data.evidence.find(e => e.id === id) ?? data.testimony.find(t => t.id === id)
      if (def) {
        out[id] = def.name
        continue
      }
      const quote = state.backlog.find(l => l.tag === id)
      out[id] = `原话：${(quote?.text ?? id).slice(0, 14)}`
    }
    return out
  })

  function startExamById(id: string): void {
    const def = data.exams[id]
    if (!def) return
    exam.value = startExam(def, computePersuasion(state))
    examIndex.value = 0
    examFailed.value = false
    lastLines.value = []
    screen.value = 'exam'
  }

  function examGoto(index: number): void {
    const n = exam.value?.def.statements.length ?? 0
    examIndex.value = Math.max(0, Math.min(n - 1, index))
  }

  function afterExamStep(result: ExamResult): ExamResult {
    if (screen.value !== 'exam') return result
    logLines(state, result.lines)
    lastLines.value = result.lines
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
    data, state, screen, currentNode, notice, actions, canShop,
    playScene, newGame, restart, advance, note, speakerName, itemName,
    startAction, goShop, leaveShop, buy, gift, restAtHome,
    exam, examIndex, examFailed, examStatement, lastLinesView, argument, recordIds, recordNames,
    startExamById, examGoto, examPresent, examPress, examChoose,
  }
})
