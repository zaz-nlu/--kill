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
.picker { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
p { margin: 0; color: #999; }
button { padding: 4px 10px; background: #2a2a2a; color: #eee; border: 1px solid #666; border-radius: 4px; cursor: pointer; }
</style>
