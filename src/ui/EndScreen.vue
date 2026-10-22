<script setup lang="ts">
import { computed } from 'vue'
import { ENDINGS } from '../engine/endings'

const props = defineProps<{ failed: boolean; canFinale?: boolean; reason?: string | null }>()
defineEmits<{ restart: []; finale: [] }>()

const ending = computed(() => (props.reason ? ENDINGS[props.reason] ?? null : null))
const title = computed(() => ending.value?.title ?? (props.failed ? '说服力归零' : '切片到此结束'))
const paragraphs = computed(() => (ending.value ? ending.value.text.split('\n') : [props.failed ? '黎默看着你，什么都没说。' : '感谢试玩。']))
</script>

<template>
  <main class="end">
    <h2>{{ title }}</h2>
    <p v-for="(p, i) in paragraphs" :key="i" class="line">{{ p }}</p>
    <button v-if="canFinale" type="button" data-testid="to-finale" @click="$emit('finale')">进入终章第一幕（切片）</button>
    <button type="button" data-testid="restart" @click="$emit('restart')">回到标题</button>
  </main>
</template>

<style scoped>
.end { margin: 14vh auto 0; max-width: 640px; padding: 0 16px; text-align: center; color: #eee; }
.line { line-height: 1.8; margin: 8px 0; }
button { margin: 20px 8px 0; padding: 10px 30px; cursor: pointer; }
</style>
