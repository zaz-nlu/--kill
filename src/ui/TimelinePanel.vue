<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { TimelineRow } from '../engine/timeline'
import type { CalendarDay } from '../engine/types'
import { DEFAULT_CHAPTER } from '../engine/state'

const props = withDefaults(defineProps<{
  rows: TimelineRow[]
  chapterTitle?: string
  calendar?: CalendarDay[]
}>(), { chapterTitle: '', calendar: () => DEFAULT_CHAPTER.calendar })
const emit = defineEmits<{ rewind: [id: number]; close: [] }>()

// Only the chapter being played is drawn here; its day names and dates come from the chapter's own calendar.
const title = computed(() => (props.chapterTitle ? `回溯 · ${props.chapterTitle}` : '回溯'))

function dayOf(key: number): CalendarDay | null {
  return key === 0 ? null : props.calendar[key - 1] ?? null
}

// Rows written before the tree panel (or hand-built in a test) may not carry a parent: read the list as one line.
const rows = computed<TimelineRow[]>(() =>
  props.rows.map((r, i) => ({
    ...r,
    parent: r.parent === undefined ? (i > 0 ? props.rows[i - 1].id : null) : r.parent,
  })),
)

const keyOf = (r: TimelineRow): number => (r.kind === 'start' ? 0 : r.day)

interface Chapter {
  key: number
  title: string
  sub: string
  rows: TimelineRow[]
  current: boolean
  branched: boolean
}

const chapters = computed<Chapter[]>(() => {
  const groups = new Map<number, TimelineRow[]>()
  for (const r of rows.value) {
    const k = keyOf(r)
    const list = groups.get(k) ?? []
    list.push(r)
    groups.set(k, list)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => ({
      key,
      title: key === 0 ? '序章' : dayOf(key)?.label ?? `第 ${key} 天`,
      sub: key === 0 ? '' : dayOf(key)?.date ?? '',
      rows: list,
      current: list.some(r => r.isHead),
      branched: list.some(r => r.forks),
    }))
})

const currentKey = computed(() => {
  const head = rows.value.find(r => r.isHead)
  if (head) return keyOf(head)
  return chapters.value.length > 0 ? chapters.value[chapters.value.length - 1].key : 0
})

const pickedChapter = ref<number | null>(null)
const selected = ref<number | null>(null)
const activeKey = computed(() =>
  pickedChapter.value !== null && chapters.value.some(c => c.key === pickedChapter.value)
    ? pickedChapter.value
    : currentKey.value,
)
const activeChapter = computed(() => chapters.value.find(c => c.key === activeKey.value) ?? null)

function chooseChapter(key: number) {
  pickedChapter.value = key
  selected.value = null
}

// One column per step along the branch, one row per lane: the first child keeps its parent's lane, later children
// open a new one, and a chapter can be entered from several points (each gets its own lane).
const STEP_X = 72
const STEP_Y = 64
const PAD_X = 44
const PAD_Y = 36

interface Placed {
  row: TimelineRow
  x: number
  y: number
  lane: number
  level: number
  entry: boolean
}

const placed = computed<Placed[]>(() => {
  const list = activeChapter.value?.rows ?? []
  const inChapter = new Set(list.map(r => r.id))
  const level = new Map<number, number>()
  const lane = new Map<number, number>()
  const kids = new Map<number, number>()
  let nextLane = 0
  const out: Placed[] = []
  for (const r of list) {
    const p = r.parent ?? null
    let entry = true
    if (p !== null && inChapter.has(p)) {
      entry = false
      level.set(r.id, (level.get(p) ?? 0) + 1)
      const n = kids.get(p) ?? 0
      kids.set(p, n + 1)
      lane.set(r.id, n === 0 ? (lane.get(p) ?? 0) : nextLane++)
    } else {
      level.set(r.id, 0)
      lane.set(r.id, nextLane++)
    }
    const lv = level.get(r.id) ?? 0
    const ln = lane.get(r.id) ?? 0
    out.push({ row: r, x: PAD_X + lv * STEP_X, y: PAD_Y + ln * STEP_Y, lane: ln, level: lv, entry })
  }
  return out
})

const edges = computed(() => {
  const byId = new Map(placed.value.map(p => [p.row.id, p]))
  const out: { key: string; d: string; onPath: boolean }[] = []
  for (const to of placed.value) {
    const parent = to.row.parent
    if (parent === null || parent === undefined) continue
    const from = byId.get(parent)
    if (!from) continue
    const mid = (from.x + to.x) / 2
    out.push({
      key: `${parent}-${to.row.id}`,
      d: `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`,
      onPath: to.row.onPath,
    })
  }
  return out
})

