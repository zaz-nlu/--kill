<script setup lang="ts">
import { computed } from 'vue'
import { parseMarked } from '../engine/markup'

// A line of testimony that can be broken: every character is its own shard. While `playing` they fly apart.
// The scatter is a fixed function of the character's place in the line, so it looks the same every time.
const props = defineProps<{ text: string; playing: boolean }>()

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const chars = computed(() => {
  const out: { ch: string; mark: boolean; style: Record<string, string> }[] = []
  let i = 0
  for (const seg of parseMarked(props.text)) {
    for (const ch of Array.from(seg.text)) {
      const a = hash(i + 1) - 0.5
      const b = hash(i + 101) - 0.5
      out.push({
        ch,
        mark: Boolean(seg.mark),
        style: {
          '--dx': `${Math.round(a * 260)}px`,
          '--dy': `${Math.round(120 + hash(i + 7) * 220)}px`,
          '--dx0': `${Math.round(a * 28)}px`,
          '--dy0': `${Math.round(b * 24)}px`,
          '--r': `${Math.round(b * 520)}deg`,
          '--r0': `${Math.round(a * 30)}deg`,
          '--d': `${Math.round(hash(i + 13) * 160)}ms`,
        },
      })
      i += 1
    }
  }
  return out
})
</script>

<template>
  <span class="shatter" :class="{ playing }" data-testid="shatter-text">
    <template v-for="(c, i) in chars" :key="i"><br v-if="c.ch === '\n'"><span v-else class="ch" :class="{ mark: c.mark }" :style="c.style">{{ c.ch }}</span></template>
  </span>
</template>

<style scoped>
.shatter { white-space: pre-wrap; }
.ch { display: inline-block; white-space: pre; }
.ch.mark { color: #ff6b5e; }
.playing .ch { animation: shard 0.95s cubic-bezier(0.25, 0.6, 0.35, 1) forwards; animation-delay: var(--d); }
@keyframes shard {
  0% { transform: none; opacity: 1; }
  14% { transform: translate(var(--dx0), var(--dy0)) rotate(var(--r0)) scale(1.18); opacity: 1; filter: brightness(2.2); }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scale(0.8); opacity: 0; filter: none; }
}
@media (prefers-reduced-motion: reduce) {
  .playing .ch { animation: fade 0.4s ease-out forwards; }
  @keyframes fade { to { opacity: 0; } }
}
</style>
