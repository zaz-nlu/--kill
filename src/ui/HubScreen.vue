<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { ActionDef } from '../engine/calendar'
import type { Item } from '../engine/types'
import GiftPicker from './GiftPicker.vue'

defineProps<{ actions: ActionDef[]; canShop: boolean; inventory: Record<string, number>; items: Item[] }>()
const emit = defineEmits<{ action: [id: string, giftItemId?: string]; shop: []; wait: []; rest: []; save: [] }>()

const picking = ref<string | null>(null)              // action id whose gift picker is open
const chosenGift = reactive<Record<string, string>>({}) // action id -> item id

function pick(actionId: string, itemId: string) {
  chosenGift[actionId] = itemId
  picking.value = null
}

function run(actionId: string) {
  const gift = chosenGift[actionId]
  if (gift) emit('action', actionId, gift)
  else emit('action', actionId)
  delete chosenGift[actionId]
}
</script>

<template>
  <section class="hub">
    <h2>接下来做什么？</h2>
    <div class="scroll" data-testid="scroll">
    <ul>
      <li v-for="a in actions" :key="a.id">
        <button type="button" :data-testid="'action-' + a.id" @click="run(a.id)">{{ a.label }}</button>
        <template v-if="a.npc">
          <button type="button" class="gift" :data-testid="'gift-' + a.id" @click="picking = picking === a.id ? null : a.id">
            送礼{{ chosenGift[a.id] ? '（已选）' : '' }}
          </button>
          <GiftPicker v-if="picking === a.id" :inventory="inventory" :items="items" @pick="pick(a.id, $event)" />
        </template>
      </li>
    </ul>
    </div>
    <div class="bar">
      <button v-if="canShop" type="button" data-testid="go-shop" @click="emit('shop')">去超商</button>
      <button v-if="canShop" type="button" data-testid="wait" @click="emit('wait')">继续</button>
      <button type="button" data-testid="rest" @click="emit('rest')">回家休息</button>
      <button type="button" data-testid="save" @click="emit('save')">存档</button>
    </div>
  </section>
</template>

<style scoped>
.hub { display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 14px 18px; background: #141418; color: #eee; border: 2px solid #888; border-radius: 6px; }
h2 { margin: 0 0 8px; flex: none; }
.scroll { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding-right: 6px; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 8px 0; }
button { padding: 8px 14px; margin-right: 8px; cursor: pointer; }
.gift { font-size: 13px; }
.bar { flex: none; margin-top: 12px; padding-top: 10px; border-top: 1px solid #333; }
</style>