const size = computed(() => {
  const maxLevel = placed.value.reduce((m, p) => Math.max(m, p.level), 0)
  const maxLane = placed.value.reduce((m, p) => Math.max(m, p.lane), 0)
  return {
    width: Math.max(280, PAD_X + maxLevel * STEP_X + 64),
    height: Math.max(140, PAD_Y + maxLane * STEP_Y + 52),
  }
})

const selectedRow = computed(() => rows.value.find(r => r.id === selected.value) ?? null)

function pick(r: TimelineRow) {
  pickedChapter.value = keyOf(r)
  selected.value = selected.value === r.id ? null : r.id
}

function when(r: TimelineRow | null): string {
  if (!r) return ''
  return `第 ${r.day} 天 ${String(r.hour).padStart(2, '0')}:00`
}

function hh(r: TimelineRow): string {
  return `${String(r.hour).padStart(2, '0')}:00`
}

function stateText(r: TimelineRow | null): string {
  if (!r) return ''
  return r.isHead ? '当前' : r.onPath ? '主线' : '分支'
}

// Open on where you are: scroll the chart so the current node sits in the middle.
// A run that began from a loaded save (one without a saved branch history) has no root of its own before that point.
const fromSave = computed(() => props.rows.length > 0 && props.rows[0].kind !== 'start')
const scroller = ref<HTMLElement | null>(null)
function centerOnHead() {
  const el = scroller.value
  if (!el) return
  const head = placed.value.find(p => p.row.isHead)
  el.scrollLeft = head ? Math.max(0, head.x - (el.clientWidth || 0) / 2) : 0
}
onMounted(() => { nextTick(centerOnHead) })
watch(activeKey, () => { nextTick(centerOnHead) })
</script>

<template>
  <div class="veil" data-testid="timeline-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>{{ title }}</h3>
        <button type="button" data-testid="timeline-close" @click="emit('close')">关闭</button>
      </header>
      <p class="scope" data-testid="timeline-scope">这里只显示本章的选择，其他章节请在章节选择里回溯。</p>

      <p v-if="fromSave" class="tip" data-testid="timeline-from-save">这一局是从存档读取的：读档之前的经过没有记录，只能回到读档之后的时刻。</p>
      <div class="chapters" role="tablist">
        <button
          v-for="c in chapters" :key="c.key" type="button" role="tab"
          class="chapter" :class="{ on: c.key === activeKey }" :aria-selected="c.key === activeKey"
          :data-testid="'chapter-' + c.key" @click="chooseChapter(c.key)"
        >
          <span class="name">{{ c.title }}</span>
          <span v-if="c.sub" class="sub">{{ c.sub }}</span>
          <i v-if="c.current" class="dot" title="你现在在这章" />
          <svg v-if="c.branched" class="fork" viewBox="0 0 12 12" aria-label="有分支">
            <path d="M3 2v8M3 6h3a3 3 0 0 0 3-3V2" />
          </svg>
        </button>
      </div>

      <div ref="scroller" class="chart">
        <svg
          v-if="placed.length > 0" class="tree"
          :width="size.width" :height="size.height" :viewBox="`0 0 ${size.width} ${size.height}`"
        >
          <line
            v-for="p in placed.filter(p => p.entry && p.row.parent !== null && p.row.parent !== undefined)"
            :key="'entry-' + p.row.id" class="from-before"
            :x1="p.x - 20" :x2="p.x - 7" :y1="p.y" :y2="p.y"
          />
          <path v-for="e in edges" :key="e.key" class="edge" :class="{ main: e.onPath }" :d="e.d" />
          <g
            v-for="p in placed" :key="p.row.id" class="node"
            :class="{ dim: !p.row.onPath, head: p.row.isHead, choice: p.row.kind === 'choice', start: p.row.kind === 'start' }"
            :data-testid="'node-' + p.row.id" :data-lane="p.lane" :data-chapter="activeKey"
            :transform="`translate(${p.x} ${p.y})`" @click="pick(p.row)"
          >
            <circle v-if="p.row.isHead" class="halo" r="15" />
            <circle v-if="p.row.kind === 'start'" class="shape" r="10" />
            <circle v-else-if="p.row.kind === 'hub'" class="shape" r="6" />
            <rect v-else class="shape" x="-6" y="-6" width="12" height="12" transform="rotate(45)" />
            <text v-if="p.row.kind === 'choice'" class="cap" y="-14">选择</text>
            <text class="time" y="24">{{ hh(p.row) }}</text>
            <text v-if="p.row.isHead" class="cap head-cap" y="38">当前</text>
          </g>
        </svg>
        <p v-else class="empty">这一章还没有记录。</p>
      </div>

      <div class="detail" data-testid="timeline-detail">
        <template v-if="selectedRow">
          <div class="detail-line">
            <span class="when">{{ when(selectedRow) }}</span>
            <span class="state" :class="{ here: selectedRow?.isHead, main: !selectedRow?.isHead && selectedRow?.onPath }">{{ stateText(selectedRow) }}</span>
            <span v-if="selectedRow?.forks" class="fork-hint">有分支</span>
          </div>
          <div class="detail-label"><i v-if="selectedRow?.kind === 'choice'" class="mark">选择</i>{{ selectedRow?.label }}</div>
          <div class="detail-go">
            <span v-if="selectedRow?.isHead" class="here">你就在这里。</span>
            <button v-else type="button" class="go" :data-testid="'go-' + selectedRow?.id" @click="selectedRow && emit('rewind', selectedRow.id)">回到这里</button>
          </div>
        </template>
        <p v-else class="hint">点一个节点，看看那时发生了什么，再决定要不要回去。</p>
      </div>

    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(920px, 96vw); height: min(580px, 88vh); display: flex; flex-direction: column; padding: 16px 18px; overflow: hidden; }
