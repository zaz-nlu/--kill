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
.choices { display: flex; flex-direction: column; gap: 8px; margin: 12px; max-height: 52vh; overflow-y: auto; padding-right: 6px; }
button { position: relative; padding: 14px 20px; font-size: 17px; text-align: left; border-radius: 10px; overflow: hidden; background: var(--glass); backdrop-filter: blur(14px) saturate(1.25); border: 1px solid var(--glass-line); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3); }
button::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; transition: background 0.15s; }
button:hover::before { background: var(--accent); }
</style>
