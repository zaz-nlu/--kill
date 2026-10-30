<script setup lang="ts">
defineProps<{ title: string; text: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="veil" data-testid="tip-dialog" @click.self="emit('close')">
    <section class="glass box">
      <h3>{{ title }}</h3>
      <p class="text">{{ text }}</p>
      <div class="row">
        <button type="button" data-testid="tip-close" @click="emit('close')">知道了</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(520px, 92vw); padding: 16px 20px; }
h3 { margin: 0 0 10px; letter-spacing: 3px; }
.text { margin: 0; font-size: 14px; line-height: 1.7; color: #d9c7b4; white-space: pre-line; }
.row { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
