<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VisibleLogLine } from '../engine/log'

const props = defineProps<{ lines: VisibleLogLine[]; names?: Record<string, string> }>()
defineEmits<{ note: [lineId: string] }>()

const tab = ref<'log' | 'notes'>('log')
const shown = computed(() => (tab.value === 'notes' ? props.lines.filter(l => l.noted) : props.lines))
const label = (speaker: string) => props.names?.[speaker] ?? (speaker === 'narration' ? '' : speaker)
</script>

<template>
  <aside class="backlog glass">
    <nav>
      <button type="button" data-testid="tab-log" :class="{ on: tab === 'log' }" @click="tab = 'log'">日志</button>
      <button type="button" data-testid="tab-notes" :class="{ on: tab === 'notes' }" @click="tab = 'notes'">笔记</button>
    </nav>
    <ul class="scroll" data-testid="scroll">
      <li v-for="l in shown" :key="l.id">
        <span v-if="label(l.speaker)" class="who">{{ label(l.speaker) }}：</span>{{ l.text }}
        <button type="button" class="note" :data-testid="'note-' + l.id" @click="$emit('note', l.id)">
          {{ l.noted ? '已记下' : '记下' }}
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.backlog { position: fixed; top: 48px; right: 12px; z-index: 20; display: flex; flex-direction: column; width: min(560px, 92vw); max-height: 70vh; padding: 12px 16px; color: #e6e0d6; }
nav { display: flex; gap: 8px; margin-bottom: 8px; flex: none; }
nav button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 6px; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); line-height: 1.6; }
.who { color: var(--accent); }
.note { margin-left: 10px; font-size: 12px; padding: 1px 10px; }
</style>
