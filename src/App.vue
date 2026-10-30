<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from './engine/store'
import { visibleLog } from './engine/log'
import { timeOfDay } from './engine/backgrounds'
import Stage from './ui/Stage.vue'
import TitleScreen from './ui/TitleScreen.vue'
import ChapterSelect from './ui/ChapterSelect.vue'
import ChapterCard from './ui/ChapterCard.vue'
import RecapScreen from './ui/RecapScreen.vue'
import HudBar from './ui/HudBar.vue'
import DialogueBox from './ui/DialogueBox.vue'
import ChoiceList from './ui/ChoiceList.vue'
import BacklogPanel from './ui/BacklogPanel.vue'
import HubScreen from './ui/HubScreen.vue'
import ShopPanel from './ui/ShopPanel.vue'
import InvestigateScreen from './ui/InvestigateScreen.vue'
import RelationsPanel from './ui/RelationsPanel.vue'
import EvidencePanel from './ui/EvidencePanel.vue'
import FeedToasts from './ui/FeedToasts.vue'
import EvidencePopup from './ui/EvidencePopup.vue'
import DeductionScreen from './ui/DeductionScreen.vue'
import FrameCheckScreen from './ui/FrameCheckScreen.vue'
import { dangerTier } from './engine/danger'
import { DEMO_VISIBLE, FINALE_VISIBLE } from './engine/features'
import ExamScreen from './ui/ExamScreen.vue'
import EndScreen from './ui/EndScreen.vue'
import AudioToggle from './ui/AudioToggle.vue'
import SavePanel from './ui/SavePanel.vue'
import TimelinePanel from './ui/TimelinePanel.vue'
import HelpPanel from './ui/HelpPanel.vue'
import TipDialog from './ui/TipDialog.vue'
import RotateHint from './ui/RotateHint.vue'
import { useAudioDirector } from './audio/director'
import { allSlots, type SlotMeta } from './engine/saves'
import { loadProfile } from './engine/profile'

const store = useGameStore()
useAudioDirector(store)
// The cross-examination plays an animation for each blow, and the end of an act waits for it.
store.stageExam(true)
// The whole screen shakes when a blow lands ('hit': the witness is smashed; 'hurt': you are).
const quake = ref<'hit' | 'hurt' | null>(null)
let quakeTimer: ReturnType<typeof setTimeout> | null = null
function shake(kind: 'hit' | 'hurt') {
  if (quakeTimer) clearTimeout(quakeTimer)
  quake.value = null
  // restart the animation even when the last one has not finished
  requestAnimationFrame(() => {
    quake.value = kind
    quakeTimer = setTimeout(() => { quake.value = null }, kind === 'hit' ? 700 : 450)
  })
}
onBeforeUnmount(() => { if (quakeTimer) clearTimeout(quakeTimer) })
const showLog = ref(false)
// A phone held upright: the 16:9 pictures would be cropped. Say so once, and show the whole picture in the search rooms.
const portrait = ref(false)
const hintDismissed = ref(false)
let portraitQuery: MediaQueryList | null = null
const syncPortrait = () => { portrait.value = portraitQuery?.matches ?? false }
onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  portraitQuery = window.matchMedia('(orientation: portrait) and (max-width: 820px)')
  syncPortrait()
  portraitQuery.addEventListener?.('change', syncPortrait)
})
onBeforeUnmount(() => portraitQuery?.removeEventListener?.('change', syncPortrait))
// saving, loading and the rewind tree
const panel = ref<'save' | 'load' | 'timeline' | 'help' | null>(null)
// The other chapters' saves, shown folded away in the save panel.
const otherSaves = ref<{ chapter: string; title: string; slots: { slot: number | 'auto'; meta: SlotMeta | null }[] }[]>([])
function buildOtherSaves(): void {
  otherSaves.value = Object.values(store.data.chapters)
    .filter(c => c.id !== store.state.chapter)
    .sort((a, b) => a.order - b.order)
    .map(c => ({
      chapter: c.id,
      title: c.title,
      slots: [
        { slot: 'auto' as const, meta: store.slotInfo('auto', c.id) },
        ...allSlots(c.id).map(s => ({ slot: s.slot as number, meta: s.meta })),
      ],
    }))
    .filter(g => g.slots.some(s => s.meta !== null))
}
function openPanel(which: 'save' | 'load' | 'timeline' | 'help') {
  store.refreshSlots()
  buildOtherSaves()
  panel.value = which
}
function onPickSlot(slot: number | 'auto') {
  const mode = panel.value
  panel.value = null
  if (mode === 'save') {
    if (slot !== 'auto') store.saveGame(slot)
  } else if (slot === 'auto') {
    store.continueAuto()
  } else {
    store.loadGame(slot)
  }
}
function onPickOther(chapter: string, slot: number | 'auto') {
  panel.value = null
  store.loadOther(slot, chapter)
}
function onRewind(id: number) {
  panel.value = null
  store.rewindTo(id)
}

