<script setup lang="ts">
import { ref } from 'vue'
import type { Statement } from '../engine/types'
import CourtRecord from './CourtRecord.vue'

defineProps<{
  statement: Statement
  index: number
  total: number
  persuasion: number
  lastLines: { name: string; text: string }[]
  recordIds: string[]
  names: Record<string, string>
  quotes: { id: string; text: string }[]
  argument: { stepId: string; prompt: string; options: string[] } | null
}>()
const emit = defineEmits<{
  prev: []
  next: []
  press: []
  present: [id: string]
  choose: [payload: { stepId: string; optionIndex: number }]
}>()

const showRecord = ref(false)

function present(id: string) {
  showRecord.value = false
  emit('present', id)
}
</script>

<template>
  <section class="exam">
    <div class="meter" data-testid="meter">
      <span>说服力</span>
      <span v-for="n in persuasion" :key="n" class="pip" data-testid="pip" />
    </div>
    <div class="scroll" data-testid="scroll">
    <div class="statement">
      <small>{{ index + 1 }} / {{ total }}</small>
      <p>{{ statement.text }}</p>
    </div>
    <ul v-if="lastLines.length" class="replies">
      <li v-for="(l, i) in lastLines" :key="i"><b v-if="l.name">{{ l.name }}：</b>{{ l.text }}</li>
    </ul>
    <div v-if="argument" class="argument">
      <p>{{ argument.prompt }}</p>
      <button
        v-for="(o, i) in argument.options"
        :key="i"
        type="button"
        :data-testid="'option-' + i"
        @click="emit('choose', { stepId: argument.stepId, optionIndex: i })"
      >{{ o }}</button>
    </div>
    </div>
    <div class="bar">
      <button type="button" data-testid="prev" :disabled="index <= 0" @click="emit('prev')">上一句</button>
      <button type="button" data-testid="press" @click="emit('press')">追问</button>
      <button type="button" data-testid="open-record" @click="showRecord = !showRecord">出示</button>
      <button type="button" data-testid="next" :disabled="index >= total - 1" @click="emit('next')">下一句</button>
    </div>
    <CourtRecord v-if="showRecord" :ids="recordIds" :names="names" :quotes="quotes" @pick="present" />
  </section>
</template>

<style scoped>
.exam { display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 14px 18px; background: #141418; color: #eee; border: 2px solid #888; border-radius: 6px; }
.meter { display: flex; gap: 6px; align-items: center; flex: none; }
.scroll { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding-right: 6px; }
.pip { width: 14px; height: 14px; background: #c8501e; border-radius: 3px; }
.statement { margin: 14px 0; padding: 12px; background: #1e2a3a; border-left: 4px solid #4aa3ff; }
.statement p { margin: 4px 0 0; font-size: 19px; line-height: 1.7; }
.replies { list-style: none; padding: 0; margin: 8px 0; color: #ddd; line-height: 1.7; }
.replies b { color: #e8a070; }
.argument { margin: 10px 0; }
.argument button { display: block; margin: 6px 0; }
.bar { display: flex; gap: 10px; flex: none; margin-top: 10px; }
button { padding: 8px 16px; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
