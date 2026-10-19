<script setup lang="ts">
defineProps<{ error?: string }>()
defineEmits<{ start: []; continue: []; debugFinale: [] }>()
</script>

<template>
  <main class="title">
    <h1>九点熄灯</h1>
    <p>每晚九点，整层熄灯。</p>
    <button type="button" data-testid="start" @click="$emit('start')">开始游戏</button>
    <button type="button" class="secondary" data-testid="continue" @click="$emit('continue')">继续游戏</button>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="button" class="dev" data-testid="debug-finale" @click="$emit('debugFinale')">【开发】直接进入终章第一幕</button>
  </main>
</template>

<style scoped>
.title { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #eee; background: linear-gradient(#0006, #000b); text-shadow: 0 2px 8px #000; }
h1 { font-size: 56px; letter-spacing: 12px; margin: 0 0 8px; }
button { margin-top: 18px; padding: 12px 36px; font-size: 18px; background: #c8501e; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
.secondary { background: #3a3a44; }
.dev { margin-top: 40px; padding: 4px 10px; font-size: 12px; background: transparent; color: #666; }
.error { color: #e8a070; margin: 12px 0 0; }
</style>
