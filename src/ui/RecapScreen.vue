<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RecapCard } from '../engine/types'
import { resolveBackground } from '../engine/backgrounds'
import { markRecapSeen } from '../engine/profile'

// "Previously on…": a few cards before a chapter, skipped or read once. It never enters the log or the rewind tree.
const props = defineProps<{ chapter: string; cards: RecapCard[] }>()
const emit = defineEmits<{ done: [] }>()

const index = ref(0)
const finished = ref(false)
const card = computed<RecapCard | null>(() => props.cards[index.value] ?? null)
const image = computed(() => (card.value?.image ? resolveBackground(card.value.image, 'night') : null))

function finish(): void {
  if (finished.value) return
  finished.value = true
  markRecapSeen(props.chapter)
  emit('done')
}

function next(): void {
  if (finished.value) return
  if (index.value >= props.cards.length - 1) {
    finish()
    return
  }
  index.value += 1
}

function onKey(e: KeyboardEvent): void {
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'Escape') {
    finish()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="recap" data-testid="recap-screen" @click="next">
    <div class="backdrop" :class="{ plain: !image }" :style="image ? { backgroundImage: `url(${image})` } : {}" />
    <div class="shade" />
    <button type="button" class="skip" data-testid="recap-skip" @click.stop="finish">跳过</button>
    <Transition name="fade" mode="out-in">
      <section v-if="card" :key="index" class="card" data-testid="recap-card">
        <h2>{{ card.title }}</h2>
        <p>{{ card.text }}</p>
      </section>
    </Transition>
    <footer class="foot">
      <span class="count">{{ cards.length > 0 ? index + 1 : 0 }} / {{ cards.length }}</span>
      <span class="hint">点击或按空格继续</span>
    </footer>
  </main>
</template>

<style scoped>
.recap { position: fixed; inset: 0; z-index: 45; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; overflow: hidden; color: #f1ece4; cursor: pointer; background: #0c0c0f; }
.backdrop { position: absolute; inset: 0; background-size: cover; background-position: center; filter: saturate(0.85); }
.backdrop.plain { background: #14161d; }
.shade { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(8, 9, 12, 0.35), rgba(8, 9, 12, 0.86)); }
.skip { position: absolute; top: 14px; right: 16px; z-index: 2; padding: 5px 14px; font: inherit; color: #f1ece4; cursor: pointer; background: rgba(16, 18, 26, 0.55); border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 8px; }
.skip:hover { background: rgba(232, 160, 112, 0.24); border-color: var(--accent); }
.card { position: relative; z-index: 1; width: min(680px, 92vw); text-align: center; text-shadow: 0 2px 10px #000; }
h2 { margin: 0 0 18px; font-size: 30px; letter-spacing: 5px; }
p { margin: 0; font-size: 17px; line-height: 2; color: #e6ddd0; }
.foot { position: absolute; left: 0; right: 0; bottom: 20px; z-index: 1; display: flex; justify-content: center; gap: 18px; font-size: 12px; color: #b9ad9d; }
.count { letter-spacing: 2px; }
.hint { opacity: 0.75; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.35s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .fade-enter-active, .fade-leave-active { transition: none; } }
</style>
