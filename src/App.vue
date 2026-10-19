<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from './engine/store'
import { visibleLog } from './engine/log'
import TitleScreen from './ui/TitleScreen.vue'
import HudBar from './ui/HudBar.vue'
import DialogueBox from './ui/DialogueBox.vue'
import ChoiceList from './ui/ChoiceList.vue'
import BacklogPanel from './ui/BacklogPanel.vue'

const store = useGameStore()
const showLog = ref(false)
const reaction = ref('')

const sayNode = computed(() => (store.currentNode?.type === 'say' ? store.currentNode : null))
const choiceNode = computed(() => (store.currentNode?.type === 'choice' ? store.currentNode : null))
const logLines = computed(() => visibleLog(store.state))
const names = computed(() => {
  const out: Record<string, string> = {}
  for (const l of store.state.backlog) out[l.speaker] = store.speakerName(l.speaker)
  return out
})

function onNote(lineId: string) {
  const r = store.note(lineId)
  if (r.reaction) {
    reaction.value = r.reaction
    setTimeout(() => { reaction.value = '' }, 2000)
  }
}
</script>

<template>
  <TitleScreen v-if="store.screen === 'title'" @start="store.newGame()" />
  <div v-else class="stage">
    <HudBar :day="store.state.day" :hour="store.state.hour" :money="store.state.money" :danger="store.state.danger" />
    <div class="body">
      <ChoiceList v-if="choiceNode" :options="choiceNode.options.map(o => o.text)" @choose="store.advance($event)" />
      <DialogueBox v-else-if="sayNode" :speaker="store.speakerName(sayNode.speaker)" :text="sayNode.text" @advance="store.advance()" />
      <p v-else class="done">（这一段结束了）</p>
    </div>
    <button type="button" class="log-toggle" @click="showLog = !showLog">日志</button>
    <BacklogPanel v-if="showLog" :lines="logLines" :names="names" @note="onNote" />
    <div v-if="reaction" class="reaction">{{ reaction }}</div>
  </div>
</template>

<style>
html, body { margin: 0; background: #0c0c0f; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
.stage { min-height: 100vh; color: #eee; }
.body { padding-top: 40vh; }
.done { text-align: center; color: #888; }
.log-toggle { position: fixed; right: 14px; top: 8px; }
.reaction { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 20px; background: #000a; color: #fff; border-radius: 20px; font-size: 20px; }
</style>
