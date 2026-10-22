import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, triggerRef } from 'vue'
import type { GameState, Line, NpcId, Speaker } from './types'
import type { MoodId } from '../audio/moods'
import { createInitialState } from './state'
import { loadData } from './data'
import { SceneRunner, type SceneNode } from './script'
import { logLines, presentableIds, quoteList, toggleNote, type NoteResult } from './log'
import { advanceHour, availableActions, endDay, markActionDone, menuFor, slotsLeft as slotsLeftIn, type ActionDef } from './calendar'
import { markEventDone, nextEvent } from './events'
import { recordLimoAway, rollAttack } from './danger'
import { affinityTier, TIER_LABEL, trustLabel } from './affinity'
import { diffState, snapshot, type Change } from './changes'
import { resolveEvidenceImage } from './evidenceArt'
import { judgeFrames, type FrameOutcome } from './frames'
import { canDeduce, MAX_MISSES, startDeduction, submitDeduction as judgeDeduction, type DeductionOutcome, type DeductionSession } from './deduction'
import { buyItem, giveGift, openShop, type BuyResult, type GiftResult } from './gifts'
import { applyEffect } from './effects'
import { markSeen, visibleHotspots } from './rooms'
import type { TimeOfDay } from './backgrounds'
import { allSlots, anySave, clearSlot, readSlot, slotInfo, writeSlot, type SlotId } from './saves'
import {
  flatten, getNode, isImportantChoice, newTimeline, parseTimeline, record, restoreState, serializeTimeline,
  type NodeKind, type Timeline, type TreeNode, type Trigger,
} from './timeline'
import {
  availableSteps, chooseOption, computePersuasion, GAP_LIMIT, present, press, skipUnreachable, startExam,
  isStatementCleared, type ExamResult, type ExamState,
} from './crossexam'

export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'investigate' | 'exam' | 'end'

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
const SHOP_HOURS = [12, 18]
const ALWAYS_LISTED = ['boss', 'mengyao', 'suwen', 'zhengcen', 'shaoxy', 'lucheng', 'limo', 'laohan']
const UNLISTED = ['tang', 'laoliu'] // a voice on a screen and a man in an alley: not people you can win over
const EXAM_WITNESS: Speaker = 'limo'
const TIMELINE_KEY = 'jiudian-timeline'

