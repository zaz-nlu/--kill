<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from './engine/store'
import { visibleLog } from './engine/log'
import { timeOfDay } from './engine/backgrounds'
import Stage from './ui/Stage.vue'
import TitleScreen from './ui/TitleScreen.vue'
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
import { FINALE_VISIBLE } from './engine/features'
import ExamScreen from './ui/ExamScreen.vue'
import EndScreen from './ui/EndScreen.vue'
import AudioToggle from './ui/AudioToggle.vue'
import SavePanel from './ui/SavePanel.vue'
import TimelinePanel from './ui/TimelinePanel.vue'
import RotateHint from './ui/RotateHint.vue'
import { useAudioDirector } from './audio/director'

const store = useGameStore()
useAudioDirector(store)
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
const panel = ref<'save' | 'load' | 'timeline' | null>(null)
function openPanel(which: 'save' | 'load' | 'timeline') {
  store.refreshSlots()
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
function onRewind(id: number) {
  panel.value = null
  store.rewindTo(id)
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
    :bg="store.screen === 'title' ? 'title' : store.stage.bg"
    :time="store.screen === 'title' ? 'night' : stageTime"
    :left="store.screen === 'title' ? null : store.stage.left"
    :right="store.screen === 'title' ? null : store.stage.right"
    :side="store.stage.side"
    :names="stageNames"
    :memory="store.screen !== 'title' && store.stage.memory"
    :fit="portrait && store.screen === 'investigate'"
  >
    <TitleScreen
      v-if="store.screen === 'title'"
      :error="store.loadError"
      :dev-finale="FINALE_VISIBLE"
      @start="store.newGame()"
      @continue="openPanel('load')"
      @debug-finale="store.jumpToFinale()"
    />
    <div v-else class="game">
      <HudBar :day="store.state.day" :hour="store.state.hour" :money="store.state.money" :danger="store.state.danger" :hp="store.state.hp" />
      <div class="vignette" :class="tier" />
      <div class="body">
        <template v-if="store.screen === 'scene'">
          <DeductionScreen
            v-if="store.deduction"
            :prompt="store.deduction.def.prompt"
            :pick="store.deduction.def.pick"
            :items="store.deduction.items"
            :left="store.deduction.left"
            :hint="store.deduction.hint"
            line=""
            @submit="store.submitDeduction($event)"
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
            :inventory="store.state.inventory"
            :items="store.data.items"
            :slots-left="store.slotsLeft"
            :rest-label="store.state.day === 5 ? '直接等到下午两点' : undefined"
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
            @prev="store.examGoto(store.examIndex - 1)"
            @next="store.examGoto(store.examIndex + 1)"
            @press="store.examPress()"
            @present="store.examPresent($event)"
            @choose="store.examChoose($event.stepId, $event.optionIndex)"
            @record="store.setExamPresenting($event)"
          />
          <EndScreen
            v-else-if="store.screen === 'end'"
            :failed="store.examFailed"
            :reason="store.gameOver"
            :can-finale="FINALE_VISIBLE && store.canJumpToFinale"
            @restart="store.restart()"
            @finale="store.jumpToFinale()"
          />
        </div>
        <p v-if="store.notice" class="notice">{{ store.notice }}</p>
      </div>
      <BacklogPanel v-if="showLog" :lines="logLines" :names="names" @note="onNote" />
      <RelationsPanel v-if="showRelations" :rows="store.relations" />
      <EvidencePanel v-if="showEvidence" :evidence="store.collected.evidence" :testimony="store.collected.testimony" @close="showEvidence = false" />
      <FeedToasts :items="store.feed" :names="stageNames" @dismiss="store.dismissFeed($event)" />
      <EvidencePopup v-if="store.popup" :item="store.popup" @close="store.dismissPopup()" />
      <div v-if="reaction" class="reaction">{{ reaction }}</div>
    </div>
    <SavePanel
      v-if="panel === 'save' || panel === 'load'"
      :mode="panel"
      :slots="store.slotList"
      :auto="store.autoSlot"
      @pick="onPickSlot"
      @remove="store.deleteSlot($event)"
      @close="panel = null"
    />
    <TimelinePanel v-if="panel === 'timeline'" :rows="store.timelineRows" @rewind="onRewind" @close="panel = null" />
    <div class="toolbar" data-testid="toolbar">
      <AudioToggle />
      <template v-if="store.screen !== 'title'">
        <button type="button" class="timeline-toggle" data-testid="timeline-toggle" @click="openPanel('timeline')">回溯</button>
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
.toolbar { position: fixed; top: 6px; right: 12px; z-index: 25; display: flex; align-items: center; gap: 6px; max-width: calc(100vw - 24px); }
.toolbar button { position: relative; padding: 5px 14px; white-space: nowrap; background: rgba(16, 18, 26, 0.5); backdrop-filter: blur(10px); }
.evidence-toggle .dot { position: absolute; right: -4px; top: -4px; width: 10px; height: 10px; background: #e5484d; border-radius: 50%; box-shadow: 0 0 8px #e5484d; }
.vignette { position: absolute; inset: 0; pointer-events: none; transition: box-shadow 0.8s; }
.vignette.tense { box-shadow: inset 0 0 120px 20px #4a000044; }
.vignette.critical { box-shadow: inset 0 0 180px 60px #000d; }
.reaction { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 20px; background: #000a; color: #fff; border-radius: 20px; font-size: 20px; }
</style>