header { display: flex; justify-content: space-between; align-items: center; flex: none; }
h3 { margin: 0; letter-spacing: 3px; }

.tip { margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #d9c7b4; flex: none; }
.scope { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #b9ad9d; flex: none; }
.chapters { display: flex; gap: 8px; padding: 10px 0 12px; flex: none; overflow-x: auto; }
.chapter { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; white-space: nowrap; background: rgba(255, 255, 255, 0.04); border-color: transparent; }
.chapter .sub { font-size: 11px; color: #b9ad9d; }
.chapter .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 6px var(--accent); }
.chapter .fork { width: 12px; height: 12px; fill: none; stroke: #9fc4ff; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.chapter.on { background: rgba(232, 160, 112, 0.18); border-color: var(--accent); }

.chart { flex: 1; min-height: 0; overflow: auto; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; background: rgba(0, 0, 0, 0.18); }
.tree { display: block; }
.empty { margin: 18px; font-size: 13px; color: #b9ad9d; }
.edge { fill: none; stroke: #5a5a66; stroke-width: 1.4; stroke-dasharray: 4 4; }
.edge.main { stroke: var(--accent); stroke-width: 2.4; stroke-dasharray: none; }
.from-before { stroke: #5a5a66; stroke-width: 1.4; stroke-dasharray: 2 3; }
.node { cursor: pointer; }
.node.dim { opacity: 0.45; }
.node .shape { fill: #2a2d38; stroke: #b9ad9d; stroke-width: 1.6; transition: fill 0.15s; }
.node.start .shape { fill: rgba(232, 160, 112, 0.18); stroke: var(--accent); }
.node.choice .shape { stroke: #9fc4ff; }
.node.head .shape { fill: rgba(232, 160, 112, 0.28); stroke: var(--accent); }
.node .halo { fill: none; stroke: var(--accent); stroke-width: 1.5; animation: pulse 1.8s ease-in-out infinite; }
.node:hover .shape { fill: rgba(232, 160, 112, 0.35); }
.cap { font-size: 10px; fill: #b9ad9d; text-anchor: middle; }
.head-cap { fill: var(--accent); }
.time { font-size: 10px; fill: #8d8579; text-anchor: middle; }
@keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.85; } }

.detail { flex: none; margin-top: 10px; padding: 10px 12px; min-height: 76px; display: flex; flex-direction: column; gap: 4px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); }
.detail-line { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #b9ad9d; }
.state { padding: 0 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); }
.state.here { color: var(--accent); }
.state.main { color: #e8c8a8; }
.fork-hint { color: #9fc4ff; }
.detail-label { font-size: 15px; }
.mark { font-style: normal; font-size: 11px; margin-right: 6px; padding: 1px 6px; border-radius: 8px; background: var(--accent-2); color: #fff; }
.detail-go { display: flex; justify-content: flex-end; }
.hint { margin: 6px 2px; font-size: 13px; color: #b9ad9d; }
.here { font-size: 13px; color: var(--accent); }
.go { background: var(--accent-2); border-color: var(--accent-2); }


@media (max-width: 640px) {
  .box { width: 96vw; height: 88vh; padding: 12px; }
  .chapters { padding-bottom: 8px; }
}
</style>