function readStoredTimeline(): Timeline | null {
  try {
    return parseTimeline(localStorage.getItem(TIMELINE_KEY))
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

  const deduction = computed(() => {
    void tick.value
    const s = session.value
    if (!s) return null
    const items = [
      ...state.evidence.map(id => ({ id, name: data.evidence.find(e => e.id === id)?.name ?? id, kind: 'evidence' as const })),
      ...state.testimony.map(id => ({ id, name: data.testimony.find(t => t.id === id)?.name ?? id, kind: 'testimony' as const })),
    ]
    return { def: s.def, left: MAX_MISSES - s.misses, hint: deductionHint.value, items }
  })

  function submitDeduction(picked: string[]): DeductionOutcome {
    const s = session.value
    if (!s) return { kind: 'incomplete' }
    const out = judgeDeduction(state, s, picked)
    if (out.kind === 'wrong') {
      deductionHint.value = out.hint
    } else if (out.kind !== 'incomplete') {
      session.value = null
      deductionHint.value = ''
      advance()
    }
    return out
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
  const hasSave = ref(anySave())

  // cross-examination
  const exam = ref<ExamState | null>(null)
  const examIndex = ref(0)
  let examStartPersuasion = 0
  let pendingExam: string | null = null
  const examFailed = ref(false)
  // The player has the evidence window open (for the sound track: choosing evidence is the showdown, listening is not).
  const examPresenting = ref(false)
  function setExamPresenting(on: boolean): void { examPresenting.value = on }
  const lastLines = ref<Line[]>([])
  const lastOutcome = ref<string | null>(null)

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
  const slotsLeft = computed(() => slotsLeftIn(state))
  const canShop = computed(() => SHOP_HOURS.includes(state.hour))

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
      const def = data.deductions[node.id]
      if (!def || !canDeduce(state, def)) {
        // you never found the pieces: the evening passes without a conclusion, and without a penalty
        runner.value!.advance()
        settle()
        return
      }
      if (!session.value || session.value.def.id !== def.id) {
        session.value = startDeduction(def)
        deductionHint.value = ''
      }
    } else {
      session.value = null
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

  function newGame(): void {
    Object.assign(state, createInitialState())
    notice.value = ''
    exam.value = null
    examFailed.value = false
    gameOver.value = null
    resetFeed()
    trigger = null
    timelineRef.value = newTimeline()
    recordNode('start', '故事开始', state)
    screen.value = 'scene'
    playScene('prologue', toHub)
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
    screen.value = 'scene'
    playScene(a.scene, () => {
      lastDoneLabel = a.label
      if (!a.until || state.flags[a.until]) markActionDone(state, a.id)
      const when = state.hour
      if (a.away) recordLimoAway(state, when)
      advanceHour(state, a.costHours)
      if (giftItemId && a.npc) gift(a.npc, giftItemId)
      if (!attackAfter(a, when)) toHub()
    })
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
      endDay(state, { rested: true })
      if (state.day >= 6) screen.value = 'end' // nothing comes after the fifth day
      else toHub()
    })
  }

  // ---- save / load / debug jump ----

  function saveGame(slot: number = 1): boolean {
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

  function loadGame(slot: SlotId = 1): void {
    const r = readSlot(slot)
    if (r.ok) {
      const mark = slotInfo(slot)?.timeline
      if (mark) {
        const tl = timelineRef.value.uid === mark.uid ? timelineRef.value : readStoredTimeline()
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
    loadError.value = r.reason === 'empty' ? '没有存档' : '存档无法读取'
    screen.value = 'title'
  }

  function deleteSlot(slot: number): void {
    clearSlot(slot)
    hasSave.value = anySave()
    slotsTick.value += 1
  }

  // "Continue": back to where the last session ended, with its whole rewind tree.
  function continueAuto(): void {
    const stored = readStoredTimeline()
    if (stored && stored.head !== null) {
      timelineRef.value = stored
      rewindTo(stored.head)
      return
    }
    loadGame('auto')
  }

  // ---- the rewind tree ----

  function persistTimeline(): void {
    try {
      localStorage.setItem(TIMELINE_KEY, serializeTimeline(timelineRef.value))
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
    writeSlot('auto', state, { uid: timelineRef.value.uid, node: timelineRef.value.head! })
    hasSave.value = true
    slotsTick.value += 1
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
    resetFeed()
    exam.value = null
    examFailed.value = false
    loadError.value = ''
    notice.value = ''
    pendingExam = null
    onSceneEnd = null
    roomId.value = null
    session.value = null
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
    resetRuntime()
    tl.head = id
    triggerRef(timelineRef)
    persistTimeline()
    if (node.kind === 'start') {
      screen.value = 'scene'
      playScene('prologue', toHub)
    } else if (node.kind === 'choice' && node.resume) {
      replay(node.resume)
    } else {
      skipHubRecord = true
      toHub()
    }
  }

  const timelineRows = computed(() => flatten(timelineRef.value))
  const slotsTick = ref(0)
  const slotList = computed(() => { void slotsTick.value; return allSlots() })
  const autoSlot = computed(() => { void slotsTick.value; return slotInfo('auto') })
  function refreshSlots(): void {
    slotsTick.value += 1
  }

  // The dev jump to the finale is only offered once the story is over (and the UI keeps it hidden for now).
  const canJumpToFinale = computed(() => state.day === 6 && exam.value === null)

  function jumpToFinale(): void {
    Object.assign(state, createInitialState())
    state.day = 5
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

  // What the player holds, with names and descriptions, in the order it was found (for the evidence file).
  const collected = computed(() => {
    const def = (list: { id: string; name: string; desc: string }[], id: string) =>
      list.find(d => d.id === id) ?? { id, name: id, desc: '' }
    return {
      evidence: state.evidence.map(id => def(data.evidence, id)),
      testimony: state.testimony.map(id => def(data.testimony, id)),
    }
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

  function startExamById(id: string): void {
    const def = data.exams[id]
    if (!def) return
    const persuasion = computePersuasion(state)
    if (persuasion <= 0) {
      examFailed.value = true
      gameOver.value = 'bad2'
      screen.value = 'end'
      return
    }
    exam.value = startExam(def, persuasion, state.examGaps ?? 0)
    examPresenting.value = false
    examStartPersuasion = persuasion
    examIndex.value = 0
    examFailed.value = false
    lastLines.value = []
    screen.value = 'exam'
    setBackground('meeting_a')
    resetExamStage()
    applySkips()
    if (exam.value.failed || exam.value.cleared) afterExamStep({ ...NOTHING, failed: exam.value.failed, examCleared: exam.value.cleared })
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
  function settleExamStep(result: ExamResult): ExamResult {
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
    })
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
    resetExamStage()
  }

  function afterExamStep(result: ExamResult): ExamResult {
    if (screen.value !== 'exam') return result
    // Their annoyed comebacks to a wrong, early or repeated presentation are not testimony: keep them out of the log.
    if (result.outcome === 'correct' || result.stepId) logLines(state, result.lines)
    lastLines.value = result.lines
    lastOutcome.value = result.outcome
    for (const l of result.lines) {
      // the witness and you are on stage; anyone else (the detective) just speaks from the side
      if (l.speaker === 'lyc' || l.speaker === EXAM_WITNESS || l.speaker === 'narration') putOnStage(l.speaker, l.expr)
      else stage.side = null
    }
    if (result.failed) {
      examFailed.value = true
      gameOver.value = 'bad2'
      screen.value = 'end'
    } else if (result.examCleared) {
      state.persuasionLoss = (state.persuasionLoss ?? 0) + (examStartPersuasion - (exam.value?.persuasion ?? examStartPersuasion))
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
    return result
  }

  function examPresent(itemId: string): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    queuePopup('present', itemId)
    return settleExamStep(present(exam.value, examStatement.value.id, itemId, presentableIds(state)))
  }

  function examPress(): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    return settleExamStep(press(exam.value, examStatement.value.id))
  }

  function examChoose(stepId: string, optionIndex: number): ExamResult {
    if (!exam.value || !examStatement.value) return NOTHING
    return settleExamStep(chooseOption(exam.value, examStatement.value.id, stepId, optionIndex))
  }

  return {
    data, state, screen, stage, currentNode, currentSceneId, cue, relations, collected, slotsLeft, feed, popup, dismissPopup, deduction, submitDeduction, frameCheck, submitFrames, skipFrames, dismissFeed, gameOver, setRng, lastOutcome, notice, actions, canShop,
    playScene, newGame, restart, advance, note, speakerName, itemName,
    startAction, waitAnHour, room, hotspots, looksLeft, inspect, leaveRoom, goShop, leaveShop, buy, gift, restAtHome,
    loadError, hasSave, saveGame, loadGame, deleteSlot, continueAuto, rewindTo, timelineRows, slotList, autoSlot, refreshSlots, canJumpToFinale, jumpToFinale,
    exam, examIndex, examFailed, examPresenting, setExamPresenting, examStatement, lastLinesView, argument, recordIds, recordNames, quotes,
    startExamById, examGoto, examPresent, examPress, examChoose,
  }
})
