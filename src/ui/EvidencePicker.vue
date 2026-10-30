<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RECORD_TYPES, type RecordInfo } from '../engine/data'

interface Quote { id: string; text: string; who?: string }

const props = withDefaults(defineProps<{
  ids: string[]
  info: Record<string, RecordInfo>
  quotes: Quote[]
  folded?: string[]
  target?: string | null   // the weak point being aimed at, as it reads in the line
}>(), { folded: () => [] })
const emit = defineEmits<{ confirm: [id: string]; close: [] }>()

interface Entry { id: string; quote: boolean; name: string; type: string; who: string[]; thumb: string | null; archived: boolean }

// A clue a conclusion card folds away is still in hand; the picker just files it out of sight until asked for.
const foldedSet = computed(() => new Set(props.folded))
const showArchived = ref(false)
const archivedCount = computed(() => props.ids.filter(id => foldedSet.value.has(id)).length)

const entries = computed<Entry[]>(() => [
  ...props.ids
    .filter(id => showArchived.value || !foldedSet.value.has(id))
    .map(id => {
      const i = props.info[id]
      return { id, quote: false, name: i?.name ?? id, type: i?.type ?? '记录', who: i?.who ?? [], thumb: i?.image ?? null, archived: foldedSet.value.has(id) }
    }),
  ...props.quotes.map(q => ({ id: q.id, quote: true, name: q.text, type: '日志里的话', who: q.who ? [q.who] : [], thumb: null, archived: false })),
])

// Tabs: everything you hold, then one per kind of record, then the conclusion cards, then what people said (from the log).
const tab = ref('全部')
const tabs = computed(() => {
  const count = (t: string) => entries.value.filter(e => (t === '全部' ? !e.quote : e.type === t)).length
  const kinds = [...RECORD_TYPES, '结论', '日志里的话'] as string[]
  return ['全部', ...kinds].map(t => ({ key: t, n: count(t) })).filter(t => t.key === '全部' || t.n > 0)
})
const inTab = computed(() => entries.value.filter(e => (tab.value === '全部' ? !e.quote : e.type === tab.value)))

