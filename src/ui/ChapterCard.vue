<script setup lang="ts">
import { computed } from 'vue'

// A full-screen card: the chapter's title card before it starts, or the card an ending is read on.
// The title card is the whole screen (click anywhere); the ending card offers one button.
const props = withDefaults(defineProps<{
  mode?: 'title' | 'end'
  title: string
  sub?: string
  date?: string
  text?: string
}>(), { mode: 'title', sub: '', date: '', text: '' })

const emit = defineEmits<{ continue: [] }>()

const paragraphs = computed(() => (props.text ? props.text.split('\n') : []))
</script>

<template>
  <main class="card" :class="mode" data-testid="chapter-card" @click="emit('continue')">
    <template v-if="mode === 'title'">
      <h2 data-testid="card-title">{{ title }}</h2>
      <p v-if="sub" class="sub" data-testid="card-sub">{{ sub }}</p>
      <p v-if="date" class="date" data-testid="card-date">{{ date }}</p>
      <p class="hint">点击继续</p>
    </template>
    <template v-else>
      <h2 data-testid="card-title">{{ title }}</h2>
      <p v-for="(p, i) in paragraphs" :key="i" class="line">{{ p }}</p>
      <button type="button" data-testid="card-continue" @click.stop="emit('continue')">继续</button>
    </template>
  </main>
</template>

<style scoped>
.card { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; overflow: auto; color: #eee; text-align: center; cursor: pointer; background: radial-gradient(ellipse at center, rgba(12, 12, 15, 0.72), rgba(12, 12, 15, 0.94)); text-shadow: 0 2px 8px #000; }
.card.end { cursor: default; }
h2 { margin: 0 0 12px; font-size: 40px; letter-spacing: 6px; }
.sub { margin: 0; font-size: 18px; color: #d8cfc0; letter-spacing: 3px; }
.date { margin: 18px 0 0; font-size: 14px; color: #b9ad9d; letter-spacing: 2px; }
.hint { margin: 46px 0 0; font-size: 13px; color: #8c8c96; letter-spacing: 2px; animation: breathe 2.4s ease-in-out infinite; }
.line { max-width: 640px; line-height: 1.8; margin: 8px 0; }
button { margin: 22px 8px 0; padding: 10px 30px; font: inherit; color: #f1ece4; cursor: pointer; background: rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 8px; }
button:hover { background: rgba(232, 160, 112, 0.24); border-color: var(--accent); }
@keyframes breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.95; } }
@media (prefers-reduced-motion: reduce) { .hint { animation: none; } }
</style>
