<script setup lang="ts">
import { ref } from 'vue'
import type { SlotMeta } from '../engine/saves'

const props = defineProps<{
  mode: 'save' | 'load'
  slots: { slot: number; meta: SlotMeta | null }[]
  auto: SlotMeta | null
}>()
const emit = defineEmits<{ pick: [slot: number | 'auto']; remove: [slot: number]; close: [] }>()

const confirming = ref<number | null>(null) // an occupied slot the player is about to overwrite or delete
const confirmingKind = ref<'save' | 'remove'>('save')

function when(at: number): string {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function head(m: SlotMeta): string {
  return `第 ${m.day} 天 ${String(m.hour).padStart(2, '0')}:00`
}

function clickSlot(slot: number, meta: SlotMeta | null) {
  if (props.mode === 'load') {
    if (meta) emit('pick', slot)
    return
  }
  if (meta && !(confirming.value === slot && confirmingKind.value === 'save')) {
    confirming.value = slot
    confirmingKind.value = 'save'
    return
  }
  confirming.value = null
  emit('pick', slot)
}

function clickRemove(slot: number) {
  if (confirming.value === slot && confirmingKind.value === 'remove') {
    confirming.value = null
    emit('remove', slot)
    return
  }
  confirming.value = slot
  confirmingKind.value = 'remove'
}
</script>

<template>
  <div class="veil" data-testid="save-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>{{ mode === 'save' ? '存档' : '读取存档' }}</h3>
        <button type="button" data-testid="save-close" @click="emit('close')">关闭</button>
      </header>
      <ul>
        <li v-if="mode === 'load'">
          <button type="button" class="slot auto" :disabled="!auto" data-testid="slot-auto" @click="auto && emit('pick', 'auto')">
            <b>继续上次</b>
            <span v-if="auto">{{ head(auto) }} · 证物 {{ auto.evidence }} · 证言 {{ auto.testimony }}</span>
            <span v-else class="dim">还没有</span>
            <em v-if="auto">{{ when(auto.at) }}</em>
          </button>
        </li>
        <li v-for="s in slots" :key="s.slot">
          <button type="button" class="slot" :class="{ empty: !s.meta, warn: confirming === s.slot }" :disabled="mode === 'load' && !s.meta"
                  :data-testid="'slot-' + s.slot" @click="clickSlot(s.slot, s.meta)">
            <b>存档 {{ s.slot }}</b>
            <span v-if="confirming === s.slot && confirmingKind === 'save'">覆盖这个存档？再点一次确认</span>
            <span v-else-if="confirming === s.slot && confirmingKind === 'remove'">删除这个存档？再点右边的删除确认</span>
            <span v-else-if="s.meta">{{ head(s.meta) }} · 证物 {{ s.meta.evidence }} · 证言 {{ s.meta.testimony }}</span>
            <span v-else class="dim">空</span>
            <em v-if="s.meta">{{ when(s.meta.at) }}</em>
          </button>
          <button v-if="s.meta" type="button" class="del" :data-testid="'remove-' + s.slot" @click="clickRemove(s.slot)">删除</button>
        </li>
      </ul>
      <p class="tip">{{ mode === 'save' ? '只能在行动菜单里存档。' : '读取后会回到那个时刻，之前的回溯分支不会带上。' }}</p>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(560px, 92vw); max-height: 86vh; overflow: auto; padding: 16px 18px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h3 { margin: 0; letter-spacing: 3px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; gap: 8px; align-items: stretch; }
.slot { flex: 1; display: flex; gap: 12px; align-items: baseline; text-align: left; padding: 10px 14px; }
.slot b { min-width: 64px; }
.slot span { flex: 1; }
.slot em { font-style: normal; font-size: 12px; color: #b9ad9d; }
.slot.warn { border-color: #e5484d; background: #e5484d22; }
.dim { color: #8c8c96; }
.auto { border-color: var(--accent); }
.del { padding: 4px 10px; font-size: 13px; }
.tip { margin: 12px 2px 0; font-size: 13px; color: #b9ad9d; }
</style>
