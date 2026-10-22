<script setup lang="ts">
import { computed, ref } from 'vue'

interface Row { id: string; time: string; text: string }

defineProps<{ prompt: string; rows: Row[]; feedback: string }>()
const emit = defineEmits<{ submit: [ids: string[]]; skip: [] }>()

const marked = ref<string[]>([])
const ready = computed(() => marked.value.length > 0)

function toggle(id: string) {
  const at = marked.value.indexOf(id)
  if (at >= 0) marked.value.splice(at, 1)
  else marked.value.push(id)
}

function submit() {
  if (ready.value) emit('submit', [...marked.value])
}
</script>

<template>
  <section class="frames glass">
    <header>
      <h2>站会录像 · 逐帧检查</h2>
      <span class="count">已标记 {{ marked.length }} 处</span>
    </header>
    <p class="prompt">{{ prompt }}</p>
    <ul class="list" data-testid="scroll">
      <li v-for="r in rows" :key="r.id">
        <button type="button" :class="{ on: marked.includes(r.id) }" :data-testid="'row-' + r.id" @click="toggle(r.id)">
          <span class="box">{{ marked.includes(r.id) ? '✔' : '' }}</span>
          <span class="time">{{ r.time }}</span>
          <span class="text">{{ r.text }}</span>
        </button>
      </li>
    </ul>
    <p v-if="feedback" class="feedback">{{ feedback }}</p>
    <footer>
      <button type="button" data-testid="frames-skip" @click="emit('skip')">先看别的</button>
      <button type="button" class="go" data-testid="frames-submit" :disabled="!ready" @click="submit">指认</button>
    </footer>
  </section>
</template>

<style scoped>
.frames { display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 76px); margin: 12px; padding: 14px 18px 12px; }
header { display: flex; justify-content: space-between; align-items: baseline; flex: none; }
h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 2px; }
.count { font-size: 13px; color: #d9c7b4; }
.prompt { margin: 6px 0 8px; flex: none; color: #ece6dc; }
.list { flex: 1 1 auto; min-height: 120px; margin: 0; padding: 0 6px 0 0; list-style: none; overflow-y: auto; }
.list li { margin-bottom: 6px; }
.list button { display: grid; grid-template-columns: 26px 118px 1fr; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; text-align: left; border-radius: 10px; }
.list button.on { border-color: var(--accent); background: rgba(232, 160, 112, 0.22); }
.box { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 5px; color: var(--accent); font-size: 14px; }
.time { font-variant-numeric: tabular-nums; color: var(--accent); font-size: 14px; }
.text { line-height: 1.5; }
.feedback { margin: 8px 0 0; flex: none; padding: 8px 12px; border-left: 4px solid #4aa3ff; background: rgba(60, 110, 190, 0.2); border-radius: 6px; }
footer { flex: none; display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.go { padding: 8px 32px; font-size: 16px; border-color: rgba(232, 160, 112, 0.7); }
</style>
