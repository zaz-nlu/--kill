<script setup lang="ts">
import { ref } from 'vue'
// `account` is the signed-in name ('' when nobody is); leaving it out hides the button (no server to sign in to).
withDefaults(defineProps<{ error?: string; devFinale?: boolean; message?: string; demo?: boolean; account?: string }>(), { devFinale: true, demo: true })
defineEmits<{ start: []; continue: []; chapters: []; debugFinale: []; demoExam: []; account: [] }>()

// Tap the small version tag to see which build this is.
const build = typeof __BUILD__ === 'undefined' ? null : __BUILD__
const showBuild = ref(false)
</script>

<template>
  <main class="title">
    <h1>雨落无声</h1>
    <p>灯暗下去的时候，真相才开始。</p>
    <button type="button" data-testid="start" @click="$emit('start')">开始游戏</button>
    <button type="button" class="secondary" data-testid="continue" @click="$emit('continue')">继续游戏</button>
    <button type="button" class="secondary" data-testid="chapters" @click="$emit('chapters')">章节选择</button>
    <button v-if="account !== undefined" type="button" class="secondary" data-testid="account" @click="$emit('account')">{{ account ? `账号：${account}` : '登录 / 注册' }}</button>
    <button v-if="demo" type="button" class="secondary" data-testid="demo-exam" @click="$emit('demoExam')">试玩对峙<small>2 分钟，体验对质</small></button>
    <p v-if="message" class="notice" data-testid="title-message">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button v-if="devFinale" type="button" class="dev" data-testid="debug-finale" @click="$emit('debugFinale')">【开发】直接进入终章第一幕</button>
    <button v-if="build" type="button" class="ver" data-testid="build-tag" @click="showBuild = !showBuild">版本 {{ build.commit }}</button>
    <p v-if="build && showBuild" class="buildinfo" data-testid="build-info">提交 {{ build.commit }} · 构建于 {{ build.time }}<br>{{ build.subject }}</p>
  </main>
</template>

<style scoped>
.title { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #eee; background: linear-gradient(#0006, #000b); text-shadow: 0 2px 8px #000; }
h1 { font-size: 56px; letter-spacing: 12px; margin: 0 0 8px; }
button { margin-top: 18px; padding: 12px 36px; font-size: 18px; background: #c8501e; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
.secondary { background: #3a3a44; }
.secondary small { display: block; margin-top: 2px; font-size: 12px; font-weight: normal; opacity: .75; }
.dev { margin-top: 40px; padding: 4px 10px; font-size: 12px; background: transparent; color: #666; }
.ver { margin-top: 14px; padding: 2px 10px; font-size: 12px; background: transparent; color: #8a8378; }
.buildinfo { margin: 4px 16px 0; font-size: 12px; line-height: 1.6; color: #b9ad9d; text-align: center; }
.error { color: #e8a070; margin: 12px 0 0; }
.notice { color: #d8cfc0; margin: 12px 0 0; font-size: 14px; }
</style>
