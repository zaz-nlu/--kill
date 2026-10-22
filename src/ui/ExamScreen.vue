<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Statement } from '../engine/types'
import CourtRecord from './CourtRecord.vue'

defineProps<{
  statement: Statement
  index: number
  total: number
  persuasion: number
  lastLines: { name: string; text: string }[]
  outcome?: string | null
  recordIds: string[]
  names: Record<string, string>
  quotes: { id: string; text: string; who?: string }[]
  argument: { stepId: string; prompt: string; options: string[] } | null
}>()
const emit = defineEmits<{
  prev: []
  next: []
  press: []
  present: [id: string]
  choose: [payload: { stepId: string; optionIndex: number }]
  record: [open: boolean]
}>()

const showRecord = ref(false)
watch(showRecord, open => emit('record', open))

function present(id: string) {
  showRecord.value = false
  emit('present', id)
}

const TONE: Record<string, string> = { correct: 'ok', wrong: 'bad', premature: 'meh', ignored: 'meh' }
</script>

<template>
  <section class="exam glass">
    <div class="meter" data-testid="meter">
      <span>说服力</span>
      <span v-for="n in persuasion" :key="n" class="pip" data-testid="pip" />
    </div>
    <div class="scroll" data-testid="scroll">
      <div class="statement">
        <small>{{ index + 1 }} / {{ total }}</small>
        <p>{{ statement.text }}</p>
      </div>
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

    <!-- What they said back. Kept outside the scrolling statement so it can never be pushed out of sight. -->
    <div v-if="lastLines.length" class="reply" :class="(outcome && TONE[outcome]) || 'meh'" data-testid="reaction">
      <p v-for="(l, i) in lastLines" :key="i"><b v-if="l.name">{{ l.name }}：</b>{{ l.text }}</p>
    </div>

    <div class="bar">
      <button type="button" data-testid="prev" :disabled="index <= 0" @click="emit('prev')">上一句</button>
      <button type="button" data-testid="press" @click="emit('press')">追问</button>
      <button type="button" class="present" data-testid="open-record" @click="showRecord = true">出示</button>
      <button type="button" data-testid="next" :disabled="index >= total - 1" @click="emit('next')">下一句</button>
    </div>

    <div v-if="showRecord" class="veil" data-testid="present-window" @click.self="showRecord = false">
      <div class="sheet glass">
        <header>
          <h3>选一样东西出示</h3>
          <button type="button" class="close" data-testid="close-present" @click="showRecord = false">×</button>
        </header>
        <CourtRecord class="in-sheet" :ids="recordIds" :names="names" :quotes="quotes" @pick="present" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.exam { display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 14px 16px; }
.meter { display: flex; gap: 6px; align-items: center; flex: none; }
.pip { width: 14px; height: 14px; background: #ee8044; border-radius: 4px; box-shadow: 0 0 8px #ee804488; }
.scroll { flex: 1 1 auto; min-height: 70px; overflow-y: auto; padding-right: 6px; }
.statement { margin: 12px 0; padding: 12px 16px; background: rgba(60, 110, 190, 0.22); border-left: 4px solid #4aa3ff; border-radius: 8px; }
.statement p { margin: 4px 0 0; font-size: 19px; line-height: 1.7; }
.argument { margin: 10px 0; }
.argument button { display: block; width: 100%; margin: 6px 0; text-align: left; padding: 10px 14px; }

.reply { flex: none; max-height: 24vh; overflow-y: auto; margin-top: 10px; padding: 10px 14px; border-radius: 10px; border-left: 4px solid; animation: shake 0.35s ease-out; }
.reply p { margin: 2px 0; font-size: 17px; line-height: 1.7; }
.reply b { color: var(--accent); }
.reply.ok { background: rgba(80, 160, 90, 0.2); border-color: #6aa86a; animation: none; }
.reply.bad { background: rgba(190, 70, 60, 0.26); border-color: #e5484d; }
.reply.meh { background: rgba(255, 255, 255, 0.08); border-color: #bdb3a6; animation: none; }
@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }

.bar { display: flex; gap: 10px; flex: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.present { border-color: rgba(232, 160, 112, 0.7); }
button { padding: 8px 18px; }

.veil { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5); }
.sheet { display: flex; flex-direction: column; width: min(820px, 94vw); max-height: 80vh; padding: 14px 18px; }
.sheet header { display: flex; justify-content: space-between; align-items: center; flex: none; margin-bottom: 8px; }
.sheet h3 { margin: 0; font-size: 18px; letter-spacing: 2px; }
.close { width: 34px; height: 30px; padding: 0; font-size: 20px; line-height: 1; }
.in-sheet { flex: 1 1 auto; min-height: 0; max-height: none !important; margin: 0 !important; }
</style>
