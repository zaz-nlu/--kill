<script setup lang="ts">
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div class="rotate" data-testid="rotate-hint">
    <div class="box glass">
      <div class="icon" aria-hidden="true">⟳</div>
      <p class="head">请把手机横过来玩</p>
      <p class="tip">画面是横版的，竖着拿会被裁掉一部分，调查场景里有些东西会看不到。</p>
      <button type="button" data-testid="rotate-dismiss" @click="$emit('dismiss')">就这样玩</button>
    </div>
  </div>
</template>

<style scoped>
.rotate { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8, 9, 14, 0.82); backdrop-filter: blur(6px); }
.box { max-width: 320px; padding: 26px 24px 22px; text-align: center; }
.icon { font-size: 54px; line-height: 1; color: var(--accent); animation: turn 2.4s ease-in-out infinite; }
.head { margin: 12px 0 6px; font-size: 20px; font-weight: 600; letter-spacing: 2px; }
.tip { margin: 0 0 18px; font-size: 14px; line-height: 1.7; color: #d9c7b4; }
@keyframes turn { 0%, 30% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
</style>
