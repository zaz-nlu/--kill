<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import type { Change } from '../engine/changes'

type Item = Change & { id: number }

const props = defineProps<{ items: Item[]; names: Record<string, string> }>()
const emit = defineEmits<{ dismiss: [id: number] }>()

const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

// Danger is felt through the heartbeat, never announced here.
const shown = computed(() =>
  props.items
    .filter(i => i.kind !== 'danger')
    .map(i => {
      let text = ''
      if (i.kind === 'affinity') text = `${props.names[i.npc] ?? i.npc} 好感 ${sign(i.delta)}`
      else if (i.kind === 'trust') text = `信任 ${sign(i.delta)}`
      else if (i.kind === 'hp') text = `生命 ${sign(i.delta)}`
      else text = `¥ ${sign(i.delta)}`
      return { id: i.id, text, up: i.delta > 0 }
    }),
)

const timers = new Map<number, ReturnType<typeof setTimeout>>()
watch(
  () => props.items.map(i => i.id),
  ids => {
    for (const id of ids) {
      if (!timers.has(id)) timers.set(id, setTimeout(() => { timers.delete(id); emit('dismiss', id) }, 3500))
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <div class="toasts">
    <div v-for="t in shown" :key="t.id" class="toast" :class="t.up ? 'up' : 'down'" :data-testid="'toast-' + t.id">{{ t.text }}</div>
  </div>
</template>

<style scoped>
.toasts { position: fixed; left: 14px; top: 52px; z-index: 15; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
.toast { padding: 5px 14px; background: #000c; border-left: 4px solid; border-radius: 4px; font-size: 15px; color: #fff; }
.toast.up { border-color: #6aa86a; }
.toast.down { border-color: #d6574a; }
</style>
