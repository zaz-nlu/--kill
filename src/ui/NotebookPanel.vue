<script setup lang="ts">
import { computed, ref } from 'vue'
import { resolveEvidenceImage } from '../engine/evidenceArt'
import type { MapPlace, NotebookEntry } from '../engine/types'
import type { NightPlan } from '../engine/notebook'
import CityMap from './CityMap.vue'

// Lin's notebook, laid out like a scrapbook: one day at a time, each line of handwriting with the picture of the clue it
// rests on taped beside it (one picture per line, so the page never turns into a pile). Tap a picture to see it full size.
// What the pictures are is looked up in `records`; `held` says which clues the player has.
interface Rec { name: string; desc: string }
const props = defineProps<{
  entries: NotebookEntry[]; plans: NightPlan[]; places: MapPlace[]; counts: Record<string, number>
  records: Record<string, Rec>; held: ReadonlySet<string>
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
const chosenDay = ref<number | null>(null)
const day = computed(() => (chosenDay.value && days.value.includes(chosenDay.value) ? chosenDay.value : days.value[days.value.length - 1] ?? 1))
function goDay(d: number) {
  chosenDay.value = d
  flip.value++
}
const todays = computed(() => props.entries.filter(e => e.day === day.value))

const placeName = (id?: string) => props.places.find(p => p.id === id)?.label
const isTestimony = (id: string) => id.includes('T')

// The clues a line rests on that the player holds: the first one is shown as the picture, the rest as a small "+n".
const heldOf = (ids: string[]) => ids.filter(id => props.held.has(id))
function cover(ids: string[]): string | null {
  const own = heldOf(ids)
  return own.find(id => !isTestimony(id)) ?? own[0] ?? null
}
const thumb = (id: string) => resolveEvidenceImage(id)
const tilt = (i: number) => `${[-2.4, 1.6, -1, 2.2, -1.8][i % 5]}deg`

const lightbox = ref<string | null>(null)
const boxRec = computed(() => (lightbox.value ? props.records[lightbox.value] : null))

const picked = ref<string | null>(null)
const pickedPlace = computed(() => props.places.find(p => p.id === picked.value))
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
        <!-- notes: a day at a time -->
        <section v-if="tab === 'notes'" class="sheet" data-testid="nb-notes">
          <div v-if="days.length" class="days">
            <button v-for="d in days" :key="d" type="button" :class="{ on: d === day }" :data-testid="'nb-day-' + d" @click="goDay(d)">第 {{ d }} 天</button>
            <span class="count">{{ todays.length }} 条</span>
          </div>
          <p v-if="entries.length === 0" class="blank">还什么都没记下。</p>
          <ol class="spread">
            <li v-for="(e, i) in todays" :key="e.id" class="note" :data-testid="'note-' + e.id">
              <button v-if="cover(e.any)" type="button" class="photo" :class="{ slip: isTestimony(cover(e.any)!) || !thumb(cover(e.any)!) }" :style="{ '--tilt': tilt(i) }" :data-testid="'photo-' + e.id" @click="lightbox = cover(e.any)">
                <img v-if="thumb(cover(e.any)!)" :src="thumb(cover(e.any)!)!" alt="">
                <span v-else class="slip-text">{{ isTestimony(cover(e.any)!) ? '证言' : '记录' }}</span>
                <i v-if="heldOf(e.any).length > 1" class="more">+{{ heldOf(e.any).length - 1 }}</i>
              </button>
              <p class="text">{{ e.text }}<span v-if="placeName(e.place)" class="tag">{{ placeName(e.place) }}</span></p>
            </li>
          </ol>
        </section>

        <!-- tomorrow: worked out from what is held -->
        <section v-else-if="tab === 'plan'" class="sheet" data-testid="nb-plan">
          <p v-if="plans.length === 0" class="blank">今天还没到该想明天的时候。晚上 8 点以后，把今天的线索理一理。</p>
          <article v-for="p in plans.slice().reverse()" :key="p.day" class="night">
            <h3>{{ p.title }}</h3>
            <ul>
              <li v-for="(l, i) in p.lines" :key="i" class="plan">
                <p class="text">{{ l.text }}<span v-if="placeName(l.place)" class="tag go">去 {{ placeName(l.place) }}</span></p>
                <span v-if="l.needs?.length" class="basis">
                  <button v-for="id in l.needs.slice(0, 3)" :key="id" type="button" class="mini" :title="records[id]?.name" @click="lightbox = id">
                    <img v-if="thumb(id)" :src="thumb(id)!" alt=""><b v-else>证</b>
                  </button>
                </span>
              </li>
            </ul>
          </article>
        </section>

        <section v-else class="sheet mapsheet" data-testid="nb-map">
          <CityMap :places="places" :counts="counts" :picked="picked" @pick="picked = $event" />
          <p class="text">
            <template v-if="pickedPlace">{{ pickedPlace.label }}：{{ (counts[pickedPlace.id] ?? 0) > 0 ? `现在有 ${counts[pickedPlace.id]} 件事可做。` : '现在没有要做的事。' }}</template>
            <template v-else>红点是现在有事可做的地方。要去，回到“接下来做什么？”，点右上角的地图。</template>
          </p>
        </section>
      </div>

      <div v-if="lightbox && boxRec" class="lightbox" data-testid="nb-lightbox" @click.self="lightbox = null">
        <figure>
          <img v-if="thumb(lightbox)" :src="thumb(lightbox)!" :alt="boxRec.name">
          <figcaption>
            <b>{{ boxRec.name }}</b>
            <span>{{ boxRec.desc }}</span>
          </figcaption>
          <button type="button" data-testid="nb-lightbox-close" @click="lightbox = null">收起</button>
        </figure>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: radial-gradient(#0008, #000d); }
.book { position: relative; width: min(900px, 94vw); height: min(580px, 88vh); padding: 26px 34px 22px; color: #3a2c1c; font-family: 'KaiTi', 'STKaiti', '楷体', serif;
  background:
    linear-gradient(90deg, #0002 0, transparent 3%, transparent 47%, #0003 49.6%, #fff3 50%, #0002 50.4%, transparent 53%, transparent 97%, #0002 100%),
    repeating-linear-gradient(transparent 0 29px, #b59d6e40 29px 30px),
    #f1e6cb;
  border: 7px solid #4b2f1b; border-radius: 6px 16px 16px 6px; box-shadow: 0 18px 60px #000d, inset 0 0 50px #7a5a2c55; }
.book::before { content: ''; position: absolute; left: -7px; top: 18px; bottom: 18px; width: 12px; background: repeating-linear-gradient(#2a1a0e 0 8px, transparent 8px 22px); border-radius: 4px; opacity: 0.55; }

.marks { position: absolute; right: -58px; top: 46px; display: flex; flex-direction: column; gap: 8px; }
.marks button { width: 56px; padding: 11px 0; font-size: 15px; letter-spacing: 3px; color: #f3e6cf; background: #7a2f27; border: 0; border-radius: 0 9px 9px 0; box-shadow: 2px 2px 6px #0006; cursor: pointer; opacity: 0.82; transition: all 0.15s; }
.marks button:hover { opacity: 1; }
.marks button.on { width: 66px; opacity: 1; background: #a8392c; }
.close { position: absolute; right: 16px; top: 8px; padding: 2px 12px; font-size: 13px; color: #5a3b22; background: transparent; border: 1px solid #5a3b22; border-radius: 999px; cursor: pointer; }

.pages { height: 100%; overflow-y: auto; padding-right: 4px; animation: turn 0.4s ease-out; transform-origin: left center; }
@keyframes turn { from { opacity: 0.15; transform: perspective(1000px) rotateY(-16deg); } }
.sheet { min-height: 100%; }

.days { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
.days button { padding: 3px 14px; font-size: 14px; color: #6a4a2a; background: #e0cfa6; border: 1px solid #b8a077; border-radius: 999px 999px 0 0; cursor: pointer; }
.days button.on { color: #fff; background: #7a2f27; border-color: #7a2f27; }
.count { margin-left: auto; margin-right: 70px; font-size: 13px; color: #8a7656; }

.spread { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 60px; column-rule: 1px dashed #a88f64; }
.note { display: flex; gap: 14px; align-items: flex-start; margin: 0 0 18px; break-inside: avoid; }
.text { margin: 0; font-size: 16px; line-height: 1.75; }

/* a Polaroid taped to the page */
.photo { position: relative; flex: none; width: 76px; padding: 5px 5px 14px; background: #fffdf6; border: 0; box-shadow: 1px 3px 8px #0005; transform: rotate(var(--tilt)); cursor: zoom-in; transition: transform 0.15s; }
.photo:hover { transform: rotate(0) scale(1.08); z-index: 2; }
.photo::before { content: ''; position: absolute; left: 50%; top: -9px; width: 34px; height: 14px; margin-left: -17px; background: #e8d27a99; transform: rotate(-4deg); }
.photo img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #222; }
.photo.slip { background: #f6efd8; }
.slip-text { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; font-size: 16px; letter-spacing: 3px; color: #7a2f27; border: 1px dashed #b8a077; }
.more { position: absolute; right: -6px; bottom: -6px; padding: 0 6px; font-size: 11px; font-style: normal; color: #fff; background: #a8392c; border-radius: 999px; }

.tag { margin-left: 8px; padding: 0 8px; font-size: 12px; color: #6a4a2a; background: #d8c8a0; border-radius: 999px; white-space: nowrap; }
.tag.go { color: #fff; background: #a8392c; }
.blank { color: #8a7656; font-style: italic; }

.night { margin-bottom: 14px; }
.night h3 { margin: 0 0 10px; padding-bottom: 3px; font-size: 19px; letter-spacing: 4px; color: #7a2f27; border-bottom: 2px solid #a8392c; }
.night ul { list-style: none; margin: 0; padding: 0; column-count: 2; column-gap: 60px; column-rule: 1px dashed #a88f64; }
.plan { margin: 0 0 14px; break-inside: avoid; }
.plan .text::before { content: '▸ '; color: #a8392c; }
.basis { display: flex; gap: 6px; margin-top: 4px; padding-left: 16px; }
.mini { width: 30px; height: 30px; padding: 2px; background: #fffdf6; border: 0; box-shadow: 1px 2px 4px #0005; cursor: zoom-in; }
.mini img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mini b { font-size: 12px; color: #7a2f27; }

.mapsheet .text { margin-top: 10px; }

.lightbox { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: #1a120acc; border-radius: inherit; }
.lightbox figure { display: flex; flex-direction: column; gap: 8px; align-items: center; max-width: 82%; max-height: 92%; margin: 0; padding: 10px 10px 12px; background: #fffdf6; box-shadow: 0 8px 30px #000a; transform: rotate(-1deg); }
.lightbox img { max-width: 100%; max-height: 52vh; object-fit: contain; }
.lightbox figcaption { display: flex; flex-direction: column; gap: 4px; max-width: 520px; font-size: 14px; line-height: 1.6; text-align: left; overflow-y: auto; }
.lightbox figcaption b { font-size: 16px; color: #7a2f27; }
.lightbox button { padding: 3px 18px; font-size: 13px; color: #5a3b22; background: transparent; border: 1px solid #5a3b22; border-radius: 999px; cursor: pointer; }

@media (max-width: 700px) {
  .book { padding: 22px 16px 16px; }
  .spread, .night ul { column-count: 1; }
  .marks { right: -46px; }
  .marks button { width: 44px; }
  .marks button.on { width: 50px; }
  .count { display: none; }
}
</style>
