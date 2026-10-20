<script setup lang="ts">
import { computed } from 'vue'
import { dangerTier } from '../engine/danger'

const props = withDefaults(defineProps<{ day: number; hour: number; money: number; danger: number; hp?: number }>(), { hp: 3 })
const time = computed(() => `${String(props.hour).padStart(2, '0')}:00`)
// Danger is felt, never shown as a number (spec 6.8): a heartbeat from the uneasy tier up, faster as it climbs.
const tier = computed(() => dangerTier(props.danger))
const heartbeat = computed(() => tier.value !== 'calm')
const pace = computed(() => (tier.value === 'critical' ? 'fast' : tier.value === 'tense' ? 'mid' : 'slow'))
</script>

<template>
  <header class="hud" :data-tier="tier">
    <span>第 {{ day }} 天 {{ time }}</span>
    <span>¥{{ money }}</span>
    <span class="hp" data-testid="hp" title="生命">
      <span v-for="n in 3" :key="n" :class="n <= hp ? 'full' : 'empty'">{{ n <= hp ? '❤' : '♡' }}</span>
    </span>
    <span v-if="heartbeat" data-testid="heartbeat" :class="['heart', pace]">♥</span>
  </header>
</template>

<style scoped>
.hud { display: flex; gap: 16px; align-items: center; padding: 8px 14px; background: #1b1b1fb0; color: #eee; }
.hp { letter-spacing: 2px; }
.hp .full { color: #e5484d; }
.hp .empty { color: #666; }
.heart { color: #d33; margin-left: auto; margin-right: 120px; animation: beat 1.2s infinite; }
.heart.mid { animation-duration: 0.8s; }
.heart.fast { animation-duration: 0.45s; }
@keyframes beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
</style>