// ---- chapters: select -> title card -> previously on (first time) -> the chapter's own prologue ----
const cardChapter = ref('c1')
const recapChapter = ref('c1')
let recapAfter: (() => void) | null = null
const cardDef = computed(() => store.data.chapters[cardChapter.value] ?? store.data.chapters.c1)
const cardDate = computed(() => cardDef.value.calendar[0]?.date ?? '')
const recapCards = computed(() => store.data.chapters[recapChapter.value]?.recap ?? [])
const nextChapterTitle = computed(() => {
  const next = Object.values(store.data.chapters).find(c => c.order === store.chapter.order + 1)
  return next?.title ?? null
})
// The title screen, the chapter list and the cards all cover the stage instead of sitting inside the game.
const menuScreen = computed(() =>
  store.screen === 'title' || store.screen === 'chapters' || store.screen === 'card' || store.screen === 'recap',
)

function openChapters() {
  store.screen = 'chapters'
}
function enterChapter(id: string) {
  const ch = store.data.chapters[id]
  if (!ch || !store.data.scenes[ch.prologue]) return
  cardChapter.value = id
  store.screen = 'card'
}
function startAfterCard() {
  const id = cardChapter.value
  const ch = store.data.chapters[id]
  if (!ch) return
  if (ch.recap.length > 0 && !loadProfile().seenRecap[id]) {
    openRecap(id, () => store.startChapter(id))
    return
  }
  store.startChapter(id)
}
function openRecap(id: string, after: () => void) {
  recapChapter.value = id
  recapAfter = after
  store.screen = 'recap'
}
function onRecapDone() {
  const after = recapAfter
  recapAfter = null
  if (after) after()
  else store.screen = 'chapters'
}
// Watching it again from inside a chapter: when it is over, the screen it covered comes back.
function rewatchRecap() {
  const back = store.screen
  openRecap(store.state.chapter, () => { store.screen = back })
}
function openChapterRecap(id: string) {
  openRecap(id, () => { store.screen = 'chapters' })
}
function continueFromList(id: string) {
  store.continueChapter(id)
}
function restartFromList(id: string) {
  store.resetChapter(id)
  enterChapter(id)
}
// "Continue" on the title screen: the latest automatic save across every chapter.
function continueGame() {
  if (!store.continueLatest()) openPanel('load')
}
const showRelations = ref(false)
const showEvidence = ref(false)
// A red dot on the evidence button while something has been found that you have not looked at yet.
const seenCount = ref(0)
const heldCount = computed(() => store.state.evidence.length + store.state.testimony.length)
const hasNew = computed(() => !showEvidence.value && heldCount.value > seenCount.value)
watch(heldCount, n => { if (n < seenCount.value) seenCount.value = n }) // a new game starts from nothing
function openEvidence() {
  showEvidence.value = !showEvidence.value
  showLog.value = false
  showRelations.value = false
  if (showEvidence.value) seenCount.value = heldCount.value
}
const tier = computed(() => dangerTier(store.state.danger))
const reaction = ref('')

const sayNode = computed(() => (store.currentNode?.type === 'say' ? store.currentNode : null))
const choiceNode = computed(() => (store.currentNode?.type === 'choice' ? store.currentNode : null))
const logLines = computed(() => visibleLog(store.state))
const names = computed(() => {
  const out: Record<string, string> = {}
  for (const l of store.state.backlog) out[l.speaker] = store.speakerName(l.speaker)
  return out
})
const stageNames = computed(() => {
  const out: Record<string, string> = {}
  for (const id of ['lyc', store.stage.left?.id, store.stage.right?.id]) if (id) out[id] = store.speakerName(id as never)
  return out
})
const stageTime = computed(() => store.stage.time ?? timeOfDay(store.state.hour))

