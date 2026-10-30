<script setup lang="ts">
withDefaults(defineProps<{ error?: string; devFinale?: boolean; message?: string; demo?: boolean }>(), { devFinale: true, demo: true })
defineEmits<{ start: []; continue: []; debugFinale: []; demoExam: [] }>()
</script>

<template>
  <main class="title">
    <h1>九点熄灯</h1>
    <p>每晚九点，整层熄灯。</p>
    <button type="button" data-testid="start" @click="$emit('start')">开始游戏</button>
    <button type="button" class="secondary" data-testid="continue" @click="$emit('continue')">继续游戏</button>
    <button v-if="demo" type="button" class="secondary" data-testid="demo-exam" @click="$emit('demoExam')">试玩对峙<small>2 分钟，体验对质</small></button>
    <p v-if="message" class="notice" data-testid="title-message">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button v-if="devFinale" type="button" class="dev" data-testid="debug-finale" @click="$emit('debugFinale')">【开发】直接进入终章第一幕</button>
  </main>
</template>

<style scoped>
.title { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #eee; background: linear-gradient(#0006, #000b); text-shadow: 0 2px 8px #000; }
h1 { font-size: 56px; letter-spacing: 12px; margin: 0 0 8px; }
button { margin-top: 18px; padding: 12px 36px; font-size: 18px; background: #c8501e; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
.secondary { background: #3a3a44; }
.secondary small { display: block; margin-top: 2px; font-size: 12px; font-weight: normal; opacity: .75; }
.dev { margin-top: 40px; padding: 4px 10px; font-size: 12px; background: transparent; color: #666; }
.error { color: #e8a070; margin: 12px 0 0; }
.notice { color: #d8cfc0; margin: 12px 0 0; font-size: 14px; }
</style>
