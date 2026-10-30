import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, triggerRef } from 'vue'
import type { GameState, Line, NpcId, Speaker } from './types'
import type { MoodId } from '../audio/moods'
import { createInitialState } from './state'
import { loadData, type RecordInfo } from './data'
import { plainText } from './markup'
import { SceneRunner, type SceneNode } from './script'
import { logLines, presentableIds, quoteList, toggleNote, type NoteResult } from './log'
import { advanceHour, availableActions, endDay, markActionDone, menuFor, slotsLeft as slotsLeftIn, type ActionDef } from './calendar'
import { markEventDone, nextEvent } from './events'
import { recordLimoAway, rollAttack } from './danger'
import { affinityTier, TIER_LABEL, trustLabel } from './affinity'
import { diffState, snapshot, type Change } from './changes'
import { resolveEvidenceImage } from './evidenceArt'
import { judgeFrames, type FrameOutcome } from './frames'
import { canDeduce, leadLine, MAX_MISSES, pendingMerge, startDeduction, submitDeduction as judgeDeduction, type DeductionOutcome, type DeductionSession } from './deduction'
import { aliasOf, foldedIds, ownedConclusions } from './conclusions'
import { buyItem, giveGift, openShop, type BuyResult, type GiftResult } from './gifts'
import { applyEffect } from './effects'
import { markSeen, visibleHotspots } from './rooms'
import type { TimeOfDay } from './backgrounds'
import { allSlots, anySave, clearSlot, migrateLegacySaves, readSlot, slotInfo, writeSlot, type SlotId } from './saves'
import { loadProfile, markChapterNoteSeen } from './profile'
import {
  flatten, getNode, isImportantChoice, newTimeline, parseTimeline, record, restoreState, serializeTimeline,
  type NodeKind, type Timeline, type TreeNode, type Trigger,
} from './timeline'
import {
  availableSteps, canPress, chooseOption, computeGuard, computePersuasion, EXAM_START, GAP_LIMIT, present, press,
  isSettleable, skipUnreachable, startExam, statementView, wasPressed, weakPoints,
  isStatementCleared, type ExamResult, type ExamState,
} from './crossexam'
import { nudgeLine, shouldNudge } from './examHint'

export type Screen = 'title' | 'chapters' | 'card' | 'recap' | 'scene' | 'hub' | 'shop' | 'investigate' | 'exam' | 'end'

export interface StageSlot { id: string; expr: string }
export interface StageState {
  bg: string
  time: TimeOfDay | null           // null = follow the clock
  left: StageSlot | null
  right: StageSlot | null
  side: 'left' | 'right' | null    // who is speaking; null = narration
  memory: boolean                  // a flashback: everything is drawn in grey
  mood: MoodId | null              // the music a scene asked for by name (null = whatever the place sounds like)
  tension: number                  // 0..1, how wrong the night sounds right now (a long climb); the heartbeat adds its own
}

const FIXED_NAMES: Record<string, string> = { lyc: '林一程', songyan: '宋砚', narration: '' }
const ALWAYS_LISTED = ['boss', 'mengyao', 'suwen', 'zhengcen', 'shaoxy', 'lucheng', 'limo', 'laohan']
const UNLISTED = ['tang', 'laoliu'] // a voice on a screen and a man in an alley: not people you can win over
const EXAM_WITNESS: Speaker = 'limo'

// Every chapter keeps its own rewind tree; the single tree the game used to have belongs to case 1.
const LEGACY_TIMELINE_KEY = 'jiudian-timeline'
function timelineKey(chapter: string): string {
  return `jiudian-timeline:${chapter}`
}

function migrateTimelineKey(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_TIMELINE_KEY)
    if (legacy === null) return
    const target = timelineKey('c1')
    if (localStorage.getItem(target) === null) localStorage.setItem(target, legacy)
    localStorage.removeItem(LEGACY_TIMELINE_KEY)
  } catch { /* storage blocked */ }
}

function readStoredTimeline(chapter: string): Timeline | null {
  try {
    return parseTimeline(localStorage.getItem(timelineKey(chapter)))
  } catch {
    return null
  }
}

const NOTHING: ExamResult = {
  outcome: 'ignored', lines: [], persuasion: 0, statementCleared: false, examCleared: false, failed: false,
}

// What the cross-examination screen is told after every move, so it can answer each one with its own animation
// (`n` changes every time, even when two answers look alike).
export interface ExamEvent {
  n: number
  kind: 'present' | 'press' | 'choose'
  outcome: ExamResult['outcome']
  stepId?: string
  target?: string
  revised: boolean
  guarded: boolean
  lost: number              // persuasion lost by this move
  lineCleared: boolean      // this move settled the line
}

