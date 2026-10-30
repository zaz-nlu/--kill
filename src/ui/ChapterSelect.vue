<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../engine/store'
import { isUnlocked, loadProfile } from '../engine/profile'
import type { ChapterDef } from '../engine/types'
import type { SlotMeta } from '../engine/saves'

const emit = defineEmits<{ start: [id: string]; continue: [id: string]; reset: [id: string]; recap: [id: string]; back: [] }>()
const store = useGameStore()

// The chapters in the order they are meant to be played.
const chapters = computed<ChapterDef[]>(() =>
  Object.values(store.data.chapters).sort((a, b) => a.order - b.order),
)

function autoOf(ch: ChapterDef): SlotMeta | null {
  return store.slotInfo('auto', ch.id)
}

// A chapter whose prologue scene is not written yet can be listed, but not entered.
function placeholder(ch: ChapterDef): boolean {
  return !store.data.scenes[ch.prologue]
}

function unlocked(ch: ChapterDef): boolean {
  return isUnlocked(ch, store.data.chapters)
}

// The ending a finished chapter is remembered by; only an ending that counts as a clear is shown as one.
function clearedTitle(ch: ChapterDef): string {
  const record = loadProfile().cleared[ch.id]
  if (!record) return ''
  const ending = ch.endings[record.ending]
  return ending?.clears ? ending.title : ''
}

function status(ch: ChapterDef): string {
  if (placeholder(ch)) return '敬请期待'
  if (!unlocked(ch)) return '未解锁'
  const title = clearedTitle(ch)
  return title ? `已通关 · ${title}` : '可玩'
}

function head(m: SlotMeta): string {
  return `第 ${m.day} 天 ${String(m.hour).padStart(2, '0')}:00`
}

function when(at: number): string {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function progress(ch: ChapterDef): string {
  const m = autoOf(ch)
  if (!m) return '尚未开始'
  const at = when(m.at)
  return at ? `${head(m)} · 上次游玩 ${at}` : head(m)
}

function canEnter(ch: ChapterDef): boolean {
  return unlocked(ch) && !placeholder(ch)
}

// [重新开始] asks first: it throws away this chapter's automatic save and its rewind tree, not the manual slots.
const confirming = ref<string | null>(null)

function toggleReset(ch: ChapterDef) {
  if (!autoOf(ch)) return
  confirming.value = confirming.value === ch.id ? null : ch.id
}

function confirmReset(ch: ChapterDef) {
  confirming.value = null
  emit('reset', ch.id)
}
</script>

<template>
  <main class="chapters" data-testid="chapter-select">
    <header>
      <h1>章节选择</h1>
      <p class="lead">每一章都是独立的一案。存档与回溯分别保存。</p>
    </header>
    <ul class="list">
      <li v-for="ch in chapters" :key="ch.id" class="chapter glass" :class="{ locked: !unlocked(ch), soon: placeholder(ch) }" :data-testid="'chapter-card-' + ch.id">
        <div class="head">
          <h2>{{ ch.title }}</h2>
          <span class="sub">{{ ch.sub }}</span>
          <span class="status" :data-testid="'chapter-status-' + ch.id">{{ status(ch) }}</span>
        </div>
        <p class="progress" :data-testid="'chapter-progress-' + ch.id">{{ progress(ch) }}</p>
        <p v-if="!unlocked(ch)" class="lock">未解锁：通关上一章后开放</p>
        <p v-else-if="placeholder(ch)" class="lock">这一章还在制作中。</p>

        <div v-if="confirming === ch.id" class="confirm" :data-testid="'chapter-reset-confirm-' + ch.id">
          <p>重新开始会清空本章的自动存档与回溯记录，手动存档槽不受影响。</p>
          <div class="row">
            <button type="button" class="warn" :data-testid="'chapter-reset-yes-' + ch.id" @click="confirmReset(ch)">确认重新开始</button>
            <button type="button" :data-testid="'chapter-reset-cancel-' + ch.id" @click="confirming = null">取消</button>
          </div>
        </div>

        <div class="actions">
          <template v-if="canEnter(ch)">
            <button
              v-if="autoOf(ch)"
              type="button"
              class="primary"
              :data-testid="'chapter-play-' + ch.id"
              @click="emit('continue', ch.id)"
            >继续</button>
            <button
              v-else
              type="button"
              class="primary"
              :data-testid="'chapter-play-' + ch.id"
              @click="emit('start', ch.id)"
            >开始</button>
            <button v-if="autoOf(ch)" type="button" :data-testid="'chapter-reset-' + ch.id" @click="toggleReset(ch)">重新开始</button>
          </template>
          <button v-if="ch.recap.length > 0" type="button" :data-testid="'chapter-recap-' + ch.id" @click="emit('recap', ch.id)">前情提要</button>
        </div>
      </li>
    </ul>
    <footer>
      <button type="button" data-testid="chapters-back" @click="emit('back')">返回标题</button>
    </footer>
  </main>
</template>

<style scoped>
.chapters { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; align-items: center; padding: 40px 20px 24px; overflow: auto; color: #eee; background: linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.8)); }
header { text-align: center; flex: none; }
h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: 10px; text-shadow: 0 2px 8px #000; }
.lead { margin: 0; font-size: 13px; color: #b9ad9d; }
.list { width: min(720px, 100%); list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.chapter { padding: 14px 18px; }
.chapter.locked { opacity: 0.72; }
.chapter.soon { border-style: dashed; }
.head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 20px; letter-spacing: 2px; }
.sub { font-size: 13px; color: #b9ad9d; }
.status { margin-left: auto; padding: 2px 10px; font-size: 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.1); color: #ecd3bb; }
.progress { margin: 8px 0 0; font-size: 13px; color: #d8cfc0; }
.lock { margin: 6px 0 0; font-size: 12px; color: #8c8c96; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
button { font: inherit; color: #f1ece4; padding: 7px 16px; cursor: pointer; background: rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 8px; transition: background 0.15s, border-color 0.15s; }
button:hover { background: rgba(232, 160, 112, 0.24); border-color: var(--accent); }
.primary { background: #c8501e; border-color: #c8501e; color: #fff; }
.primary:hover { background: #d9602e; border-color: #d9602e; }
.warn { border-color: #e5484d; background: #e5484d33; }
.confirm { margin-top: 12px; padding: 10px 12px; border: 1px solid #e5484d66; border-radius: 10px; background: #e5484d18; }
.confirm p { margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #f0c9c5; }
.row { display: flex; gap: 8px; }
footer { flex: none; margin-top: 22px; }
</style>
