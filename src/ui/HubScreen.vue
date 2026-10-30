<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ActionDef } from '../engine/calendar'
import type { Item } from '../engine/types'
import GiftPicker from './GiftPicker.vue'

// `mealHour` is left undefined (not false) when absent, so the old callers keep reading the shop as the meal-hour signal.
const props = withDefaults(defineProps<{ actions: ActionDef[]; canShop: boolean; mealHour?: boolean; inventory: Record<string, number>; items: Item[]; slotsLeft?: number; restLabel?: string; urge?: string[] }>(), { mealHour: undefined })
const emit = defineEmits<{ action: [id: string, giftItemId?: string]; shop: []; wait: []; rest: []; save: [] }>()

const picking = ref<string | null>(null)              // action id whose gift picker is open
const chosenGift = reactive<Record<string, string>>({}) // action id -> item id

function pick(actionId: string, itemId: string) {
  chosenGift[actionId] = itemId
  picking.value = null
}

// Why the list is empty, and what you can do about it. You must never be left with only "go home".
const emptyHint = computed(() => {
  if (props.actions.length > 0) return ''
  if (props.mealHour ?? props.canShop) return '现在是饭点，没有要紧的事。可以下楼去超商买点东西，或者继续。'
  if ((props.slotsLeft ?? 1) > 0) return '这个时段没有能做的事。可以让这一个钟头过去，或者回家休息。'
  return '今天没有能做的事了，回家休息吧。'
})
// Moving on is offered at meal hours, and whenever the hour is empty but the day is not over.
const canWait = computed(() => (props.mealHour ?? props.canShop) || (props.actions.length === 0 && (props.slotsLeft ?? 1) > 0))

function run(actionId: string) {
  const gift = chosenGift[actionId]
  if (gift) emit('action', actionId, gift)
  else emit('action', actionId)
  delete chosenGift[actionId]
}
</script>

<template>
  <section class="hub glass">
    <header>
      <h2>接下来做什么？</h2>
      <span v-if="slotsLeft !== undefined" class="slots" data-testid="slots-left">今天还剩 {{ slotsLeft }} 个时段</span>
    </header>
    <div class="scroll" data-testid="scroll">
      <p v-if="emptyHint" class="empty" data-testid="empty-hint">{{ emptyHint }}</p>
      <ul>
        <li v-for="a in actions" :key="a.id">
          <div class="line">
            <button type="button" class="act" :class="{ 'has-gift': a.npc }" :data-testid="'action-' + a.id" :title="a.label" @click="run(a.id)">
              <span class="loc">{{ a.location }}</span>
              <span class="label">{{ a.label }}</span>
              <span class="cost">{{ a.costHours }} 小时</span>
            </button>
            <button
              v-if="a.npc"
              type="button"
              class="gift"
              :class="{ chosen: chosenGift[a.id], urge: urge?.includes(a.id) && !chosenGift[a.id] }"
              :data-testid="'gift-' + a.id"
              @click="picking = picking === a.id ? null : a.id"
            >送礼{{ chosenGift[a.id] ? '（已选）' : '' }}</button>
          </div>
          <GiftPicker v-if="a.npc && picking === a.id" :inventory="inventory" :items="items" @pick="pick(a.id, $event)" />
        </li>
      </ul>
    </div>
    <div class="bar">
      <button v-if="canShop" type="button" data-testid="go-shop" @click="emit('shop')">去超商</button>
      <button v-if="canWait" type="button" data-testid="wait" @click="emit('wait')">继续</button>
      <span class="grow" />
      <button type="button" data-testid="save" @click="emit('save')">存档</button>
      <button type="button" class="rest" data-testid="rest" @click="emit('rest')">{{ restLabel ?? '回家休息' }}</button>
    </div>
  </section>
</template>

<style scoped>
.hub { display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 14px 16px 12px; }
header { display: flex; justify-content: space-between; align-items: baseline; flex: none; margin-bottom: 10px; }
h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 2px; }
.slots { font-size: 13px; color: #d9c7b4; }
.empty { margin: 8px 2px 14px; color: #d9c7b4; line-height: 1.7; }
.scroll { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding-right: 6px; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 0 0 8px; }
.line { position: relative; }
.act { position: relative; width: 100%; min-width: 0; display: grid; grid-template-columns: 76px 1fr auto; align-items: center; gap: 14px; padding: 11px 16px; text-align: left; border-radius: 10px; overflow: hidden; }
.act.has-gift { padding-right: 104px; }
.act::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; transition: background 0.15s; }
.act:hover::before { background: var(--accent); }
.loc { padding: 2px 0; font-size: 12px; text-align: center; white-space: nowrap; border-radius: 999px; background: rgba(255, 255, 255, 0.1); color: #ecd3bb; }
.label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 16px; }
.cost { font-size: 12px; color: #bdb3a6; white-space: nowrap; }
.gift { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); padding: 3px 14px; font-size: 12px; border-radius: 999px; }
.gift.chosen { border-color: var(--accent); color: var(--accent); }
.gift.urge { border-color: #ff5a4f; color: #fff; background: #c8352c; animation: urge 1.2s ease-in-out infinite; }
@keyframes urge { 50% { box-shadow: 0 0 0 4px #ff5a4f55; } }
.bar { display: flex; gap: 8px; align-items: center; flex: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.grow { flex: 1; }
.rest { border-color: rgba(232, 160, 112, 0.6); }
</style>
