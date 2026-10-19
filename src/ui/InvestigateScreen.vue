<script setup lang="ts">
import { ref } from 'vue'

interface Spot { id: string; label: string; rect: [number, number, number, number]; seen: boolean }

defineProps<{ label: string; hotspots: Spot[] }>()
defineEmits<{ inspect: [id: string]; leave: [] }>()

const hover = ref('')
</script>

<template>
  <div class="investigate">
    <!-- A 16:9 frame that covers the screen exactly like the background does, so % rectangles line up with the picture. -->
    <div class="frame">
      <button
        v-for="h in hotspots"
        :key="h.id"
        type="button"
        class="hotspot"
        :class="{ seen: h.seen }"
        :data-testid="'hotspot-' + h.id"
        :style="{ left: h.rect[0] + '%', top: h.rect[1] + '%', width: h.rect[2] + '%', height: h.rect[3] + '%' }"
        :title="h.label"
        @mouseenter="hover = h.label"
        @mouseleave="hover = ''"
        @click="$emit('inspect', h.id)"
      >
        <span class="tag">{{ h.seen ? '✓ ' : '' }}{{ h.label }}</span>
      </button>
    </div>
    <div class="bar">
      <span class="where">{{ label }}</span>
      <span class="hint">{{ hover || '点击场景里发亮的地方调查' }}</span>
      <button type="button" class="leave" data-testid="leave-room" @click="$emit('leave')">离开</button>
    </div>
  </div>
</template>

<style scoped>
.investigate { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.frame { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: max(100vw, calc(100vh * 16 / 9)); height: max(100vh, calc(100vw * 9 / 16)); }
.hotspot { position: absolute; pointer-events: auto; cursor: pointer; padding: 0; background: #ffd27a14;
  border: 2px solid #ffd27a99; border-radius: 6px; animation: pulse 2s infinite; }
.hotspot:hover { background: #ffd27a40; border-color: #fff; }
.hotspot.seen { border-style: dashed; border-color: #ffffff55; background: transparent; animation: none; }
.tag { position: absolute; left: 0; top: 100%; margin-top: 4px; padding: 2px 8px; font-size: 14px; color: #fff; background: #000c; border-radius: 4px; white-space: nowrap; opacity: 0; transition: opacity 0.15s; }
.hotspot:hover .tag { opacity: 1; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 #ffd27a55; } 50% { box-shadow: 0 0 14px 4px #ffd27a55; } }
.bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 16px; align-items: center; padding: 12px 18px; background: #000c; color: #eee; pointer-events: auto; }
.where { font-weight: bold; padding: 2px 12px; background: #c8501e; border-radius: 4px; }
.hint { flex: 1; color: #bbb; }
.leave { padding: 8px 26px; font-size: 16px; background: #3a3a44; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
</style>
