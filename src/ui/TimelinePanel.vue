<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimelineRow } from '../engine/timeline'

const props = defineProps<{ rows: TimelineRow[] }>()
const emit = defineEmits<{ rewind: [id: number]; close: [] }>()

const selected = ref<number | null>(null)
const hasBranches = computed(() => props.rows.some(r => r.depth > 0))

function when(r: TimelineRow): string {
  return `第 ${r.day} 天 ${String(r.hour).padStart(2, '0')}:00`
}

function pick(r: TimelineRow) {
  selected.value = selected.value === r.id ? null : r.id
}
</script>

<template>
  <div class="veil" data-testid="timeline-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>回溯</h3>
        <button type="button" data-testid="timeline-close" @click="emit('close')">关闭</button>
      </header>
      <p class="tip">选一个时刻，回到那里重新做决定。原来的路线不会丢，会变成一条分支。</p>
      <ol>
        <li v-for="r in rows" :key="r.id" :style="{ marginLeft: r.depth * 22 + 'px' }" :class="{ branch: r.depth > 0 }">
          <button
            type="button" class="node"
            :class="{ path: r.onPath, head: r.isHead, choice: r.kind === 'choice', open: selected === r.id }"
            :data-testid="'node-' + r.id" @click="pick(r)"
          >
            <span class="when">{{ when(r) }}</span>
            <span class="what"><i v-if="r.kind === 'choice'" class="mark">选择</i>{{ r.label }}</span>
            <span v-if="r.isHead" class="here">当前</span>
            <span v-else-if="r.forks" class="here fork">有分支</span>
          </button>
          <div v-if="selected === r.id" class="ask">
            <span v-if="r.isHead">你就在这里。</span>
            <button v-else type="button" class="go" :data-testid="'go-' + r.id" @click="emit('rewind', r.id)">回到这里</button>
          </div>
        </li>
      </ol>
      <p v-if="hasBranches" class="tip">缩进的是分支：从上一条没缩进的点岔出去的另一种选择。</p>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(640px, 94vw); max-height: 88vh; overflow: auto; padding: 16px 18px; }
header { display: flex; justify-content: space-between; align-items: center; }
h3 { margin: 0; letter-spacing: 3px; }
.tip { margin: 8px 2px 12px; font-size: 13px; color: #b9ad9d; }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li.branch { border-left: 2px solid #e8a07066; padding-left: 8px; }
.node { width: 100%; display: flex; gap: 12px; align-items: baseline; text-align: left; padding: 6px 12px; background: rgba(255, 255, 255, 0.04); border-color: transparent; }
.node.path { background: rgba(232, 160, 112, 0.14); }
.node.head { border-color: var(--accent); }
.node.open { border-color: #fff; }
.when { min-width: 96px; font-size: 13px; color: #d9c7b4; }
.what { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mark { font-style: normal; font-size: 11px; margin-right: 6px; padding: 1px 6px; border-radius: 8px; background: var(--accent-2); color: #fff; }
.here { font-size: 12px; color: var(--accent); }
.here.fork { color: #9fc4ff; }
.ask { display: flex; justify-content: flex-end; padding: 6px 4px 2px; color: #b9ad9d; font-size: 13px; }
.go { background: var(--accent-2); border-color: var(--accent-2); }
</style>
