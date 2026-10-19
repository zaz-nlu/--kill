<script setup lang="ts">
import { computed } from 'vue'
import { resolveBackground, type TimeOfDay } from '../engine/backgrounds'
import { resolveSprite } from '../engine/characters'

interface Slot { id: string; expr: string }

const props = withDefaults(defineProps<{
  bg: string
  time?: TimeOfDay
  left: Slot | null
  right: Slot | null
  side: 'left' | 'right' | null
  names: Record<string, string>
}>(), { time: 'night' })

const bgUrl = computed(() => resolveBackground(props.bg, props.time))
const leftSprite = computed(() => (props.left ? resolveSprite(props.left.id, props.left.expr) : null))
const rightSprite = computed(() => (props.right ? resolveSprite(props.right.id, props.right.expr) : null))

function label(slot: Slot): string {
  return props.names[slot.id] ?? slot.id
}
</script>

<template>
  <div class="stage-root">
    <div class="bg" data-testid="bg" :data-bg="bg" :style="bgUrl ? { backgroundImage: `url(${bgUrl})` } : {}" />
    <div
      v-if="left"
      class="slot left"
      data-testid="slot-left"
      :class="{ active: side === 'left', dim: side === 'right' }"
    >
      <img v-if="leftSprite" data-testid="sprite-left" :src="leftSprite.src" :alt="label(left)">
      <div v-else class="placeholder" data-testid="sprite-left-placeholder">{{ label(left) }}</div>
    </div>
    <div
      v-if="right"
      class="slot right"
      data-testid="slot-right"
      :class="{ active: side === 'right', dim: side === 'left' }"
    >
      <img v-if="rightSprite" data-testid="sprite-right" :src="rightSprite.src" :alt="label(right)">
      <div v-else class="placeholder" data-testid="sprite-right-placeholder">{{ label(right) }}</div>
    </div>
    <div class="content"><slot /></div>
  </div>
</template>

<style scoped>
.stage-root { position: relative; height: 100vh; overflow: hidden; background: #0c0c0f; }
.bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.slot { position: absolute; bottom: 0; height: 118vh; max-height: 118vh; display: flex; align-items: flex-end; transition: filter 0.2s, opacity 0.2s; pointer-events: none; }
.slot.left { left: 4%; }
.slot.right { right: 4%; }
.slot img { height: 100%; width: auto; object-fit: contain; object-position: bottom; transform: translateY(24vh); }
.slot.dim { filter: brightness(0.55); }
.slot.active { filter: brightness(1.05); }
.placeholder { align-self: center; margin-bottom: 40vh; padding: 14px 28px; background: #000b; color: #ddd; border: 2px solid #888; border-radius: 8px; font-size: 22px; }
.content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; }
</style>
