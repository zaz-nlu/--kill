<script setup lang="ts">
defineProps<{ options: string[] }>()
defineEmits<{ choose: [index: number] }>()
</script>

<template>
  <div class="choices" data-testid="scroll">
    <button v-for="(opt, i) in options" :key="i" type="button" @click="$emit('choose', i)">{{ opt }}</button>
  </div>
</template>

<style scoped>
.choices { display: flex; flex-direction: column; gap: 10px; margin: 12px; max-height: 52vh; overflow-y: auto; padding-right: 6px; }
button { padding: 14px 18px; font-size: 17px; text-align: left; background: #222; color: #f3f3f3; border: 2px solid #888; border-radius: 6px; cursor: pointer; }
button:hover { border-color: #c8501e; }
</style>
