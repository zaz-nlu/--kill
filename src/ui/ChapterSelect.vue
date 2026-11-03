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

// Built from design/posters/<id>.png by tools/build_assets.mjs. In tests (and before the script runs) there is no
// image, so a poster falls back to a plain coloured cover instead of failing.
const posterFiles = import.meta.glob('../assets/posters/*.webp', { eager: true, import: 'default' }) as Record<string, string>

function posterOf(ch: ChapterDef): string | null {
  return posterFiles[`../assets/posters/${ch.id}.webp`] ?? null
}

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

// The poster picked from the row; its actions show underneath. The first chapter that can be entered is picked on open,
// so the list still offers a way in without a first click.
const selected = ref<string | null>(chapters.value.find(c => canEnter(c))?.id ?? null)
const selectedChapter = computed<ChapterDef | null>(
  () => chapters.value.find(c => c.id === selected.value) ?? null,
)

// A chapter opens only after the one before it was cleared. Case 1 is always open (isUnlocked handles that).
function clickable(ch: ChapterDef): boolean {
  return unlocked(ch)
}

function select(ch: ChapterDef) {
  if (!clickable(ch)) return
  if (selected.value !== ch.id) confirming.value = null
  selected.value = ch.id
}

// Which corner badge a poster carries: open, cleared, still locked, or not written yet.
function badgeClass(ch: ChapterDef): string {
  if (placeholder(ch)) return 'soon'
  if (!unlocked(ch)) return 'locked'
  return clearedTitle(ch) ? 'cleared' : 'open'
}
</script>

