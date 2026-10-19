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
  <aside class="backlog">
    <nav>
      <button type="button" data-testid="tab-log" :class="{ on: tab === 'log' }" @click="tab = 'log'">日志</button>
      <button type="button" data-testid="tab-notes" :class="{ on: tab === 'notes' }" @click="tab = 'notes'">笔记</button>
    </nav>
    <ul>
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
.backlog { margin: 12px; padding: 10px 14px; max-height: 45vh; overflow-y: auto; background: #181818; color: #ddd; border: 1px solid #555; border-radius: 6px; }
nav { display: flex; gap: 8px; margin-bottom: 8px; }
nav button.on { background: #c8501e; color: #fff; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: 6px 0; border-bottom: 1px solid #2a2a2a; line-height: 1.6; }
.who { color: #e8a070; }
.note { margin-left: 10px; font-size: 12px; }
</style>
