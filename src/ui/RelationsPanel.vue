<script setup lang="ts">
interface Row { id: string; name: string; kind: 'affinity' | 'trust'; tier: string; label: string; fill: number }

defineProps<{ rows: Row[] }>()
</script>

<template>
  <aside class="relations">
    <h3>人物关系</h3>
    <p v-if="rows.length === 0" class="empty">还没有认识的人。</p>
    <ul v-else class="scroll" data-testid="scroll">
      <li v-for="r in rows" :key="r.id" :data-testid="'relation-' + r.id" :class="[r.kind, r.tier]">
        <span class="name">{{ r.name }}<small>{{ r.kind === 'trust' ? '（信任）' : '' }}</small></span>
        <span class="bar"><i :style="{ width: r.fill + '%' }" /></span>
        <span class="label">{{ r.label }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.relations { position: fixed; top: 44px; right: 12px; z-index: 20; display: flex; flex-direction: column; width: min(380px, 92vw); max-height: 70vh; padding: 10px 14px; background: #181818ee; color: #ddd; border: 1px solid #555; border-radius: 6px; }
h3 { margin: 0 0 8px; font-size: 15px; flex: none; }
.empty { margin: 0; color: #999; }
.scroll { list-style: none; margin: 0; padding: 0 6px 0 0; overflow-y: auto; min-height: 0; }
li { display: grid; grid-template-columns: 96px 1fr 60px; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #2a2a2a; }
.name small { color: #999; }
.bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; background: #6aa86a; }
.closed .bar i, .low .bar i { background: #b5503c; }
.guarded .bar i, .mid .bar i { background: #c9a24a; }
.label { text-align: right; color: #e8a070; }
</style>
