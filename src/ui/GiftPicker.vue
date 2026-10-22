<script setup lang="ts">
import { computed } from 'vue'
import type { Item } from '../engine/types'

const props = defineProps<{ inventory: Record<string, number>; items: Item[] }>()
defineEmits<{ pick: [itemId: string] }>()

const owned = computed(() =>
  props.items.filter(i => (props.inventory[i.id] ?? 0) > 0).map(i => ({ ...i, count: props.inventory[i.id] })),
)
</script>

<template>
  <div class="picker">
    <p v-if="owned.length === 0">背包是空的</p>
    <button v-for="i in owned" :key="i.id" type="button" :data-testid="'pick-' + i.id" @click="$emit('pick', i.id)">
      {{ i.name }} ×{{ i.count }}
    </button>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; max-height: 110px; overflow-y: auto; }
p { margin: 0; color: #a99f92; }
button { padding: 4px 12px; font-size: 13px; }
</style>
