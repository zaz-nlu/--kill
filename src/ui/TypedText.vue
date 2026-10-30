<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { useTypewriter } from './useTypewriter'

const props = withDefaults(defineProps<{ text: string; scale?: number; active?: boolean }>(), { scale: 1, active: true })
const emit = defineEmits<{ done: [] }>()

const source = toRef(props, 'text')
const active = toRef(props, 'active')
const { count, done, skip } = useTypewriter(source, { scale: props.scale, active })
const visible = computed(() => source.value.slice(0, count.value))
const rest = computed(() => source.value.slice(count.value))

watch(done, d => { if (d) emit('done') }, { immediate: true })

defineExpose({ skip, done })
</script>

<template>
  <span>{{ visible }}<span class="rest">{{ rest }}</span></span>
</template>

<style scoped>
.rest { visibility: hidden; }
</style>
