<script setup lang="ts">
interface Row { id: string; name: string; kind: 'affinity' | 'trust'; tier: string; label: string; fill: number }

defineProps<{ rows: Row[] }>()
</script>

<template>
  <aside class="relations glass">
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
.relations { position: fixed; top: 48px; right: 12px; z-index: 20; display: flex; flex-direction: column; width: min(400px, 92vw); max-height: 70vh; padding: 12px 16px; color: #e6e0d6; }
h3 { margin: 0 0 8px; font-size: 15px; flex: none; letter-spacing: 2px; }
.empty { margin: 0; color: #a99f92; }
.scroll { list-style: none; margin: 0; padding: 0 6px 0 0; overflow-y: auto; min-height: 0; }
li { display: grid; grid-template-columns: 100px 1fr 64px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.name small { color: #a99f92; }
.bar { height: 6px; background: rgba(255, 255, 255, 0.12); border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; background: #6aa86a; border-radius: 3px; }
.closed .bar i, .low .bar i { background: #c0563f; }
.guarded .bar i, .mid .bar i { background: #d1a84d; }
.label { text-align: right; color: var(--accent); }
</style>
