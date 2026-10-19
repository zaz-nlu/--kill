<script setup lang="ts">
defineProps<{ ids: string[]; names: Record<string, string> }>()
defineEmits<{ pick: [id: string] }>()
</script>

<template>
  <div class="record">
    <p v-if="ids.length === 0">还没有可以出示的东西</p>
    <button v-for="id in ids" :key="id" type="button" :data-testid="'record-' + id" @click="$emit('pick', id)">
      {{ names[id] ?? id }}
    </button>
  </div>
</template>

<style scoped>
.record { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; padding: 10px; background: #1a1a1e; border: 1px solid #666; border-radius: 6px; }
p { margin: 0; color: #999; }
button { padding: 6px 12px; background: #2a2a2a; color: #eee; border: 1px solid #777; border-radius: 4px; cursor: pointer; }
button:hover { border-color: #c8501e; }
</style>
