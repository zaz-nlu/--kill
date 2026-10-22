<script setup lang="ts">
import type { Item } from '../engine/types'

defineProps<{ items: Item[]; money: number; itemsLeft: number }>()
defineEmits<{ buy: [itemId: string]; leave: [] }>()
</script>

<template>
  <section class="shop glass">
    <h2>楼下超商</h2>
    <p>现金 ¥{{ money }}　这次还能拿 {{ itemsLeft }} 件</p>
    <div class="scroll" data-testid="scroll">
    <ul>
      <li v-for="i in items" :key="i.id">
        <span>{{ i.name }}　¥{{ i.price }}</span>
        <button type="button" :data-testid="'buy-' + i.id" :disabled="itemsLeft <= 0 || money < i.price" @click="$emit('buy', i.id)">
          买
        </button>
      </li>
    </ul>
    </div>
    <button type="button" class="leave" data-testid="leave-shop" @click="$emit('leave')">离开</button>
  </section>
</template>

<style scoped>
.shop { display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 14px 16px 12px; }
h2 { margin: 0 0 6px; flex: none; font-size: 19px; font-weight: 600; letter-spacing: 2px; }
p { margin: 0 0 10px; flex: none; color: #d9c7b4; font-size: 14px; }
.scroll { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding-right: 6px; }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
button { padding: 5px 18px; }
.leave { flex: none; margin-top: 10px; align-self: flex-start; }
</style>