export const useGameStore = defineStore('game', () => {
  // Saves and the rewind tree were single-chapter once: move them to case 1's keys the first time the new build runs.
  migrateTimelineKey()
  const migratedLegacy = migrateLegacySaves()
  // Shown once on the title screen: the saves the player already had now live in case 1.
  const migrationNotice = ref(migratedLegacy ? '已把你之前的存档归入【案一·熄灯】。' : '')
  function dismissLegacyNotice(): void { migrationNotice.value = '' }
  const data = loadData()
  const state = reactive(createInitialState()) as GameState
  // The chapter this run belongs to, and the endings it can reach.
  const chapter = computed(() => data.chapters[state.chapter] ?? data.chapters.c1)
  const endings = computed(() => chapter.value.endings)
  const screen = ref<Screen>('title')
  const runner = shallowRef<SceneRunner | null>(null)
  const tick = ref(0) // bumped after every runner change so `currentNode` recomputes
  const notice = ref('')
  const tip = ref<{ title: string; text: string } | null>(null) // a one-off explanation shown over the hub
  // The once-only note that saves and the rewind tree are kept per chapter (shown from chapter 2 on).
  const chapterNote = ref(false)
  function dismissTip(): void {
    if (chapterNote.value) {
      chapterNote.value = false
      markChapterNoteSeen()
    }
    tip.value = null
  }
  // From the second chapter on, tell the player once that each chapter keeps its own saves and rewinds.
  function maybeChapterNote(): void {
    if (chapter.value.order <= 1 || chapterNote.value) return
    if (loadProfile().seenChapterNote) return
    chapterNote.value = true
    tip.value = {
      title: '存档按章节分开',
      text: '从本章起，存档与回溯按章节分开保存。随时可以在章节选择里回到之前的章节，它们的存档不会被覆盖。',
    }
  }
  // An explanation that waits for the hub: it should not talk over a scene that is still playing.
  let pendingTip: { title: string; text: string } | null = null
  let onSceneEnd: (() => void) | null = null

  // ---- rewind tree: what started the scene being played, so that a choice in it can be replayed later ----
  const timelineRef = shallowRef<Timeline>(newTimeline())
  let trigger: Trigger | null = null      // the action or fixed event the current scene belongs to
  let triggerState = ''                   // JSON of the state at the moment it started
  let sceneChoices: number[] = []         // the answers given so far in this scene
  let interactiveSeen = false             // a deduction or frame check came up: the rest of the scene cannot be replayed
  let forced: number[] | null = null      // while replaying: the answers still to give on the way to the choice
  let skipHubRecord = false               // the hub we are about to enter is a node we just rewound to
  let lastDoneLabel = ''                  // what the player just did, for the next hub node's label

  // random source for attacks; tests replace it
  let rng: () => number = Math.random
  function setRng(fn: () => number): void {
    rng = fn
  }

  const gameOver = ref<string | null>(null)

  // The demo cross-examination offered from the title screen: it plays with the debug kit and never touches a save.
  const demoMode = ref(false)
  const demoMessage = ref('')

  // For the sound track: which scene is playing, and the latest sound cue a scene asked for (`n` makes repeats distinct).
  const currentSceneId = ref<string | null>(null)
  const cue = ref<{ id: string; n: number } | null>(null)
  let cueSeq = 0
  function playCue(id: string): void {
    if (forced !== null) return // a replay on its way to a choice stays silent
    cue.value = { id, n: ++cueSeq }
  }

  // What just moved (affinity, trust, health, money), for the little notices on screen. Danger is felt, never listed.
  type FeedItem = Change & { id: number }
  const feed = ref<FeedItem[]>([])
  let feedSeq = 0
  let lastSnap = snapshot(state)

  function reportChanges(): void {
    const now = snapshot(state)
    for (const c of diffState(lastSnap, now)) feed.value.push({ ...c, id: ++feedSeq })
    lastSnap = now
    if (feed.value.length > 8) feed.value.splice(0, feed.value.length - 8)
  }

  // ---- the nightly reasoning ----
  const session = ref<DeductionSession | null>(null)
  const deductionHint = ref('')
  const deductionLead = ref('')
  // The conclusion card a merge question just earned, shown until the player moves on.
  const deductionResult = ref<{ name: string; desc: string; aha?: string } | null>(null)

  const deduction = computed(() => {
    void tick.value
    const s = session.value
    if (!s) return null
    const folded = foldedIds(state, data.conclusions)
    const all = [
      ...state.evidence.map(id => ({ id, name: data.evidence.find(e => e.id === id)?.name ?? id, kind: 'evidence' as const })),
      ...state.testimony.map(id => ({ id, name: data.testimony.find(t => t.id === id)?.name ?? id, kind: 'testimony' as const })),
    ]
    // Pieces already folded into a conclusion are still pickable, but sink below the ones that have not been used yet.
    const items = [
      ...all.filter(i => !folded.has(i.id)).map(i => ({ ...i, folded: false })),
      ...all.filter(i => folded.has(i.id)).map(i => ({ ...i, folded: true })),
    ]
    return { def: s.def, left: MAX_MISSES - s.misses, hint: deductionHint.value, intro: s.def.intro ?? [], lead: deductionLead.value, items }
  })

  function submitDeduction(picked: string[]): DeductionOutcome {
    const s = session.value
    if (!s) return { kind: 'incomplete' }
    const out = judgeDeduction(state, s, picked)
    if (out.kind === 'wrong') {
      deductionHint.value = out.hint
      const distinct = [...new Set(picked)]
      const overlap = distinct.filter(id => s.def.answer.includes(id)).length
      deductionLead.value = leadLine(overlap, s.def.pick)
    } else if (out.kind !== 'incomplete') {
      const merge = s.def.tier !== undefined
      session.value = null
      deductionHint.value = ''
      deductionLead.value = ''
      if (merge && (out.kind === 'solved' || out.kind === 'forced')) {
        // a merge question stays on its node: the card is shown, and continuing finds the next question
        const card = data.conclusions.find(c => c.via === s.def.id)
        if (card) deductionResult.value = { name: card.name, desc: card.desc, aha: s.def.aha }
        else advance()
      } else {
        advance()
      }
    }
    return out
  }

  // Done looking at the card: find the next merge question tonight, or move past the node.
  function continueDeduction(): void {
    deductionResult.value = null
    settle()
  }

  // ---- the frame-by-frame check ----
  const frameFeedback = ref('')

  const frameCheck = computed(() => {
    void tick.value
    const n = currentNode.value
    if (!n || n.type !== 'frames') return null
    const def = data.frames[n.id]
    return def ? { def, feedback: frameFeedback.value } : null
  })

  function submitFrames(marked: string[]): FrameOutcome {
    const fc = frameCheck.value
    if (!fc) return { kind: 'incomplete' }
    const out = judgeFrames(fc.def, marked)
    if (out.kind === 'solved') {
      state.flags[`frames:${fc.def.id}:solved`] = true
      frameFeedback.value = ''
      advance()
    } else if (out.kind === 'partial') {
      const bits: string[] = []
      if (out.missing) bits.push(`还有 ${out.missing} 处破绽没找到`)
      if (out.wrong) bits.push(`有 ${out.wrong} 处标错了`)
      frameFeedback.value = bits.join('，') + '。'
    }
    return out
  }

  function skipFrames(): void {
    frameFeedback.value = ''
    advance()
  }

  // ---- cards in the middle of the screen: what you just found, what you are shown, what you present ----
  type PopupKind = 'evidence' | 'testimony' | 'show' | 'present'
  const popups = ref<{ id: number; kind: PopupKind; refId: string }[]>([])
  let popupSeq = 0
  let held = { evidence: new Set(state.evidence), testimony: new Set(state.testimony) }

  function queuePopup(kind: PopupKind, refId: string): void {
    const known = data.evidence.some(e => e.id === refId) || data.testimony.some(t => t.id === refId)
    if (known) popups.value.push({ id: ++popupSeq, kind, refId })
  }

  // Anything newly in your hands since the last look gets its card.
  function syncHeld(): void {
    for (const id of state.evidence) {
      if (!held.evidence.has(id)) {
        held.evidence.add(id)
        queuePopup('evidence', id)
      }
    }
    for (const id of state.testimony) {
      if (!held.testimony.has(id)) {
        held.testimony.add(id)
        queuePopup('testimony', id)
      }
    }
  }

  function dismissPopup(): void {
    popups.value.shift()
  }

  const popup = computed(() => {
    const p = popups.value[0]
    if (!p) return null
    const def = data.evidence.find(e => e.id === p.refId) ?? data.testimony.find(t => t.id === p.refId)
    if (!def) return null
    return { id: p.id, kind: p.kind, refId: p.refId, name: def.name, desc: def.desc, image: p.kind === 'testimony' ? null : resolveEvidenceImage(p.refId) }
  })

  function resetFeed(): void {
    feed.value = []
    lastSnap = snapshot(state)
    held = { evidence: new Set(state.evidence), testimony: new Set(state.testimony) }
    popups.value = []
  }

  function dismissFeed(id: number): void {
    feed.value = feed.value.filter(f => f.id !== id)
  }

  const loadError = ref('')
  const hasSave = ref(anySave(state.chapter))

  // cross-examination
  const exam = ref<ExamState | null>(null)
  const examIndex = ref(0)
  let examLastPersuasion = 0
  let pendingExam: string | null = null
  const examFailed = ref(false)
  // The player has the evidence window open (for the sound track: choosing evidence is the showdown, listening is not).
  const examPresenting = ref(false)
  function setExamPresenting(on: boolean): void { examPresenting.value = on }
  const lastLines = ref<Line[]>([])
  const lastOutcome = ref<string | null>(null)
  // The weak point the player has clicked and is about to choose evidence for.
  const examTarget = ref<string | null>(null)
  function setExamTarget(id: string | null): void { examTarget.value = id }
  const examEvent = ref<ExamEvent | null>(null)
  let examEventSeq = 0
  // The screen plays an animation when a step lands. When it asks for that (`stageExam`), the end of the act waits for it
  // to be over (`examContinue`); otherwise the act ends at once.
  let stagedExam = false
  const examHold = ref(false)
  let heldFinish: (() => void) | null = null
  function stageExam(on: boolean): void { stagedExam = on }
  function examContinue(): void {
    const go = heldFinish
    heldFinish = null
    examHold.value = false
    if (go) go()
  }

  const currentNode = computed<SceneNode | null>(() => {
    void tick.value
    return runner.value ? runner.value.current() : null
  })

  // investigating a room
  const roomId = ref<string | null>(null)
  let roomCost = 0
  let roomActionId = ''
  const room = computed(() => data.rooms.find(r => r.id === roomId.value) ?? null)
  const roomLooks = ref(0)
  // How many more spots you may look at before you must leave (null: no limit).
  const looksLeft = computed(() => (room.value?.budget === undefined ? null : Math.max(0, room.value.budget - roomLooks.value)))
  const hotspots = computed(() => (room.value ? visibleHotspots(state, room.value) : []))

  // Everyone you can win over and have already met, described in words rather than numbers.
  const relations = computed(() => {
    // The colleagues and Laohan are known from the start; the minor characters join the list once they have spoken.
    const met = new Set(state.backlog.map(l => l.speaker as string))
    return data.npcs
      .filter(n => ALWAYS_LISTED.includes(n.id) || (met.has(n.id) && !UNLISTED.includes(n.id)))
      .map(n => {
        if (n.id === 'laohan') {
          const tier = state.trust >= 60 ? 'high' : state.trust >= 50 ? 'good' : state.trust >= 40 ? 'mid' : 'low'
          return { id: n.id, name: n.name, kind: 'trust' as const, tier, label: trustLabel(state.trust), fill: Math.min(100, Math.round((state.trust / 80) * 100)) }
        }
        const tier = affinityTier(state.affinity[n.id])
        return { id: n.id, name: n.name, kind: 'affinity' as const, tier, label: TIER_LABEL[tier], fill: state.affinity[n.id] }
      })
  })

  // Everything that could be done this hour, and the five of it the hub actually offers.
  const pool = computed(() => availableActions(state, data.actions))
  const actions = computed(() => menuFor(state, pool.value))
  // Actions whose gift button should stand out: the person refused to talk until they were given something.
  const urged = computed(() => actions.value.filter(a => state.flags['urge:' + a.id]).map(a => a.id))
  const slotsLeft = computed(() => slotsLeftIn(state, chapter.value))
  // The shop is downstairs, not a meal-time errand: from the hub it is always open (each hour still allows two items).
  const canShop = computed(() => screen.value === 'hub')
  // The lunch and dinner hours: the hub still treats them differently (a quiet pause, even with nothing to do).
  const mealHour = computed(() => state.hour === 12 || state.hour === 18)

  // ---- stage: background + the two characters on screen ----

  const stage = reactive<StageState>({ bg: 'office', time: null, left: null, right: null, side: null, memory: false, mood: null, tension: 0 })

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

  // Back to the hub — unless a fixed event is due, which plays first and then comes back here.
  function toHub(): void {
    playDueEvents(() => {
      screen.value = 'hub'
      stage.memory = false
      stage.mood = null
      stage.tension = 0
      setBackground('office')
      recordHub()
      if (pendingTip) { tip.value = pendingTip; pendingTip = null }
    })
  }

  // Plays every fixed event that is due, one after the other, then carries on with `done`.
  function playDueEvents(done: () => void): void {
    const ev = nextEvent(state, data.events)
    if (!ev) {
      done()
      return
    }
    beginTrigger({ kind: 'event', id: ev.id })
    markEventDone(state, ev.id)
    screen.value = 'scene'
    playScene(ev.scene, () => playDueEvents(done))
  }

  function waitAnHour(): void {
    lastDoneLabel = '让这一个钟头过去'
    advanceHour(state, 1)
    toHub()
  }

  // After every runner change: sync the stage, and if the scene just ended, run its follow-up once.
  function settle(): void {
    tick.value += 1
    const node = runner.value ? runner.value.current() : null
    if (node && node.type === 'say') putOnStage(node.speaker, node.expr)
    reportChanges()
    syncHeld()
    if (node && (node.type === 'deduce' || node.type === 'frames')) interactiveSeen = true
    if (node && node.type === 'choice') maybeRecordChoice(node)
    if (node && node.type === 'deduce') {
      if (node.id.startsWith('tier:')) {
        // an evening of merge questions: each one solved brings the next, until none is left to ask
        const tier = Number(node.id.slice('tier:'.length))
        const def = pendingMerge(state, Object.values(data.deductions), tier)
        if (!def) {
          runner.value!.advance()
          settle()
          return
        }
        if (!session.value || session.value.def.id !== def.id) {
          session.value = startDeduction(def)
          deductionHint.value = ''
          deductionLead.value = ''
        }
      } else {
        const def = data.deductions[node.id]
        if (!def || state.flags[`deduce:${def.id}:solved`] || !canDeduce(state, def)) {
          // you never found the pieces (or already reasoned it out): the evening passes without a conclusion, and without a penalty
          runner.value!.advance()
          settle()
          return
        }
        if (!session.value || session.value.def.id !== def.id) {
          session.value = startDeduction(def)
          deductionHint.value = ''
          deductionLead.value = ''
        }
      }
    } else {
      session.value = null
      deductionResult.value = null
    }
    if (runner.value && node === null) {
      trigger = null
      // a scene can end the whole run by raising an `ending:<name>` flag (BAD END 3 and friends)
      const ending = Object.keys(state.flags).find(k => k.startsWith('ending:') && state.flags[k])
      if (ending && !gameOver.value) {
        gameOver.value = ending.slice('ending:'.length)
        onSceneEnd = null
        screen.value = 'end'
        return
      }
      if (state.hp <= 0 && !gameOver.value) {
        gameOver.value = 'hp'
        playScene('bad_end_1', () => {
          screen.value = 'end'
        })
        return
      }
      if (pendingExam) {
        const next = pendingExam
        pendingExam = null
        onSceneEnd = null
        startExamById(next)
        return
      }
      if (onSceneEnd) {
        const cb = onSceneEnd
        onSceneEnd = null
        cb()
      }
    }
  }

  function playScene(sceneId: string, done?: () => void): void {
    onSceneEnd = done ?? null
    clearActors()
    stage.memory = false // every scene starts in the present
    stage.mood = null
    stage.tension = 0
    currentSceneId.value = sceneId
    runner.value = new SceneRunner(state, data.scenes, { onBackground: setBackground, onSfx: playCue, onShow: id => queuePopup('show', id), onMemory: on => { stage.memory = on }, onMusic: m => { if (m.mood !== undefined) stage.mood = m.mood; if (m.tension !== undefined) stage.tension = m.tension }, onExam: id => { pendingExam = id } })
    pendingExam = null
    runner.value.start(sceneId)
    settle()
  }

  // A chapter starts from its own numbers, with its own empty rewind tree, and plays its own prologue.
  function startChapter(id: string): void {
    const ch = data.chapters[id]
    if (!ch) return
    demoMode.value = false
    demoMessage.value = ''
    Object.assign(state, createInitialState(ch))
    notice.value = ''
    exam.value = null
    examFailed.value = false
    gameOver.value = null
    resetFeed()
    trigger = null
    timelineRef.value = newTimeline()
    recordNode('start', '故事开始', state)
    screen.value = 'scene'
    playScene(ch.prologue, toHub)
    maybeChapterNote()
  }

  function newGame(): void {
    startChapter('c1')
  }

  function restart(): void {
    screen.value = 'title'
  }

  function advance(choice?: number): void {
    const cur = runner.value?.current()
    if (cur && cur.type === 'choice' && Number.isInteger(choice) && choice! >= 0 && choice! < cur.options.length) sceneChoices.push(choice!)
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
    const a = pool.value.find(x => x.id === actionId)
    if (!a) return
    if (a.room) {
      enterRoom(a.room, a.costHours, a.id)
      return
    }
    if (!a.scene) return
    beginTrigger({ kind: 'action', id: a.id, gift: giftItemId })
    // A gift is handed over before the talk, so that it can open the person up.
    if (giftItemId && a.npc) gift(a.npc, giftItemId)
    if (a.gate && a.npc && state.affinity[a.npc] < a.gate.affinity) {
      if (!rescueAction(a, a.gate)) {
        refuseAction(a, a.gate)
        return
      }
    }
    if (state.flags['urge:' + a.id]) state.flags['urge:' + a.id] = false
    screen.value = 'scene'
    playScene(a.scene, () => {
      lastDoneLabel = a.label
      if (!a.until || state.flags[a.until]) markActionDone(state, a.id)
      const when = state.hour
      if (a.away) recordLimoAway(state, when)
      advanceHour(state, a.costHours)
      if (!attackAfter(a, when)) toHub()
    })
  }

  // The person will not talk yet (affinity too low). No hour is spent and the action stays on offer; the gift button turns
  // red and, the first time, a tip says why. The item named in `give` is put in the bag if there is none, so it is never a dead end.
  function refuseAction(a: ActionDef, gate: NonNullable<ActionDef['gate']>): void {
    screen.value = 'scene'
    playScene(gate.scene, () => {
      lastDoneLabel = a.label
      let gave = ''
      if (gate.give && a.npc && !(state.giftsGiven[a.npc] ?? []).includes(gate.give) && (state.inventory[gate.give] ?? 0) === 0) {
        state.inventory[gate.give] = 1
        gave = itemName(gate.give)
      }
      state.flags['urge:' + a.id] = true
      if (gate.tip && !state.flags['tip:' + a.id]) {
        state.flags['tip:' + a.id] = true
        tip.value = { title: '小提示：送礼', text: gate.tip + (gave ? `\n\n（${gave} 已经放进你的背包。）` : '') }
      }
      toHub()
    })
  }

  // Day 1's 1-2: short of affinity and empty-handed, a pancake happens to be in the bag and is handed over on the spot,
  // so the visit still goes ahead. It happens once; and if the gift does not lift the affinity enough, it is undone whole
  // (flag, gift, item) so the ordinary refusal — and its tutorial — still plays.
  function rescueAction(a: ActionDef, gate: NonNullable<ActionDef['gate']>): boolean {
    if (!gate.rescue || !gate.give || !a.npc) return false
    const npc = a.npc
    const item = gate.give
    if (state.flags['rescued:' + a.id]) return false
    // the same person cannot be given two gifts in a day, nor the same thing twice
    if (state.giftedToday.includes(npc)) return false
    if ((state.giftsGiven[npc] ?? []).includes(item)) return false
    const had = state.inventory[item] ?? 0
    const giftsBefore = [...(state.giftsGiven[npc] ?? [])]
    const todayBefore = [...state.giftedToday]
    const affinityBefore = state.affinity[npc]
    const before = snapshot(state)
    const feedBefore = [...feed.value]
    state.flags['rescued:' + a.id] = true
    if (had === 0) state.inventory[item] = 1
    const r = gift(npc, item)
    if (r.ok && state.affinity[npc] >= gate.affinity) {
      notice.value = `背包里恰好有一个${itemName(item)}。`
      // the player never saw the refusal, so this is where the gift mechanic gets explained (once)
      if (gate.tip && !state.flags['tip:' + a.id]) {
        state.flags['tip:' + a.id] = true
        pendingTip = {
          title: '小提示：送礼与好感',
          text: `刚才那个${itemName(item)}，让${speakerName(npc as Speaker)}的好感涨了 15，他才肯开口。

${gate.tip}

想送礼，点行动旁边红色的“送礼”，从背包里选一样；超商随时都能去买。`,
        }
      }
      return true
    }
    // not enough after all: leave everything exactly as it was
    delete state.flags['rescued:' + a.id]
    if (giftsBefore.length > 0) state.giftsGiven[npc] = giftsBefore
    else delete state.giftsGiven[npc]
    state.giftedToday = todayBefore
    if (had === 0) delete state.inventory[item]
    else state.inventory[item] = had
    state.affinity[npc] = affinityBefore
    state.trust = before.trust
    feed.value.splice(0, feed.value.length, ...feedBefore)
    lastSnap = before
    notice.value = ''
    return false
  }

  // After an action, the dark may bite back (spec 6.4). Returns true if an attack scene took over.
  function attackAfter(a: ActionDef, when: number): boolean {
    if (!a.attack || !data.scenes[a.attack]) return false
    if (!rollAttack(state, a.risk ?? 'normal', rng)) return false
    recordLimoAway(state, when)
    screen.value = 'scene'
    playScene(a.attack, toHub)
    return true
  }

  function enterRoom(id: string, costHours: number, actionId: string): void {
    const r = data.rooms.find(x => x.id === id)
    if (!r) return
    roomId.value = id
    roomLooks.value = 0
    roomCost = costHours
    roomActionId = actionId
    screen.value = 'investigate'
    clearActors()
    setBackground(r.bg)
    if (r.intro && data.scenes[r.intro]) {
      screen.value = 'scene'
      playScene(r.intro, () => {
        screen.value = 'investigate'
        clearActors() // whoever talked in the intro does not stand in front of the room you are searching
        setBackground(r.bg)
      })
    }
  }

  function inspect(hotspotId: string): void {
    const r = room.value
    const h = hotspots.value.find(x => x.id === hotspotId)
    if (!r || !h) return
    if (h.seen) {
      notice.value = '这里你已经查过了。'
      return
    }
    screen.value = 'scene'
    playScene(h.scene, () => {
      markSeen(state, h.id)
      roomLooks.value += 1
      if (r.budget !== undefined && roomLooks.value >= r.budget) {
        if (r.cutoff && data.scenes[r.cutoff]) {
          screen.value = 'scene'
          playScene(r.cutoff, leaveRoom)
        } else {
          leaveRoom()
        }
        return
      }
      screen.value = 'investigate'
      clearActors()
      setBackground(r.bg)
    })
  }

  function leaveRoom(): void {
    const action = data.actions.find(a => a.id === roomActionId)
    if (action) lastDoneLabel = action.label
    // a search that has not found what it came for (`until`) stays on offer: the cost of a miss is the hour, not the clue
    if (!action || !action.until || state.flags[action.until]) markActionDone(state, roomActionId)
    const when = state.hour
    advanceHour(state, roomCost)
    roomId.value = null
    roomCost = 0
    roomActionId = ''
    if (!action || !attackAfter(action, when)) toHub()
  }

  function goShop(): void {
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
    reportChanges()
    return r
  }

  function gift(npcId: NpcId, itemId: string): GiftResult {
    const r = giveGift(state, data.npcs, npcId, itemId)
    notice.value = r.ok ? `把 ${itemName(itemId)} 送给了 ${speakerName(npcId)}` : '送不出去'
    reportChanges()
    return r
  }

  function restAtHome(): void {
    lastDoneLabel = '回家休息'
    state.hour = Math.max(state.hour, 22) // going home does not skip the evening: whatever is due tonight still happens
    playDueEvents(() => {
      endDay(state, { rested: true }, chapter.value)
      if (state.day > chapter.value.lastDay) screen.value = 'end' // nothing comes after the last day
      else toHub()
    })
  }

  // ---- save / load / debug jump ----

  function saveGame(slot: number = 1): boolean {
    if (demoMode.value) return false // the demo never writes a save
    const tl = timelineRef.value
    const head = getNode(tl, tl.head)
    // a save taken at the hub is a bookmark on the tree, so that loading it keeps the branches
    const { backlog, ...rest } = state
    const atHead = screen.value === 'hub' && head && head.kind === 'hub' && head.day === state.day && head.hour === state.hour
      && head.logLen === backlog.length && JSON.stringify(rest) === JSON.stringify(head.state)
    const mark = atHead && head ? { uid: tl.uid, node: head.id } : undefined
    if (writeSlot(slot, state, mark)) {
      hasSave.value = true
      slotsTick.value += 1
      notice.value = slot === 1 ? '已存档' : `已存到存档 ${slot}`
      return true
    }
    notice.value = '存档失败'
    return false
  }

  function loadGame(slot: SlotId = 1, chapterId: string = state.chapter): void {
    demoMode.value = false
    demoMessage.value = ''
    const r = readSlot(slot, chapterId)
    if (r.ok) {
      const mark = slotInfo(slot, chapterId)?.timeline
      if (mark) {
        const tl = timelineRef.value.uid === mark.uid ? timelineRef.value : readStoredTimeline(r.state.chapter)
        if (tl && tl.uid === mark.uid && getNode(tl, mark.node)) {
          timelineRef.value = tl
          rewindTo(mark.node)
          return
        }
      }
      Object.assign(state, r.state)
      resetRuntime()
      timelineRef.value = newTimeline()
      lastDoneLabel = '读取存档'
      toHub()
      return
    }
    loadError.value = r.reason === 'empty' ? '没有存档'
      : r.reason === 'chapter' ? '这是其他章节的存档，不能在当前章节里读取'
      : '存档无法读取'
    screen.value = 'title'
  }

  function deleteSlot(slot: number): void {
    clearSlot(slot, state.chapter)
    hasSave.value = anySave(state.chapter)
    slotsTick.value += 1
  }

  // "Continue": back to where the last session ended, with its whole rewind tree.
  function continueAuto(): void {
    continueChapter(state.chapter)
  }

  // "Continue" on the title screen: the most recent automatic save across every chapter.
  function continueLatest(): boolean {
    let best: { id: string; at: number } | null = null
    for (const ch of Object.values(data.chapters)) {
      const info = slotInfo('auto', ch.id)
      if (info && (!best || info.at > best.at)) best = { id: ch.id, at: info.at }
    }
    if (!best) return false
    continueChapter(best.id)
    return true
  }

  // Opens a chapter again: its own rewind tree if there is one, otherwise its automatic save.
  function continueChapter(id: string): void {
    if (!data.chapters[id]) return
    const stored = readStoredTimeline(id)
    if (stored && stored.head !== null) {
      state.chapter = id
      timelineRef.value = stored
      rewindTo(stored.head)
      maybeChapterNote()
      return
    }
    loadGame('auto', id)
    if (screen.value !== 'title') maybeChapterNote()
  }

  // [重新开始] on a chapter card: the chapter's automatic save and its rewind tree go; the manual slots stay.
  function resetChapter(id: string): void {
    clearSlot('auto', id)
    try {
      localStorage.removeItem(timelineKey(id))
    } catch { /* storage blocked */ }
    slotsTick.value += 1
    hasSave.value = anySave(state.chapter)
  }

  // Reading another chapter's save: the run being left first gets an automatic save of its own.
  function loadOther(slot: SlotId, chapterId: string): void {
    if (!data.chapters[chapterId]) return
    if (chapterId === state.chapter) {
      loadGame(slot, chapterId)
      return
    }
    if (!demoMode.value) {
      if (writeSlot('auto', state)) {
        hasSave.value = anySave(state.chapter)
        slotsTick.value += 1
      }
    }
    loadGame(slot, chapterId)
    if (screen.value !== 'title') maybeChapterNote()
  }

  // ---- the rewind tree ----

  function persistTimeline(): void {
    if (demoMode.value) return // the demo leaves the saved run's rewind tree alone
    try {
      localStorage.setItem(timelineKey(state.chapter), serializeTimeline(timelineRef.value))
    } catch { /* storage full or blocked: the tree lives on in memory */ }
  }

  function recordNode(kind: NodeKind, label: string, snap: GameState, resume?: TreeNode['resume']): void {
    record(timelineRef.value, snap, { kind, label, resume, refreshSameHub: kind === 'hub' })
    triggerRef(timelineRef)
    persistTimeline()
  }

  function beginTrigger(t: Trigger): void {
    trigger = t
    triggerState = JSON.stringify(state)
    sceneChoices = []
    interactiveSeen = false
  }

  function recordHub(): void {
    if (skipHubRecord) {
      skipHubRecord = false
      const head = getNode(timelineRef.value, timelineRef.value.head)
      if (head && head.kind === 'hub' && head.day === state.day && head.hour === state.hour) return
    }
    const done = lastDoneLabel
    lastDoneLabel = ''
    recordNode('hub', done ? `刚才：${done}` : state.hour <= 9 ? '新的一天' : '行动菜单', state)
    if (!demoMode.value) {
      if (writeSlot('auto', state, { uid: timelineRef.value.uid, node: timelineRef.value.head! })) flashAutoSave()
      hasSave.value = true
      slotsTick.value += 1
    }
  }

  // The little "saved" toast: once per chapter/day/hour, so walking in and out of the shop does not stack them.
  const saveNote = ref('')
  let saveNoteTimer: ReturnType<typeof setTimeout> | null = null
  let lastAutoSaveKey = ''
  function flashAutoSave(): void {
    const key = `${state.chapter}:${state.day}:${state.hour}`
    if (key === lastAutoSaveKey) return
    lastAutoSaveKey = key
    saveNote.value = `已自动保存（${chapter.value.title}·第 ${state.day} 天）`
    if (saveNoteTimer) clearTimeout(saveNoteTimer)
    saveNoteTimer = setTimeout(() => { saveNote.value = '' }, 3000)
  }

  function maybeRecordChoice(node: Extract<SceneNode, { type: 'choice' }>): void {
    if (forced !== null || !trigger || interactiveSeen) return
    if (!isImportantChoice(node, runner.value?.currentScene ?? '')) return
    const tl = timelineRef.value
    const head = getNode(tl, tl.head)
    const choices = [...sceneChoices]
    if (head && head.kind === 'choice' && head.resume && JSON.stringify(head.resume) === JSON.stringify({ trigger, choices })) return
    const label = node.options.slice(0, 3).map(o => o.text.replace(/[“”"（）()]/g, '').slice(0, 10)).join(' / ')
    recordNode('choice', label, JSON.parse(triggerState) as GameState, { trigger, choices })
  }

  // Everything that belongs to the moment being left behind.
  function resetRuntime(): void {
    gameOver.value = null
    pendingTip = null
    resetFeed()
    exam.value = null
    examFailed.value = false
    loadError.value = ''
    notice.value = ''
    pendingExam = null
    onSceneEnd = null
    roomId.value = null
    session.value = null
    deductionResult.value = null
    trigger = null
    forced = null
    lastDoneLabel = ''
    stage.memory = false
    stage.mood = null
    stage.tension = 0
  }

  // Plays the trigger again from its saved state, answering as before, and stops at the choice itself.
  function replay(res: NonNullable<TreeNode['resume']>): void {
    forced = [...res.choices]
    if (res.trigger.kind === 'action') startAction(res.trigger.id, res.trigger.gift)
    else toHub()
    let guard = 0
    while (forced !== null && guard++ < 4000) {
      const n = runner.value?.current()
      if (!n) break
      if (n.type === 'choice') {
        if (forced.length === 0) break
        advance(forced.shift())
      } else if (n.type === 'say') {
        advance()
      } else {
        break
      }
    }
    forced = null
  }

  function rewindTo(id: number): void {
    const tl = timelineRef.value
    const node = getNode(tl, id)
    if (!node) return
    Object.assign(state, restoreState(tl, id))
    // A node recorded before chapters carries no chapter of its own: that tree is case 1's run.
    if (!data.chapters[state.chapter]) {
      state.chapter = 'c1'
      state.version = 2
    }
    resetRuntime()
    tl.head = id
    triggerRef(timelineRef)
    persistTimeline()
    if (node.kind === 'start') {
      screen.value = 'scene'
      playScene(chapter.value.prologue, toHub)
    } else if (node.kind === 'choice' && node.resume) {
      replay(node.resume)
    } else {
      skipHubRecord = true
      toHub()
    }
  }

  const timelineRows = computed(() => flatten(timelineRef.value))
  const slotsTick = ref(0)
  const slotList = computed(() => { void slotsTick.value; return allSlots(state.chapter) })
  const autoSlot = computed(() => { void slotsTick.value; return slotInfo('auto', state.chapter) })
  function refreshSlots(): void {
    slotsTick.value += 1
  }

  // The dev jump to the finale is only offered once the story is over (and the UI keeps it hidden for now).
  const canJumpToFinale = computed(() => state.day === chapter.value.lastDay + 1 && exam.value === null)

  function jumpToFinale(): void {
    const ch = chapter.value
    Object.assign(state, createInitialState(ch))
    state.day = ch.lastDay
    state.hour = 14
    const kit = data.debugKit
    for (const id of kit.evidence) applyEffect(state, { kind: 'evidence', id })
    for (const id of kit.testimony) applyEffect(state, { kind: 'testimony', id })
    logLines(state, kit.backlog)
    gameOver.value = null
    resetFeed()
    exam.value = null
    examFailed.value = false
    notice.value = ''
    screen.value = 'scene'
    playScene(ch.trial.scene, () => startExamById(ch.trial.firstExam))
  }

  // The title screen's demo: the first act of the finale, played from the debug kit, then back to the title.
  function startDemoExam(): void {
    if (screen.value !== 'title') return
    const ch = data.chapters.c1 ?? chapter.value // the demo is case 1's first act, whichever chapter is loaded
    Object.assign(state, createInitialState(ch))
    state.day = ch.lastDay
    state.hour = 14
    const kit = data.debugKit
    for (const id of kit.evidence) applyEffect(state, { kind: 'evidence', id })
    for (const id of kit.testimony) applyEffect(state, { kind: 'testimony', id })
    logLines(state, kit.backlog)
    gameOver.value = null
    resetFeed()
    exam.value = null
    examFailed.value = false
    notice.value = ''
    demoMode.value = true
    demoMessage.value = ''
    screen.value = 'scene'
    playScene('demo_exam_intro', () => startExamById(ch.trial.firstExam))
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

  // What the player holds, with names and descriptions, in the order it was found (for the evidence file).
  const collected = computed(() => {
    const def = (list: { id: string; name: string; desc: string }[], id: string) =>
      list.find(d => d.id === id) ?? { id, name: id, desc: '' }
    const component = (id: string) => {
      if (state.evidence.includes(id)) return { id, name: def(data.evidence, id).name, kind: 'evidence' as const }
      if (state.testimony.includes(id)) return { id, name: def(data.testimony, id).name, kind: 'testimony' as const }
      return null
    }
    return {
      evidence: state.evidence.map(id => def(data.evidence, id)),
      testimony: state.testimony.map(id => def(data.testimony, id)),
      conclusions: ownedConclusions(state, data.conclusions).map(c => ({
        id: c.id,
        name: c.name,
        desc: c.desc,
        components: c.fold.flatMap(id => {
          const part = component(id)
          return part ? [part] : []
        }),
      })),
      folded: [...foldedIds(state, data.conclusions)],
    }
  })

  // Evidence, testimony and earned conclusion cards the player actually holds. Quotes are listed separately and never
  // named.
  const recordIds = computed(() => [...new Set([
    ...state.evidence, ...state.testimony, ...ownedConclusions(state, data.conclusions).map(c => c.id),
  ])])

  const recordNames = computed(() => {
    const out: Record<string, string> = {}
    for (const id of recordIds.value) {
      const def = data.evidence.find(e => e.id === id) ?? data.testimony.find(t => t.id === id)
      out[id] = def ? def.name : id
    }
    return out
  })

  // The same, filed for the evidence window: type, who it concerns, where and when, and a picture if there is one.
  const recordInfo = computed(() => {
    const out: Record<string, RecordInfo> = {}
    for (const id of recordIds.value) {
      const card = data.conclusions.find(c => c.id === id)
      if (card) {
        out[id] = { id, name: card.name, desc: card.desc, type: '结论', who: [], image: null }
        continue
      }
      const ev = data.evidence.find(e => e.id === id)
      const def = ev ?? data.testimony.find(t => t.id === id)
      const meta = data.recordMeta[id]
      out[id] = {
        id,
        name: def?.name ?? id,
        desc: def?.desc ?? '',
        type: meta?.type ?? (ev ? '记录' : '证言'),
        who: meta?.who ?? [],
        where: meta?.where,
        when: meta?.when,
        image: ev ? resolveEvidenceImage(id) : null,
      }
    }
    return out
  })

  // The line on screen: its text as it stands after every rewrite, which of its weak points are showing, and where the
  // whole act stands (one entry per line).
  const examView = computed(() => {
    const e = exam.value
    const st = examStatement.value
    if (!e || !st) return null
    const v = statementView(e, st.id)
    return {
      text: v.text,
      history: v.history,
      weak: weakPoints(e, st.id),
      cleared: isStatementCleared(e, st.id) && isSettleable(e, st.id),
      exhausted: availableSteps(e, st.id).length === 0,
      canPress: canPress(e, st.id),
      pressed: wasPressed(e, st.id),
      dots: e.def.statements.map(s => ({
        id: s.id,
        cleared: isStatementCleared(e, s.id) && isSettleable(e, s.id),
        pressed: wasPressed(e, s.id),
        revised: statementView(e, s.id).history.length > 0,
      })),
      guard: e.guard,
      gaps: e.priorGaps + e.gaps,
      gapLimit: GAP_LIMIT,
      max: Math.max(EXAM_START, e.persuasion),
      title: e.def.title,
    }
  })

  // What people said, ready to be shown to the witness. Narration and your own lines are not evidence of anything.
  const quotes = computed(() => {
    const speakerOf = new Map<string, string>()
    for (const l of state.backlog) speakerOf.set(l.tag ?? l.id, l.speaker)
    return quoteList(state)
      .filter(q => {
        const who = speakerOf.get(q.id)
        return who !== undefined && who !== 'narration' && who !== 'lyc'
      })
      .map(q => ({ ...q, who: speakerName(speakerOf.get(q.id) as Speaker) }))
  })

  // `retry`: the act is being started over after persuasion ran out; if it cannot even be begun, that is the end.
  function startExamById(id: string, retry = false): void {
    const def = data.exams[id]
    if (!def) return
    const persuasion = computePersuasion(state)
    if (persuasion <= 0) {
      examFailed.value = true
      gameOver.value = 'bad2'
      screen.value = 'end'
      return
    }
    exam.value = startExam(def, persuasion, state.examGaps ?? 0, computeGuard(state))
    examPresenting.value = false
    examLastPersuasion = persuasion
    examIndex.value = 0
    examFailed.value = false
    examTarget.value = null
    examEvent.value = null
    examHold.value = false
    heldFinish = null
    lastLines.value = []
    lastOutcome.value = null
    screen.value = 'exam'
    setBackground('meeting_a')
    resetExamStage()
    applySkips()
    examLastPersuasion = exam.value.persuasion
    if (exam.value.failed && retry) {
      examFailed.value = true
      gameOver.value = 'bad2'
      screen.value = 'end'
      return
    }
    if (exam.value.failed || exam.value.cleared) afterExamStep({ ...NOTHING, failed: exam.value.failed, examCleared: exam.value.cleared })
  }

  // Persuasion ran out: the act is not lost, it is begun again (the gaps that cost it are counted once only).
  function retryExam(): void {
    const id = exam.value?.def.id
    if (!id) return
    tip.value = { title: '说服力耗尽', text: '……你的话被一句句驳了回来，局面彻底失控。\n\n定一定神，回到这一幕的开头，重新整理思路。' }
    startExamById(id, true)
  }

  // Evidence you never found: those steps are let through at a cost (and the player is told).
  function applySkips(): void {
    const e = exam.value
    if (!e) return
    const before = e.persuasion
    if (skipUnreachable(e, presentableIds(state)).length > 0) {
      notice.value = `手里缺少对应的证据，这一步只能硬着头皮过去（说服力 −${before - e.persuasion}，已有 ${e.priorGaps + e.gaps}/${GAP_LIMIT} 处破绽，满 ${GAP_LIMIT} 处就输了）`
    }
  }

  // After a step: let missing evidence through, and report where the act stands now.
  function settleExamStep(result: ExamResult, wasCleared = false): ExamResult {
    const e = exam.value
    if (!e) return afterExamStep(result)
    applySkips()
    const st = examStatement.value
    return afterExamStep({
      ...result,
      persuasion: e.persuasion,
      examCleared: e.cleared,
      failed: e.failed,
      statementCleared: st ? isStatementCleared(e, st.id) : result.statementCleared,
    }, wasCleared)
  }

  // The witness stands alone on the right between replies.
  function resetExamStage(): void {
    clearActors()
    stage.right = { id: EXAM_WITNESS, expr: 'normal' }
  }

  function examGoto(index: number): void {
    const n = exam.value?.def.statements.length ?? 0
    examIndex.value = Math.max(0, Math.min(n - 1, index))
    lastLines.value = []
    lastOutcome.value = null
    examTarget.value = null
    resetExamStage()
  }

  function afterExamStep(result: ExamResult, wasCleared = false): ExamResult {
    if (screen.value !== 'exam') return result
    // Their annoyed comebacks to a wrong, early or repeated presentation are not testimony: keep them out of the log.
    if (result.outcome === 'correct' || result.stepId) logLines(state, result.lines)
    lastLines.value = result.lines
    lastOutcome.value = result.outcome
    examTarget.value = null
    examEvent.value = {
      n: ++examEventSeq,
      kind: examKind,
      outcome: result.outcome,
      stepId: result.stepId,
      target: result.target,
      revised: Boolean(result.revised),
      guarded: Boolean(result.guarded),
      lost: Math.max(0, examLastPersuasion - result.persuasion),
      lineCleared: result.statementCleared && !wasCleared,
    }
    examLastPersuasion = result.persuasion
    for (const l of result.lines) {
      // the witness and you are on stage; anyone else (the detective) just speaks from the side
      if (l.speaker === 'lyc' || l.speaker === EXAM_WITNESS || l.speaker === 'narration') putOnStage(l.speaker, l.expr)
      else stage.side = null
    }
    if (result.failed) {
      // The demo never loses: running out of persuasion or holes only starts the act over.
      if (demoMode.value) {
        retryExam()
        return result
      }
      // Persuasion running out only costs the act (it starts again); too many holes in the evidence loses the finale.
      const holes = (exam.value?.priorGaps ?? 0) + (exam.value?.gaps ?? 0)
      if (holes >= GAP_LIMIT) {
        examFailed.value = true
        gameOver.value = 'bad2'
        screen.value = 'end'
      } else {
        retryExam()
      }
    } else if (result.examCleared) {
      const finish = (): void => {
        if (demoMode.value) {
          exam.value = null
          examFailed.value = false
          demoMode.value = false
          demoMessage.value = '试玩结束。想看完整的故事，从“开始游戏”开始。'
          screen.value = 'title'
          return
        }
        state.examGaps = (state.examGaps ?? 0) + (exam.value?.gaps ?? 0)
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
      // The blow that ends the act gets to land before the screen moves on.
      if (stagedExam && result.stepId) {
        heldFinish = finish
        examHold.value = true
      } else {
        finish()
      }
    }
    return result
  }

  // What the witness says when a line is rewritten is also on the record: it can be quoted back at them later.
  function logRewrite(result: ExamResult): void {
    const st = examStatement.value
    const step = st?.steps.find(s => s.id === result.stepId)
    if (!step) return
    const text = [step.revise, step.append].filter((t): t is string => Boolean(t)).map(plainText).join('')
    if (text) logLines(state, [{ speaker: EXAM_WITNESS, text }])
  }

  let examKind: ExamEvent['kind'] = 'present'

  function runExam(kind: ExamEvent['kind'], fn: (e: ExamState, statementId: string) => ExamResult): ExamResult {
    const e = exam.value
    const st = examStatement.value
    if (!e || !st || examHold.value) return NOTHING
    const wasCleared = isStatementCleared(e, st.id)
    examKind = kind
    const result = fn(e, st.id)
    if (result.revised) logRewrite(result)
    return settleExamStep(result, wasCleared)
  }

  function examPresent(itemId: string, target?: string): ExamResult {
    if (!exam.value || !examStatement.value || examHold.value) return NOTHING
    queuePopup('present', itemId)
    const owned = [...presentableIds(state), ...ownedConclusions(state, data.conclusions).map(c => c.id)]
    return runExam('present', (e, id) => {
      const r = present(e, id, itemId, owned, target, aliasOf(state, data.conclusions, itemId))
      const level = shouldNudge(r.stuck ?? 0)
      if (level === 0) return r
      const hint = nudgeLine(e, id, level, data.recordMeta, x =>
        state.evidence.includes(x) ? 'evidence' : state.testimony.includes(x) ? 'testimony' : 'other')
      return hint ? { ...r, lines: [...r.lines, hint] } : r
    })
  }

  function examPress(): ExamResult {
    return runExam('press', (e, id) => press(e, id))
  }

  function examChoose(stepId: string, optionIndex: number): ExamResult {
    return runExam('choose', (e, id) => chooseOption(e, id, stepId, optionIndex))
  }

  return {
    data, state, chapter, endings, screen, stage, currentNode, currentSceneId, cue, relations, collected, slotsLeft, feed, popup, dismissPopup, deduction, deductionResult, submitDeduction, continueDeduction, frameCheck, submitFrames, skipFrames, dismissFeed, gameOver, setRng, lastOutcome, notice, tip, dismissTip, actions, urged, canShop, mealHour,
    playScene, newGame, startChapter, continueChapter, restart, advance, note, speakerName, itemName,
    startAction, waitAnHour, room, hotspots, looksLeft, inspect, leaveRoom, goShop, leaveShop, buy, gift, restAtHome,
    loadError, hasSave, saveGame, loadGame, deleteSlot, continueAuto, continueLatest, resetChapter, loadOther, rewindTo, timelineRows, slotList, autoSlot, slotInfo, refreshSlots, canJumpToFinale, jumpToFinale,
    saveNote, migrationNotice, dismissLegacyNotice,
    exam, examIndex, examFailed, examPresenting, setExamPresenting, examStatement, lastLinesView, argument, recordIds, recordNames, quotes,
    recordInfo, examView, examTarget, setExamTarget, examEvent, examHold, stageExam, examContinue,
    startExamById, examGoto, examPresent, examPress, examChoose,
    demoMode, demoMessage, startDemoExam,
  }
})