function onNote(lineId: string) {
  const r = store.note(lineId)
  if (r.reaction) {
    reaction.value = r.reaction
    setTimeout(() => { reaction.value = '' }, 2000)
  }
}
</script>

<template>
  <Stage
    :class="quake ? 'quake-' + quake : ''"
    :bg="menuScreen ? 'title' : store.stage.bg"
    :time="menuScreen ? 'night' : stageTime"
    :left="menuScreen ? null : store.stage.left"
    :right="menuScreen ? null : store.stage.right"
    :side="store.stage.side"
    :names="stageNames"
    :memory="!menuScreen && store.stage.memory"
    :fit="portrait && store.screen === 'investigate'"
  >
    <TitleScreen
      v-if="store.screen === 'title'"
      :error="store.loadError"
      :dev-finale="FINALE_VISIBLE"
      :demo="DEMO_VISIBLE"
      :message="store.demoMessage"
      @start="store.newGame()"
      @continue="continueGame()"
      @chapters="openChapters()"
      @debug-finale="store.jumpToFinale()"
      @demo-exam="store.startDemoExam()"
    />
    <ChapterSelect
      v-else-if="store.screen === 'chapters'"
      @start="enterChapter"
      @continue="continueFromList"
      @reset="restartFromList"
      @recap="openChapterRecap"
      @back="store.screen = 'title'"
    />
    <ChapterCard
      v-else-if="store.screen === 'card'"
      :title="cardDef.title"
      :sub="cardDef.sub"
      :date="cardDate"
      @continue="startAfterCard"
    />
    <RecapScreen
      v-else-if="store.screen === 'recap'"
      :chapter="recapChapter"
      :cards="recapCards"
      @done="onRecapDone"
    />
    <div v-else class="game">
      <HudBar :day="store.state.day" :hour="store.state.hour" :money="store.state.money" :danger="store.state.danger" :hp="store.state.hp" />
      <div class="vignette" :class="tier" />
      <div class="body">
        <template v-if="store.screen === 'scene'">
          <DeductionScreen
            v-if="store.deduction || store.deductionResult"
            :prompt="store.deduction?.def.prompt ?? ''"
            :pick="store.deduction?.def.pick ?? 0"
            :items="store.deduction?.items ?? []"
            :left="store.deduction?.left ?? 0"
            :hint="store.deduction?.hint ?? ''"
            :intro="store.deduction?.intro ?? []"
            :lead="store.deduction?.lead ?? ''"
            :result="store.deductionResult"
            line=""
            @submit="store.submitDeduction($event)"
            @continue="store.continueDeduction()"
          />
          <FrameCheckScreen
            v-else-if="store.frameCheck"
            :prompt="store.frameCheck.def.prompt"
            :rows="store.frameCheck.def.rows"
            :feedback="store.frameCheck.feedback"
            @submit="store.submitFrames($event)"
            @skip="store.skipFrames()"
          />
          <ChoiceList v-else-if="choiceNode" :options="choiceNode.options.map(o => o.text)" @choose="store.advance($event)" />
          <DialogueBox v-else-if="sayNode" :speaker="store.speakerName(sayNode.speaker)" :text="sayNode.text" @advance="store.advance()" />
          <p v-else class="done">（这一段结束了）</p>
        </template>
        <InvestigateScreen
          v-else-if="store.screen === 'investigate' && store.room"
          :label="store.room.label"
          :hotspots="store.hotspots"
          :left="store.looksLeft"
          :fit="portrait"
          @inspect="store.inspect($event)"
          @leave="store.leaveRoom()"
        />
        <div v-else class="panel" :class="{ tall: store.screen === 'exam' }">
          <HubScreen
            v-if="store.screen === 'hub'"
            :actions="store.actions"
            :can-shop="store.canShop"
            :meal-hour="store.mealHour"
            :inventory="store.state.inventory"
            :items="store.data.items"
            :slots-left="store.slotsLeft"
            :urge="store.urged"
            :rest-label="store.state.day === store.chapter.lastDay ? '直接等到下午两点' : undefined"
            @action="(id: string, gift?: string) => store.startAction(id, gift)"
            @shop="store.goShop()"
            @wait="store.waitAnHour()"
            @rest="store.restAtHome()"
            @save="openPanel('save')"
          />
          <ShopPanel
            v-else-if="store.screen === 'shop'"
            :items="store.data.items"
            :money="store.state.money"
            :items-left="store.state.shopItemsLeft"
            @buy="store.buy($event)"
            @leave="store.leaveShop()"
          />
          <ExamScreen
            v-else-if="store.screen === 'exam' && store.examStatement && store.exam"
            :statement="store.examStatement"
            :index="store.examIndex"
            :total="store.exam.def.statements.length"
            :persuasion="store.exam.persuasion"
            :last-lines="store.lastLinesView"
            :outcome="store.lastOutcome"
            :record-ids="store.recordIds"
            :names="store.recordNames"
            :quotes="store.quotes"
            :argument="store.argument"
            :view="store.examView"
            :info="store.recordInfo"
            :folded="store.collected.folded"
            :event="store.examEvent"
            :hold="store.examHold"
            :witness="store.speakerName('limo')"
            @prev="store.examGoto(store.examIndex - 1)"
            @next="store.examGoto(store.examIndex + 1)"
            @goto="store.examGoto($event)"
            @press="store.examPress()"
            @present="(id: string, target?: string) => store.examPresent(id, target)"
            @choose="store.examChoose($event.stepId, $event.optionIndex)"
            @record="store.setExamPresenting($event)"
            @continue="store.examContinue()"
            @impact="shake"
          />
          <EndScreen
            v-else-if="store.screen === 'end'"
            :failed="store.examFailed"
            :reason="store.gameOver"
            :can-finale="FINALE_VISIBLE && store.canJumpToFinale"
            :endings="store.endings"
            :chapter-id="store.state.chapter"
            :next-title="nextChapterTitle"
            @restart="store.restart()"
            @finale="store.jumpToFinale()"
            @chapters="openChapters()"
          />
        </div>
        <p v-if="store.notice" class="notice">{{ store.notice }}</p>
        <p v-if="store.saveNote" class="save-note" data-testid="save-note">{{ store.saveNote }}</p>
      </div>
      <BacklogPanel v-if="showLog" :lines="logLines" :names="names" @note="onNote" />
      <RelationsPanel v-if="showRelations" :rows="store.relations" />
      <EvidencePanel v-if="showEvidence" :evidence="store.collected.evidence" :testimony="store.collected.testimony" :conclusions="store.collected.conclusions" :folded="store.collected.folded" :info="store.recordInfo" @close="showEvidence = false" />
      <FeedToasts :items="store.feed" :names="stageNames" @dismiss="store.dismissFeed($event)" />
      <EvidencePopup v-if="store.popup" :item="store.popup" @close="store.dismissPopup()" />
      <div v-if="reaction" class="reaction">{{ reaction }}</div>
    </div>
    <SavePanel
      v-if="panel === 'save' || panel === 'load'"
      :mode="panel"
      :slots="store.slotList"
      :auto="store.autoSlot"
      :chapter-name="store.chapter.title"
      :chapter-id="store.state.chapter"
      :others="otherSaves"
      @pick="onPickSlot"
      @pick-other="onPickOther"
      @remove="store.deleteSlot($event)"
      @close="panel = null"
    />
    <TimelinePanel
      v-if="panel === 'timeline'"
      :rows="store.timelineRows"
      :chapter-title="store.chapter.title"
      :calendar="store.chapter.calendar"
      @rewind="onRewind"
      @close="panel = null"
    />
    <HelpPanel v-if="panel === 'help'" @close="panel = null" />
    <TipDialog v-if="store.tip" :title="store.tip.title" :text="store.tip.text" @close="store.dismissTip()" />
    <TipDialog
      v-if="store.migrationNotice"
      title="旧存档已迁移"
      :text="store.migrationNotice"
      @close="store.dismissLegacyNotice()"
    />
    <div class="toolbar" data-testid="toolbar">
      <AudioToggle />
      <template v-if="!menuScreen">
        <button type="button" class="timeline-toggle" data-testid="timeline-toggle" @click="openPanel('timeline')">回溯</button>
        <button v-if="store.chapter.recap.length > 0" type="button" class="recap-toggle" data-testid="recap-toggle" @click="rewatchRecap">前情提要</button>
        <button type="button" class="help-toggle" data-testid="help-toggle" @click="openPanel('help')">说明</button>
        <button type="button" class="evidence-toggle" data-testid="evidence-toggle" @click="openEvidence()">证物<i v-if="hasNew" class="dot" data-testid="evidence-new" /></button>
        <button type="button" class="relations-toggle" data-testid="relations-toggle" @click="showRelations = !showRelations; showLog = false; showEvidence = false">关系</button>
        <button type="button" class="log-toggle" @click="showLog = !showLog; showRelations = false; showEvidence = false">日志</button>
      </template>
    </div>
    <RotateHint v-if="portrait && !hintDismissed" @dismiss="hintDismissed = true" />
  </Stage>
