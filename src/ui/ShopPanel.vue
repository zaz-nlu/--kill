<script setup lang="ts">
import type { Item } from '../engine/types'

defineProps<{ items: Item[]; money: number; itemsLeft: number }>()
defineEmits<{ buy: [itemId: string]; leave: [] }>()
</script>

<template>
  <section class="shop">
    <h2>楼下超商</h2>
    <p>现金 ¥{{ money }}　这次还能拿 {{ itemsLeft }} 件</p>
    <ul>
      <li v-for="i in items" :key="i.id">
        <span>{{ i.name }}　¥{{ i.price }}</span>
        <button type="button" :data-testid="'buy-' + i.id" :disabled="itemsLeft <= 0 || money < i.price" @click="$emit('buy', i.id)">
          买
        </button>
      </li>
    </ul>
    <button type="button" data-testid="leave-shop" @click="$emit('leave')">离开</button>
  </section>
</template>

<style scoped>
.shop { margin: 12px; padding: 14px 18px; background: #141418; color: #eee; border: 2px solid #888; border-radius: 6px; }
ul { list-style: none; padding: 0; }
li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #2a2a2a; }
button { padding: 4px 14px; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
