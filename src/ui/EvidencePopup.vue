<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

interface Item { id: number; kind: string; refId: string; name: string; desc: string; image: string | null }

const props = defineProps<{ item: Item }>()
const emit = defineEmits<{ close: [] }>()

const LABEL: Record<string, string> = { evidence: '获得证物', testimony: '获得证言', show: '证物', present: '出示证物' }
const label = computed(() => LABEL[props.item.kind] ?? '证物')

// Something you present in the cross-examination is shown briefly and gets out of the way by itself.
const passive = computed(() => props.item.kind === 'present')

let timer: ReturnType<typeof setTimeout> | undefined
function arm() {
  clearTimeout(timer)
  if (passive.value) timer = setTimeout(() => emit('close'), 1700)
}
watch(() => props.item.id, arm)

function onKey(e: KeyboardEvent) {
  if (passive.value) return
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
function onClick() {
  if (!passive.value) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  arm()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(timer)
})
</script>

<template>
  <div class="popup" :class="[item.kind, { passive }]" data-testid="evidence-popup" @click="onClick">
    <div class="card glass" :key="item.id">
      <div class="tag">{{ label }}</div>
      <div class="inner">
        <img v-if="item.image" class="pic" data-testid="popup-image" :src="item.image" :alt="item.name">
        <h3>{{ item.name }}</h3>
        <p>{{ item.desc }}</p>
        <div v-if="!passive" class="hint">点击继续</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); cursor: pointer; animation: fade 0.18s ease-out; }
.popup.passive { background: rgba(0, 0, 0, 0.25); pointer-events: none; cursor: default; }
.card { position: relative; width: min(520px, 90vw); padding: 28px 30px 20px; text-align: center; animation: pop 0.32s cubic-bezier(0.2, 1.3, 0.4, 1); box-shadow: 0 0 0 1px rgba(232, 160, 112, 0.5), 0 0 60px rgba(232, 160, 112, 0.28), 0 18px 48px rgba(0, 0, 0, 0.55); }
.inner { max-height: calc(86vh - 70px); overflow-y: auto; }
.tag { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); padding: 3px 22px; white-space: nowrap; font-size: 14px; font-weight: 600; letter-spacing: 3px; color: #fff; background: linear-gradient(135deg, #ee8044, #b8431a); border-radius: 999px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
.testimony .tag { background: linear-gradient(135deg, #4aa3ff, #2c5ea8); }
.pic { display: block; max-width: 70%; max-height: 260px; margin: 10px auto 6px; object-fit: contain; filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.55)); animation: tilt 0.5s ease-out; }
h3 { margin: 8px 0 8px; font-size: 22px; letter-spacing: 1px; }
p { margin: 0; text-align: left; line-height: 1.8; font-size: 16px; color: #ece6dc; }
.hint { margin-top: 14px; font-size: 13px; color: var(--accent); animation: blink 1.2s ease-in-out infinite; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop { from { opacity: 0; transform: scale(0.82) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes tilt { from { transform: rotate(-6deg) scale(0.9); } to { transform: rotate(0) scale(1); } }
@keyframes blink { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
</style>
