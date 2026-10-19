<script setup lang="ts">
defineProps<{ failed: boolean }>()
defineEmits<{ restart: [] }>()
</script>

<template>
  <main class="end">
    <h2>{{ failed ? '说服力归零' : '切片到此结束' }}</h2>
    <p v-if="failed">黎默看着你，什么都没说。</p>
    <p v-else>感谢试玩。</p>
    <button type="button" data-testid="restart" @click="$emit('restart')">回到标题</button>
  </main>
</template>

<style scoped>
.end { margin-top: 20vh; text-align: center; color: #eee; }
button { margin-top: 20px; padding: 10px 30px; cursor: pointer; }
</style>
