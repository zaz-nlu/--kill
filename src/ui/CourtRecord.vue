<script setup lang="ts">
import { resolveEvidenceImage } from '../engine/evidenceArt'

defineProps<{ ids: string[]; names: Record<string, string>; quotes: { id: string; text: string; who?: string }[] }>()
defineEmits<{ pick: [id: string] }>()
</script>

<template>
  <div class="record">
    <section>
      <h3>证物与证言</h3>
      <p v-if="ids.length === 0">还没有可以出示的东西</p>
      <button v-for="id in ids" :key="id" type="button" :data-testid="'record-' + id" @click="$emit('pick', id)">
        <img v-if="resolveEvidenceImage(id)" class="thumb" :src="resolveEvidenceImage(id)!" alt="">
        <span>{{ names[id] ?? id }}</span>
      </button>
    </section>
    <section>
      <h3>日志里的话</h3>
      <p v-if="quotes.length === 0">还没有记录</p>
      <ul>
        <li v-for="q in quotes" :key="q.id">
          <button type="button" :data-testid="'quote-' + q.id" @click="$emit('pick', q.id)"><b v-if="q.who" class="who">{{ q.who }}：</b>{{ q.text }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.record { margin: 10px 0; padding: 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--glass-line); max-height: 30vh; overflow-y: auto; flex: none; }
section + section { margin-top: 10px; }
h3 { margin: 0 0 6px; font-size: 14px; color: #bdb3a6; }
p { margin: 0; color: #a99f92; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 3px 0; }
button { padding: 6px 12px; text-align: left; }
.who { color: var(--accent); font-weight: 600; white-space: nowrap; }
section:first-child button { display: inline-flex; align-items: center; gap: 8px; margin: 0 6px 6px 0; }
.thumb { width: 44px; height: 44px; object-fit: contain; }
</style>
