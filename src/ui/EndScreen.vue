<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ENDINGS } from '../engine/endings'
import { markCleared } from '../engine/profile'
import type { EndingDef } from '../engine/types'

const props = withDefaults(defineProps<{
  failed: boolean
  canFinale?: boolean
  reason?: string | null
  endings?: Record<string, EndingDef>
  chapterId?: string
  nextTitle?: string | null
}>(), { canFinale: false, endings: () => ENDINGS, chapterId: 'c1', nextTitle: null })
defineEmits<{ restart: []; finale: []; chapters: [] }>()

const ending = computed(() => (props.reason ? props.endings[props.reason] ?? null : null))
const title = computed(() => ending.value?.title ?? (props.failed ? '说服力归零' : '切片到此结束'))
const paragraphs = computed(() => (ending.value ? ending.value.text.split('\n') : [props.failed ? '黎默看着你，什么都没说。' : '感谢试玩。']))
// Only an ending that counts as a clear is written to the record; a BAD ending leaves the next chapter locked.
const clears = computed(() => ending.value?.clears === true)

onMounted(() => {
  if (clears.value && props.reason) markCleared(props.chapterId, props.reason)
})
</script>

<template>
  <main class="end">
    <h2>{{ title }}</h2>
    <p v-for="(p, i) in paragraphs" :key="i" class="line">{{ p }}</p>
    <p v-if="clears && nextTitle" class="next" data-testid="next-chapter">下一章已解锁：{{ nextTitle }}</p>
    <button v-if="canFinale" type="button" data-testid="to-finale" @click="$emit('finale')">进入终章第一幕（切片）</button>
    <button v-if="!clears" type="button" data-testid="restart" @click="$emit('restart')">回到标题</button>
    <button type="button" data-testid="to-chapters" @click="$emit('chapters')">章节选择</button>
  </main>
</template>

<style scoped>
.end { margin: 14vh auto 0; max-width: 640px; padding: 0 16px; text-align: center; color: #eee; }
.line { line-height: 1.8; margin: 8px 0; }
.next { margin: 18px 0 0; color: #e8a070; letter-spacing: 2px; }
button { margin: 20px 8px 0; padding: 10px 30px; cursor: pointer; }
</style>
