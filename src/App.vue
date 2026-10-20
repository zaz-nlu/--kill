<script setup lang="ts">
import { computed, ref } from 'vue'
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
import FeedToasts from './ui/FeedToasts.vue'
import { dangerTier } from './engine/danger'
import ExamScreen from './ui/ExamScreen.vue'
import EndScreen from './ui/EndScreen.vue'

const store = useGameStore()
const showLog = ref(false)
const showRelations = ref(false)
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
  >
    <TitleScreen
      v-if="store.screen === 'title'"
      :error="store.loadError"
      @start="store.newGame()"
      @continue="store.loadGame()"
      @debug-finale="store.jumpToFinale()"
    />
    <div v-else class="game">
      <HudBar :day="store.state.day" :hour="store.state.hour" :money="store.state.money" :danger="store.state.danger" :hp="store.state.hp" />
      <div class="vignette" :class="tier" />
      <div class="body">
        <template v-if="store.screen === 'scene'">
          <ChoiceList v-if="choiceNode" :options="choiceNode.options.map(o => o.text)" @choose="store.advance($event)" />
          <DialogueBox v-else-if="sayNode" :speaker="store.speakerName(sayNode.speaker)" :text="sayNode.text" @advance="store.advance()" />
          <p v-else class="done">（这一段结束了）</p>
        </template>
        <InvestigateScreen
          v-else-if="store.screen === 'investigate' && store.room"
          :label="store.room.label"
          :hotspots="store.hotspots"
          @inspect="store.inspect($event)"
          @leave="store.leaveRoom()"
        />
        <div v-else class="panel">
          <HubScreen
            v-if="store.screen === 'hub'"
            :actions="store.actions"
            :can-shop="store.canShop"
            :inventory="store.state.inventory"
            :items="store.data.items"
            @action="(id: string, gift?: string) => store.startAction(id, gift)"
            @shop="store.goShop()"
            @wait="store.waitAnHour()"
            @rest="store.restAtHome()"
            @save="store.saveGame()"
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
            :record-ids="store.recordIds"
            :names="store.recordNames"
            :quotes="store.quotes"
            :argument="store.argument"
            @prev="store.examGoto(store.examIndex - 1)"
            @next="store.examGoto(store.examIndex + 1)"
            @press="store.examPress()"
            @present="store.examPresent($event)"
            @choose="store.examChoose($event.stepId, $event.optionIndex)"
          />
          <EndScreen
            v-else-if="store.screen === 'end'"
            :failed="store.examFailed"
            :reason="store.gameOver"
            :can-finale="store.canJumpToFinale"
            @restart="store.restart()"
            @finale="store.jumpToFinale()"
          />
        </div>
        <p v-if="store.notice" class="notice">{{ store.notice }}</p>
      </div>
      <button type="button" class="log-toggle" @click="showLog = !showLog; showRelations = false">日志</button>
      <button type="button" class="relations-toggle" data-testid="relations-toggle" @click="showRelations = !showRelations; showLog = false">关系</button>
      <BacklogPanel v-if="showLog" :lines="logLines" :names="names" @note="onNote" />
      <RelationsPanel v-if="showRelations" :rows="store.relations" />
      <FeedToasts :items="store.feed" :names="stageNames" @dismiss="store.dismissFeed($event)" />
      <div v-if="reaction" class="reaction">{{ reaction }}</div>
    </div>
  </Stage>
</template>

<style>
* { scrollbar-width: thin; scrollbar-color: #5a5a66 transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: #5a5a66; border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: #c8501e; }
html, body { height: 100%; margin: 0; overflow: hidden; background: #0c0c0f; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
.game { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; color: #eee; pointer-events: none; }
.game > * { pointer-events: auto; }
.body { margin-top: auto; }
.panel { display: flex; flex-direction: column; max-height: 62vh; overflow: hidden; background: #000b; margin: 0 12px; border-radius: 6px; }
.panel > * { min-height: 0; }
.done { text-align: center; color: #888; }
.notice { text-align: center; color: #e8a070; }
.log-toggle { position: fixed; right: 14px; top: 8px; z-index: 25; }
.relations-toggle { position: fixed; right: 62px; top: 8px; z-index: 25; }
.vignette { position: absolute; inset: 0; pointer-events: none; transition: box-shadow 0.8s; }
.vignette.tense { box-shadow: inset 0 0 120px 20px #4a000044; }
.vignette.critical { box-shadow: inset 0 0 180px 60px #000d; }
.reaction { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 20px; background: #000a; color: #fff; border-radius: 20px; font-size: 20px; }
</style>