</template>

<style>
:root {
  --glass: rgba(14, 16, 24, 0.68);
  --glass-line: rgba(255, 255, 255, 0.18);
  --accent: #e8a070;
  --accent-2: #c8501e;
}
.glass { background: var(--glass); backdrop-filter: blur(14px) saturate(1.25); -webkit-backdrop-filter: blur(14px) saturate(1.25); border: 1px solid var(--glass-line); border-radius: 14px; color: #f1ece4; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12); }
button { font: inherit; color: #f1ece4; padding: 7px 14px; cursor: pointer; background: rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 8px; transition: background 0.15s, border-color 0.15s, transform 0.08s; }
button:hover:not(:disabled) { background: rgba(232, 160, 112, 0.24); border-color: var(--accent); }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.4; cursor: not-allowed; }
* { scrollbar-width: thin; scrollbar-color: #5a5a66 transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: #5a5a66; border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: #c8501e; }
html, body { height: 100%; margin: 0; overflow: hidden; background: #0c0c0f; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
.game { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; color: #eee; pointer-events: none; }
.game > * { pointer-events: auto; }
.body { margin-top: auto; }
.panel { display: flex; flex-direction: column; max-height: 62vh; overflow: hidden; }
.panel > * { min-height: 0; }
.panel.tall { max-height: 80vh; }
.done { text-align: center; color: #888; }
.notice { text-align: center; color: #e8a070; }
.save-note { position: fixed; right: 14px; bottom: 14px; z-index: 20; margin: 0; padding: 6px 14px; font-size: 13px; color: #f1ece4; background: rgba(16, 18, 26, 0.62); border: 1px solid var(--glass-line); border-left: 3px solid #6aa86a; border-radius: 6px; pointer-events: none; }
/* The whole picture shakes when a blow lands in the cross-examination. */
.quake-hit { animation: quake-hit 0.65s linear; }
.quake-hurt { animation: quake-hurt 0.42s linear; }
@keyframes quake-hit {
  0% { transform: translate(0, 0) scale(1.012); filter: brightness(1.6); }
  8% { transform: translate(-16px, 9px); }
  16% { transform: translate(15px, -10px); filter: none; }
  28% { transform: translate(-11px, 7px); }
  40% { transform: translate(9px, -6px); }
  54% { transform: translate(-6px, 4px); }
  70% { transform: translate(4px, -2px); }
  100% { transform: translate(0, 0); }
}
@keyframes quake-hurt {
  0% { transform: translate(0, 0); }
  15% { transform: translate(-7px, 3px); }
  35% { transform: translate(6px, -3px); }
  60% { transform: translate(-3px, 2px); }
  100% { transform: translate(0, 0); }
}
@media (prefers-reduced-motion: reduce) { .quake-hit, .quake-hurt { animation: none; } }
.toolbar { position: fixed; top: 6px; right: 12px; z-index: 25; display: flex; align-items: center; gap: 6px; max-width: calc(100vw - 24px); }
.toolbar button { position: relative; padding: 5px 14px; white-space: nowrap; background: rgba(16, 18, 26, 0.5); backdrop-filter: blur(10px); }
.evidence-toggle .dot { position: absolute; right: -4px; top: -4px; width: 10px; height: 10px; background: #e5484d; border-radius: 50%; box-shadow: 0 0 8px #e5484d; }
.vignette { position: absolute; inset: 0; pointer-events: none; transition: box-shadow 0.8s; }
.vignette.tense { box-shadow: inset 0 0 120px 20px #4a000044; }
.vignette.critical { box-shadow: inset 0 0 180px 60px #000d; }
.reaction { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 20px; background: #000a; color: #fff; border-radius: 20px; font-size: 20px; }
</style>
