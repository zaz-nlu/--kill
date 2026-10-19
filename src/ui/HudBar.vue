<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ day: number; hour: number; money: number; danger: number }>()
const time = computed(() => `${String(props.hour).padStart(2, '0')}:00`)
// Danger is felt, never shown as a number (spec 6.8): a heartbeat appears from 30 upwards.
const heartbeat = computed(() => props.danger >= 30)
const pace = computed(() => (props.danger >= 90 ? 'fast' : props.danger >= 60 ? 'mid' : 'slow'))
</script>

<template>
  <header class="hud">
    <span>第 {{ day }} 天 {{ time }}</span>
    <span>¥{{ money }}</span>
    <span v-if="heartbeat" data-testid="heartbeat" :class="['heart', pace]">♥</span>
  </header>
</template>

<style scoped>
.hud { display: flex; gap: 16px; align-items: center; padding: 8px 14px; background: #1b1b1fb0; color: #eee; }
.heart { color: #d33; margin-left: auto; animation: beat 1.2s infinite; }
.heart.mid { animation-duration: 0.8s; }
.heart.fast { animation-duration: 0.45s; }
@keyframes beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
</style>
