<script setup lang="ts">
defineEmits<{ start: [] }>()
</script>

<template>
  <main class="title">
    <h1>九点熄灯</h1>
    <p>每晚九点，整层熄灯。</p>
    <button type="button" data-testid="start" @click="$emit('start')">开始游戏</button>
  </main>
</template>

<style scoped>
.title { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; color: #eee; background: #101014; }
h1 { font-size: 56px; letter-spacing: 12px; margin: 0 0 8px; }
button { margin-top: 28px; padding: 12px 36px; font-size: 18px; background: #c8501e; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
</style>
