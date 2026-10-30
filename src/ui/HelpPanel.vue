<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="veil" data-testid="help-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>操作说明</h3>
        <button type="button" data-testid="help-close" @click="emit('close')">关闭</button>
      </header>
      <ul>
        <li>每次行动会消耗 1 小时，时间走到夜里，这一天就快结束了。</li>
        <li>点击场景里的物件可以调查，可能发现证物或证词。</li>
        <li>证物栏里的证物，可以在对话中出示给对方。</li>
        <li>危险值高的时候，夜间行动可能遇袭，行动前先看一眼状态。</li>
        <li>走错了路也不要紧，顶部的“回溯”可以回到之前的时刻重新选择。</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(640px, 94vw); max-height: 88vh; overflow: auto; padding: 16px 18px; }
header { display: flex; justify-content: space-between; align-items: center; }
h3 { margin: 0; letter-spacing: 3px; }
ul { margin: 12px 2px 4px; padding-left: 1.2em; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.6; color: #d9c7b4; }
</style>
