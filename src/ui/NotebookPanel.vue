<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MapPlace, NotebookEntry } from '../engine/types'
import type { NightPlan } from '../engine/notebook'
import CityMap from './CityMap.vue'

// Lin's notebook: what was written down, the plan worked out each night, and the map. The pages turn when a bookmark is tapped.
const props = defineProps<{
  entries: NotebookEntry[]; plans: NightPlan[]; places: MapPlace[]; counts: Record<string, number>; day: number
}>()
const emit = defineEmits<{ close: [] }>()

type Tab = 'notes' | 'plan' | 'map'
const tab = ref<Tab>('notes')
const flip = ref(0)
function go(t: Tab) {
  if (t === tab.value) return
  tab.value = t
  flip.value++
}

const days = computed(() => [...new Set(props.entries.map(e => e.day))].sort((a, b) => a - b))
const placeName = (id?: string) => props.places.find(p => p.id === id)?.label
const picked = ref<string | null>(null)
const pickedPlace = computed(() => props.places.find(p => p.id === picked.value))
const lastPlan = computed(() => props.plans[props.plans.length - 1])
</script>

<template>
  <div class="veil" data-testid="notebook" @click.self="emit('close')">
    <div class="book">
      <nav class="marks">
        <button type="button" :class="{ on: tab === 'notes' }" data-testid="nb-tab-notes" @click="go('notes')">记事</button>
        <button type="button" :class="{ on: tab === 'plan' }" data-testid="nb-tab-plan" @click="go('plan')">明天</button>
        <button type="button" :class="{ on: tab === 'map' }" data-testid="nb-tab-map" @click="go('map')">地图</button>
      </nav>
      <button type="button" class="close" data-testid="nb-close" @click="emit('close')">合上</button>
      <div :key="flip" class="pages">
        <section v-if="tab === 'notes'" class="spread" data-testid="nb-notes">
          <p v-if="entries.length === 0" class="blank">还什么都没记下。</p>
          <template v-for="d in days" :key="d">
            <h3>第 {{ d }} 天</h3>
            <p v-for="e in entries.filter(x => x.day === d)" :key="e.id" class="note" :data-testid="'note-' + e.id">
              {{ e.text }}<span v-if="placeName(e.place)" class="tag">{{ placeName(e.place) }}</span>
            </p>
          </template>
        </section>

        <section v-else-if="tab === 'plan'" class="spread" data-testid="nb-plan">
          <p v-if="!lastPlan" class="blank">今天还没到该想明天的时候。晚上 8 点以后，把今天的线索理一理。</p>
          <template v-for="p in plans.slice().reverse()" :key="p.day">
            <h3>{{ p.title }}</h3>
            <p v-for="(l, i) in p.lines" :key="i" class="note plan">
              {{ l.text }}<span v-if="placeName(l.place)" class="tag go">去 {{ placeName(l.place) }}</span>
            </p>
          </template>
        </section>

        <section v-else class="spread mapsheet" data-testid="nb-map">
          <CityMap :places="places" :counts="counts" :picked="picked" @pick="picked = $event" />
          <p class="note">
            <template v-if="pickedPlace">{{ pickedPlace.label }}：{{ (counts[pickedPlace.id] ?? 0) > 0 ? `现在有 ${counts[pickedPlace.id]} 件事可做。` : '现在没有要做的事。' }}</template>
            <template v-else>红点是现在有事可做的地方。要去，回到“接下来做什么？”，点右上角的地图。</template>
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #000a; }
.book { position: relative; width: min(860px, 96vw); height: min(560px, 88vh); padding: 22px 30px; color: #3a2c1c; background: linear-gradient(90deg, #e9dcc0 0, #f4ead2 49.4%, #cdbd9c 50%, #f4ead2 50.6%, #e9dcc0 100%); border: 6px solid #5a3b22; border-radius: 6px 14px 14px 6px; box-shadow: 0 14px 50px #000c, inset 0 0 40px #8a6a3a55; font-family: 'KaiTi', 'STKaiti', '楷体', serif; }
.marks { position: absolute; right: -52px; top: 40px; display: flex; flex-direction: column; gap: 8px; }
.marks button { width: 52px; padding: 10px 0; font-size: 15px; letter-spacing: 2px; color: #f3e6cf; background: #7a2f27; border: 0; border-radius: 0 8px 8px 0; cursor: pointer; opacity: 0.8; }
.marks button.on { opacity: 1; width: 60px; background: #a33a2f; }
.close { position: absolute; right: 14px; top: 8px; padding: 2px 12px; font-size: 13px; color: #5a3b22; background: transparent; border: 1px solid #5a3b22; border-radius: 999px; cursor: pointer; }
.pages { height: 100%; overflow-y: auto; animation: turn 0.35s ease-out; transform-origin: left center; }
@keyframes turn { from { opacity: 0.2; transform: perspective(900px) rotateY(-14deg); } }
.spread { column-count: 2; column-gap: 56px; column-rule: 1px dashed #a88f64; min-height: 100%; }
.spread.mapsheet { column-count: 1; }
h3 { margin: 0 0 8px; padding-bottom: 4px; font-size: 18px; letter-spacing: 3px; color: #7a2f27; border-bottom: 1px solid #b8a077; break-after: avoid; }
.note { margin: 0 0 10px; font-size: 16px; line-height: 1.75; break-inside: avoid; }
.note.plan::before { content: '▸ '; color: #7a2f27; }
.tag { margin-left: 8px; padding: 0 8px; font-size: 12px; color: #6a4a2a; background: #d8c8a0; border-radius: 999px; white-space: nowrap; }
.tag.go { color: #fff; background: #a33a2f; }
.blank { color: #8a7656; font-style: italic; }
@media (max-width: 700px) { .spread { column-count: 1; } .marks { right: -44px; } .marks button { width: 44px; } }
</style>
