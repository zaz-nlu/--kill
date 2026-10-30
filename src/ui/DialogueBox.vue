<script setup lang="ts">
import { computed } from 'vue'
import { useTypewriter } from './useTypewriter'

const props = defineProps<{ speaker: string; text: string }>()
const emit = defineEmits<{ advance: [] }>()

const source = computed(() => props.text)
const { count, done, skip } = useTypewriter(source)
const visible = computed(() => props.text.slice(0, count.value))
const rest = computed(() => props.text.slice(count.value))

// First click completes the line; only a line that is already whole moves on.
function onClick() {
  if (!done.value) {
    skip()
    return
  }
  emit('advance')
}
</script>

<template>
  <div class="dialogue glass" @click="onClick">
    <div v-if="speaker" class="nameplate" data-testid="nameplate">{{ speaker }}</div>
    <p class="text">{{ visible }}<span class="rest">{{ rest }}</span></p>
    <span v-if="done" class="hint">▼</span>
  </div>
</template>

<style scoped>
.dialogue { position: relative; margin: 12px; padding: 24px 28px 18px; min-height: 132px; cursor: pointer; user-select: none; }
.nameplate { position: absolute; top: -15px; left: 24px; padding: 3px 20px; background: linear-gradient(135deg, #ee8044, #b8431a); color: #fff; border-radius: 999px; font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45); }
.text { margin: 6px 0 0; font-size: 19px; line-height: 1.85; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); }
.rest { visibility: hidden; }
.hint { position: absolute; right: 18px; bottom: 10px; color: var(--accent); animation: nudge 1.1s ease-in-out infinite; }
@keyframes nudge { 0%, 100% { transform: translateY(0); opacity: 0.6; } 50% { transform: translateY(3px); opacity: 1; } }
</style>