<template>
  <main class="chapters" data-testid="chapter-select">
    <header>
      <h1>章节选择</h1>
      <p class="lead">每一章都是独立的一案。存档与回溯分别保存。</p>
    </header>
    <ul class="posters">
      <li v-for="ch in chapters" :key="ch.id" class="cell">
        <button
          type="button"
          class="poster"
          :class="{ locked: !unlocked(ch), soon: placeholder(ch), selected: selected === ch.id }"
          :disabled="!clickable(ch)"
          :aria-pressed="selected === ch.id"
          :data-testid="'chapter-card-' + ch.id"
          @click="select(ch)"
        >
          <span v-if="posterOf(ch)" class="art" :style="{ backgroundImage: `url(${posterOf(ch)})` }"></span>
          <span v-else class="art fallback" :class="'tone-' + ch.id"></span>
          <span class="shade"></span>
          <span class="no">第 {{ ch.order }} 章</span>
          <span class="name">{{ ch.title }}</span>
          <span class="badge" :class="badgeClass(ch)" :data-testid="'chapter-status-' + ch.id">
            <svg v-if="badgeClass(ch) === 'locked'" class="lock-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 7V5a3 3 0 0 1 6 0v2m-7 0h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            {{ status(ch) }}
          </span>
        </button>
        <p v-if="!unlocked(ch)" class="lock">先完成上一章</p>
        <p v-else-if="placeholder(ch)" class="lock">这一章还在制作中。</p>
        <button
          v-if="ch.recap.length > 0 && selected !== ch.id"
          type="button"
          class="recap"
          :data-testid="'chapter-recap-' + ch.id"
          @click="emit('recap', ch.id)"
        >前情提要</button>
      </li>
    </ul>

    <section v-if="selectedChapter" class="details glass" :data-testid="'chapter-details-' + selectedChapter.id">
      <div class="head">
        <h2>{{ selectedChapter.title }}</h2>
        <span class="sub">{{ selectedChapter.sub }}</span>
      </div>
      <p class="progress" :data-testid="'chapter-progress-' + selectedChapter.id">{{ progress(selectedChapter) }}</p>
      <p v-if="placeholder(selectedChapter)" class="lock">这一章还在制作中。</p>

      <div v-if="confirming === selectedChapter.id" class="confirm" :data-testid="'chapter-reset-confirm-' + selectedChapter.id">
        <p>重新开始会清空本章的自动存档与回溯记录，手动存档槽不受影响。</p>
        <div class="row">
          <button type="button" class="warn" :data-testid="'chapter-reset-yes-' + selectedChapter.id" @click="confirmReset(selectedChapter)">确认重新开始</button>
          <button type="button" :data-testid="'chapter-reset-cancel-' + selectedChapter.id" @click="confirming = null">取消</button>
        </div>
      </div>

      <div class="actions">
        <template v-if="canEnter(selectedChapter)">
          <button
            v-if="autoOf(selectedChapter)"
            type="button"
            class="primary"
            :data-testid="'chapter-play-' + selectedChapter.id"
            @click="emit('continue', selectedChapter.id)"
          >继续</button>
          <button
            v-else
            type="button"
            class="primary"
            :data-testid="'chapter-play-' + selectedChapter.id"
            @click="emit('start', selectedChapter.id)"
          >开始</button>
          <button v-if="autoOf(selectedChapter)" type="button" :data-testid="'chapter-reset-' + selectedChapter.id" @click="toggleReset(selectedChapter)">重新开始</button>
        </template>
        <button
          v-if="selectedChapter.recap.length > 0"
          type="button"
          :data-testid="'chapter-recap-' + selectedChapter.id"
          @click="emit('recap', selectedChapter.id)"
        >前情提要</button>
      </div>
    </section>
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
.posters { width: min(1120px, 100%); list-style: none; margin: 22px 0 0; padding: 4px 4px 8px; display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; flex: none; }
.cell { flex: 1 1 180px; min-width: 150px; max-width: 250px; display: flex; flex-direction: column; gap: 8px; }
.poster { position: relative; display: block; width: 100%; aspect-ratio: 2 / 3; padding: 0; overflow: hidden; cursor: pointer; color: #f3e7d4; background: #16110d; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45); transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
.poster:not(:disabled):hover { transform: translateY(-3px) scale(1.015); border-color: rgba(232, 160, 112, 0.7); }
.poster:disabled { cursor: not-allowed; background: #16110d; }
.poster:disabled:hover { background: #16110d; border-color: rgba(255, 255, 255, 0.18); }
.poster.selected { border-color: var(--accent, #e8a070); box-shadow: 0 0 0 1px var(--accent, #e8a070), 0 0 26px rgba(232, 160, 112, 0.4); }
.art { position: absolute; inset: 0; background-position: center; background-size: cover; }
.fallback { background: linear-gradient(165deg, #2b2119, #0c0907 72%); }
.tone-c1 { background: linear-gradient(165deg, #31261d, #0b0908 70%); }
.tone-c2 { background: linear-gradient(165deg, #1d2a2c, #070b0c 70%); }
.tone-c3 { background: linear-gradient(165deg, #24242c, #08080b 70%); }
.tone-c4 { background: linear-gradient(165deg, #2d2420, #0b0807 70%); }
.poster.locked .art { filter: grayscale(1) brightness(0.55); }
.poster.soon .art { filter: grayscale(0.85) brightness(0.6); }
.poster.locked .name, .poster.soon .name { opacity: 0.72; }
.shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(5, 4, 3, 0.92) 0%, rgba(5, 4, 3, 0.45) 34%, rgba(5, 4, 3, 0) 64%); }
.no { position: absolute; top: 10px; left: 12px; font-size: 11px; letter-spacing: 3px; color: #e7d7c2; opacity: 0.85; }
.name { position: absolute; right: 12px; bottom: 46px; left: 12px; font-family: "STKaiti", "KaiTi", "楷体", "Songti SC", serif; font-size: clamp(20px, 2.4vw, 30px); font-weight: 700; line-height: 1.2; letter-spacing: 3px; color: #f5e9d6; -webkit-text-stroke: 1px rgba(20, 14, 10, 0.85); text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95), 0 0 18px rgba(0, 0, 0, 0.7); }
.badge { position: absolute; bottom: 12px; left: 12px; display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; font-size: 12px; border-radius: 999px; color: #f0dcc4; background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(255, 255, 255, 0.22); backdrop-filter: blur(4px); }
.badge.locked { color: #b9b6c0; }
.badge.soon { color: #a9a4ad; }
.badge.cleared { color: #ffd9a8; border-color: rgba(232, 160, 112, 0.55); }
.lock-icon { width: 12px; height: 12px; flex: none; }
.lock { margin: 0; font-size: 12px; line-height: 1.5; color: #8c8c96; text-align: center; }
.recap { align-self: center; padding: 4px 12px; font-size: 12px; }
.details { width: min(720px, 100%); margin-top: 16px; padding: 14px 18px; }
.details .head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 20px; letter-spacing: 2px; }
.sub { font-size: 13px; color: #b9ad9d; }
.progress { margin: 8px 0 0; font-size: 13px; color: #d8cfc0; }
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
