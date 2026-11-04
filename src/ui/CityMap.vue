<script setup lang="ts">
import type { MapPlace } from '../engine/types'

// A schematic of the Haihe river and the places the story visits. A place lights up when something can be done there;
// greyed ones are only on the map for now. Which place is picked is the parent's business.
defineProps<{ places: MapPlace[]; counts: Record<string, number>; picked: string | null }>()
const emit = defineEmits<{ pick: [id: string | null] }>()
</script>

<template>
  <svg class="map" viewBox="0 0 640 300" role="group" aria-label="海河沿岸地图" data-testid="city-map">
    <rect width="640" height="300" rx="12" class="land" />
    <!-- blocks -->
    <g class="blocks">
      <rect x="20" y="20" width="120" height="70" rx="4" /><rect x="150" y="20" width="90" height="50" rx="4" />
      <rect x="20" y="110" width="90" height="60" rx="4" /><rect x="330" y="10" width="110" height="60" rx="4" />
      <rect x="460" y="20" width="160" height="60" rx="4" /><rect x="500" y="200" width="120" height="80" rx="4" />
      <rect x="20" y="210" width="130" height="70" rx="4" /><rect x="190" y="230" width="90" height="55" rx="4" />
      <rect x="420" y="150" width="70" height="60" rx="4" />
    </g>
    <!-- the river -->
    <path class="river" d="M-10 215 C 90 205, 150 150, 250 140 S 400 160, 470 110 S 580 40, 650 55" />
    <path class="riverline" d="M-10 215 C 90 205, 150 150, 250 140 S 400 160, 470 110 S 580 40, 650 55" />
    <text x="262" y="132" class="water">海 河</text>
    <!-- Jiefang bridge -->
    <g class="bridge"><path d="M338 134 L352 168" /><path d="M350 130 L364 164" /></g>
    <text x="368" y="190" class="note">解放桥</text>

    <g
      v-for="p in places"
      :key="p.id"
      class="place"
      :class="{ live: (counts[p.id] ?? 0) > 0, on: picked === p.id }"
      tabindex="0"
      role="button"
      :aria-label="p.label"
      :data-testid="'place-' + p.id"
      @click="emit('pick', picked === p.id ? null : p.id)"
      @keydown.enter="emit('pick', picked === p.id ? null : p.id)"
    >
      <circle :cx="p.x" :cy="p.y" r="17" class="pin" />
      <text :x="p.x" :y="p.y + 6" class="icon">{{ p.icon }}</text>
      <text :x="p.x" :y="p.y + 34" class="name">{{ p.label }}</text>
      <g v-if="(counts[p.id] ?? 0) > 0">
        <circle :cx="p.x + 14" :cy="p.y - 14" r="9" class="badge" />
        <text :x="p.x + 14" :y="p.y - 10" class="num">{{ counts[p.id] }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.map { display: block; width: 100%; max-height: 250px; }
.land { fill: #2a2622; stroke: rgba(255, 255, 255, 0.14); }
.blocks rect { fill: #35302a; }
.river { fill: none; stroke: #2f4a5e; stroke-width: 34; stroke-linecap: round; opacity: 0.85; }
.riverline { fill: none; stroke: #4d7691; stroke-width: 1.5; stroke-dasharray: 3 7; opacity: 0.7; }
.water { fill: #7fa6c0; font-size: 14px; letter-spacing: 6px; opacity: 0.85; }
.bridge path { stroke: #8d8578; stroke-width: 3; fill: none; }
.note { fill: #8d8578; font-size: 11px; }
.place { cursor: pointer; outline: none; }
.pin { fill: #3b352e; stroke: #6c6358; stroke-width: 2; transition: all 0.15s; }
.icon { text-anchor: middle; font-size: 17px; }
.name { text-anchor: middle; font-size: 13px; fill: #9a9185; paint-order: stroke; stroke: #1c1916; stroke-width: 3px; }
.place.live .pin { fill: #5b3f2b; stroke: var(--accent, #e8a070); }
.place.live .name { fill: #f1ece4; }
.place:hover .pin, .place:focus-visible .pin { stroke: #fff; }
.place.on .pin { fill: var(--accent, #e8a070); stroke: #fff; }
.badge { fill: #c8352c; stroke: #1c1916; stroke-width: 1.5; }
.num { text-anchor: middle; font-size: 11px; fill: #fff; font-weight: 700; }
</style>