// Narrow it down to one person (the commonest first).
const person = ref('')
const people = computed(() => {
  const n = new Map<string, number>()
  for (const e of inTab.value) for (const w of e.who) n.set(w, (n.get(w) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
})
const listed = computed(() => inTab.value.filter(e => !person.value || e.who.includes(person.value)))

const picked = ref('')
const current = computed(() => entries.value.find(e => e.id === picked.value) ?? null)
const detail = computed(() => (current.value && !current.value.quote ? props.info[current.value.id] ?? null : null))
const quoteDetail = computed(() => (current.value?.quote ? props.quotes.find(q => q.id === current.value!.id) ?? null : null))

watch(tab, () => { person.value = '' })
watch(people, p => { if (person.value && !p.includes(person.value)) person.value = '' })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="picker glass" data-testid="picker">
    <header>
      <h3>选一样东西出示</h3>
      <p v-if="target" class="aim" data-testid="present-target">针对：<b>「{{ target }}」</b></p>
      <button type="button" class="close" data-testid="close-present" @click="emit('close')">×</button>
    </header>

    <nav class="tabs" data-testid="picker-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        :data-testid="'tab-' + t.key"
        :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >{{ t.key }}<small>{{ t.n }}</small></button>
    </nav>
    <div v-if="archivedCount" class="archived-row">
      <button type="button" data-testid="picker-toggle-archived" :class="{ on: showArchived }" @click="showArchived = !showArchived">
        {{ showArchived ? '收起已归档' : `显示已归档（${archivedCount}）` }}
      </button>
    </div>
    <div v-if="people.length > 1" class="people" data-testid="picker-people">
      <span class="lead">人物</span>
      <button type="button" data-testid="who-all" :class="{ on: !person }" @click="person = ''">不限</button>
      <button v-for="w in people" :key="w" type="button" :data-testid="'who-' + w" :class="{ on: person === w }" @click="person = person === w ? '' : w">{{ w }}</button>
    </div>

    <div class="body">
      <ul class="list" data-testid="picker-list">
        <li v-if="listed.length === 0" class="none">{{ tab === '日志里的话' ? '还没有记录' : '这里还没有东西' }}</li>
        <li v-for="e in listed" :key="e.id">
          <button
            type="button"
            :data-testid="(e.quote ? 'quote-' : 'record-') + e.id"
            :class="{ on: picked === e.id, said: e.quote, archived: e.archived }"
            @click="picked = e.id"
          >
            <img v-if="e.thumb" class="thumb" :src="e.thumb" alt="">
            <span v-else-if="e.type === '结论'" class="badge">结</span>
            <span class="name"><b v-if="e.quote && e.who[0]" class="who">{{ e.who[0] }}：</b>{{ e.name }}</span>
            <span v-if="e.archived" class="tag">已归档</span>
          </button>
        </li>
      </ul>

      <section class="detail" data-testid="record-detail">
        <div class="scroll">
          <template v-if="detail">
            <img v-if="detail.image" class="big" data-testid="detail-image" :src="detail.image" :alt="detail.name">
            <span v-else-if="detail.type === '结论'" class="badge big">结</span>
            <h4 data-testid="present-picked">{{ detail.name }}</h4>
            <dl>
              <dt>类型</dt><dd>{{ detail.type }}</dd>
              <template v-if="detail.who.length"><dt>人物</dt><dd>{{ detail.who.join('、') }}</dd></template>
              <template v-if="detail.where"><dt>地点</dt><dd>{{ detail.where }}</dd></template>
              <template v-if="detail.when"><dt>时间</dt><dd>{{ detail.when }}</dd></template>
            </dl>
            <p>{{ detail.desc }}</p>
          </template>
          <template v-else-if="quoteDetail">
            <h4 data-testid="present-picked">{{ quoteDetail.text }}</h4>
            <dl>
              <dt>类型</dt><dd>日志里的话</dd>
              <template v-if="quoteDetail.who"><dt>说话人</dt><dd>{{ quoteDetail.who }}</dd></template>
            </dl>
          </template>
          <p v-else class="empty" data-testid="present-hint">点左边的一样东西，先看清它说明了什么，再决定要不要出示。出错会扣说服力。</p>
        </div>
        <button type="button" class="go" data-testid="present-go" :disabled="!current" @click="current && emit('confirm', current.id)">出示</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; width: min(900px, 96vw); height: min(600px, 86vh); padding: 14px 18px; }
header { display: flex; align-items: center; gap: 14px; flex: none; margin-bottom: 8px; }
h3 { margin: 0; font-size: 18px; letter-spacing: 2px; }
.aim { margin: 0; flex: 1 1 auto; font-size: 15px; color: #ffb4a8; }
.aim b { color: #ff6b5e; }
.close { margin-left: auto; width: 34px; height: 30px; padding: 0; font-size: 20px; line-height: 1; }

.tabs { display: flex; flex-wrap: wrap; gap: 6px; flex: none; }
.tabs button { padding: 4px 12px; font-size: 14px; }
.tabs small { margin-left: 6px; color: #a99f92; }
.tabs button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.tabs button.on small { color: #ffe3d2; }
.people { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: none; margin-top: 8px; }
.people .lead { color: #a99f92; font-size: 13px; margin-right: 2px; }
.people button { padding: 2px 10px; font-size: 13px; border-radius: 999px; }
.people button.on { background: rgba(232, 160, 112, 0.3); border-color: var(--accent); }
.archived-row { flex: none; margin-top: 8px; }
.archived-row button { padding: 2px 10px; font-size: 13px; border-radius: 999px; }
.archived-row button.on { background: rgba(232, 160, 112, 0.3); border-color: var(--accent); }

.body { display: flex; gap: 14px; flex: 1 1 auto; min-height: 0; margin-top: 10px; }
.list { flex: none; width: 320px; margin: 0; padding: 0 6px 0 0; list-style: none; overflow-y: auto; }
.list li { margin-bottom: 6px; }
.list .none { color: #a99f92; padding: 8px 4px; }
.list button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; text-align: left; border-radius: 10px; }
.list button.on { border-color: var(--accent); background: rgba(232, 160, 112, 0.22); }
.thumb { width: 38px; height: 38px; flex: none; object-fit: contain; }
.badge { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 38px; height: 38px; border: 2px solid var(--accent); border-radius: 8px; color: var(--accent); font-size: 18px; font-weight: 700; background: rgba(232, 160, 112, 0.12); }
.badge.big { display: flex; width: 96px; height: 96px; margin: 0 auto 8px; font-size: 40px; border-radius: 14px; }
.list button.archived { opacity: 0.55; }
.tag { flex: none; margin-left: auto; padding: 0 6px; font-size: 11px; color: #a99f92; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 999px; }
.name { font-size: 14px; line-height: 1.4; }
.who { color: var(--accent); font-weight: 600; white-space: nowrap; }

.detail { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
.scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.big { display: block; max-width: 100%; max-height: 200px; margin: 0 auto 8px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5)); }
h4 { margin: 4px 0 8px; font-size: 19px; line-height: 1.4; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 0 0 10px; font-size: 14px; }
dt { color: #a99f92; }
dd { margin: 0; color: #e6e0d6; }
p { margin: 0; line-height: 1.8; font-size: 15px; color: #e6e0d6; }
.empty { color: #a99f92; }
.go { flex: none; margin-top: 10px; padding: 10px; font-size: 17px; letter-spacing: 6px; background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.go:disabled { opacity: 0.4; cursor: default; background: rgba(255, 255, 255, 0.09); border-color: rgba(255, 255, 255, 0.22); }

@media (max-width: 700px) {
  .body { flex-direction: column; }
  .list { width: auto; max-height: 38%; }
}
</style>
