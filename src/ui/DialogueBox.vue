<script setup lang="ts">
defineProps<{ speaker: string; text: string }>()
defineEmits<{ advance: [] }>()
</script>

<template>
  <div class="dialogue" @click="$emit('advance')">
    <div v-if="speaker" class="nameplate" data-testid="nameplate">{{ speaker }}</div>
    <p class="text">{{ text }}</p>
    <span class="hint">▼</span>
  </div>
</template>

<style scoped>
.dialogue { position: relative; margin: 12px; padding: 18px 20px; min-height: 120px; background: #111d; color: #f3f3f3;
  border: 2px solid #888; border-radius: 6px; cursor: pointer; user-select: none; }
.nameplate { position: absolute; top: -14px; left: 16px; padding: 2px 14px; background: #c8501e; color: #fff; border-radius: 4px; font-weight: bold; }
.text { margin: 6px 0 0; font-size: 18px; line-height: 1.7; }
.hint { position: absolute; right: 14px; bottom: 8px; color: #aaa; }
</style>
