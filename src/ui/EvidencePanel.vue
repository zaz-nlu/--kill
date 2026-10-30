<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { resolveEvidenceImage } from '../engine/evidenceArt'

interface Def { id: string; name: string; desc: string }
interface Part { id: string; name: string; kind: 'evidence' | 'testimony' }
interface Conclusion { id: string; name: string; desc: string; components: Part[] }
interface Info { type: string; who: string[] }

const props = withDefaults(defineProps<{
  evidence: Def[]
  testimony: Def[]
  conclusions?: Conclusion[]
  folded?: string[]
  info?: Record<string, Info>
}>(), { conclusions: () => [], folded: () => [], info: () => ({}) })
defineEmits<{ close: [] }>()

type Tab = 'evidence' | 'testimony' | 'conclusions'

const tab = ref<Tab>('evidence')
// A clue a conclusion card folds away is still in hand: only its row is hidden here until asked for.
const foldedSet = computed(() => new Set(props.folded))
const showArchived = ref(false)
const isFolded = (id: string) => foldedSet.value.has(id)

function source(t: 'evidence' | 'testimony'): Def[] {
  return t === 'evidence' ? props.evidence : props.testimony
}
const unfold = (items: Def[]) => items.filter(i => showArchived.value || !isFolded(i.id))

// Kind and person narrow the open tab; switching tabs starts over.
const typeFilter = ref('')
const whoFilter = ref('')
const infoOf = (id: string) => props.info[id]
const withType = (items: Def[]) => (typeFilter.value ? items.filter(i => infoOf(i.id)?.type === typeFilter.value) : items)
const withWho = (items: Def[]) => (whoFilter.value ? items.filter(i => infoOf(i.id)?.who?.includes(whoFilter.value)) : items)

const currentRaw = computed<Def[]>(() => {
  const t = tab.value
  return t === 'conclusions' ? [] : source(t)
})
const foldedInTab = computed(() => currentRaw.value.filter(i => isFolded(i.id)))
const typedItems = computed(() => withType(unfold(currentRaw.value)))
const listed = computed(() => withWho(typedItems.value))

const typeOptions = computed(() => {
  const set = new Set<string>()
  for (const i of unfold(currentRaw.value)) {
    const t = infoOf(i.id)?.type
    if (t) set.add(t)
  }
  return [...set]
})
const people = computed(() => {
  const n = new Map<string, number>()
  for (const e of typedItems.value) for (const w of infoOf(e.id)?.who ?? []) n.set(w, (n.get(w) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
})
const showFilters = computed(() => tab.value !== 'conclusions' && Object.keys(props.info).length > 0)

const countFor = (t: 'evidence' | 'testimony') => (t === tab.value ? listed.value.length : unfold(source(t)).length)
const emptyTab = computed(() => {
  const t = tab.value
  return t === 'conclusions' ? props.conclusions.length === 0 : source(t).length === 0
})

// The first item of the open tab is shown at once; picking another replaces it.
const picked = ref('')
const current = computed(() => listed.value.find(i => i.id === picked.value) ?? listed.value[0] ?? null)
const currentConclusion = computed(() => props.conclusions.find(c => c.id === picked.value) ?? props.conclusions[0] ?? null)
watch(tab, () => { picked.value = ''; typeFilter.value = ''; whoFilter.value = '' })
watch(people, p => { if (whoFilter.value && !p.includes(whoFilter.value)) whoFilter.value = '' })

// A piece of a conclusion is shown back where it lives, archived clues included.
async function openComponent(part: Part) {
  tab.value = part.kind
  showArchived.value = true
  await nextTick()
  picked.value = part.id
}

const image = computed(() => (current.value && tab.value === 'evidence' ? resolveEvidenceImage(current.value.id) : null))
</script>

<template>
  <aside class="evidence glass">
    <header>
      <nav>
        <button v-if="conclusions.length" type="button" data-testid="tab-conclusions" :class="{ on: tab === 'conclusions' }" @click="tab = 'conclusions'">结论 {{ conclusions.length }}</button>
        <button type="button" data-testid="tab-evidence" :class="{ on: tab === 'evidence' }" @click="tab = 'evidence'">证物 {{ countFor('evidence') }}</button>
        <button type="button" data-testid="tab-testimony" :class="{ on: tab === 'testimony' }" @click="tab = 'testimony'">证言 {{ countFor('testimony') }}</button>
      </nav>
      <button type="button" class="close" data-testid="close-evidence" @click="$emit('close')">×</button>
    </header>

    <div v-if="tab !== 'conclusions' && foldedInTab.length" class="archived-row">
      <button type="button" data-testid="toggle-archived" :class="{ on: showArchived }" @click="showArchived = !showArchived">
        {{ showArchived ? '收起已归档' : `显示已归档（${foldedInTab.length}）` }}
      </button>
    </div>

    <div v-if="showFilters" class="filters">
      <div class="filter-row">
        <span class="lead">类型</span>
        <button type="button" data-testid="filter-type-全部" :class="{ on: !typeFilter }" @click="typeFilter = ''">全部</button>
        <button v-for="t in typeOptions" :key="t" type="button" :data-testid="'filter-type-' + t" :class="{ on: typeFilter === t }" @click="typeFilter = typeFilter === t ? '' : t">{{ t }}</button>
      </div>
      <div v-if="people.length > 1" class="filter-row">
        <span class="lead">人物</span>
        <button type="button" data-testid="filter-who-全部" :class="{ on: !whoFilter }" @click="whoFilter = ''">不限</button>
        <button v-for="w in people" :key="w" type="button" :data-testid="'filter-who-' + w" :class="{ on: whoFilter === w }" @click="whoFilter = whoFilter === w ? '' : w">{{ w }}</button>
      </div>
    </div>

    <p v-if="emptyTab" class="none">还没有收集到{{ tab === 'evidence' ? '证物' : tab === 'testimony' ? '证言' : '结论' }}。</p>
    <div v-else class="body">
      <p v-if="tab !== 'conclusions' && listed.length === 0" class="none">当前筛选下没有条目。</p>
      <ul v-else class="list" data-testid="scroll">
        <template v-if="tab === 'conclusions'">
          <li v-for="c in conclusions" :key="c.id">
            <button
              type="button"
              :data-testid="'evidence-item-' + c.id"
              :class="{ on: currentConclusion?.id === c.id }"
              @click="picked = c.id"
            >
              <span class="badge">结</span>
              <span class="name">{{ c.name }}</span>
            </button>
          </li>
        </template>
        <template v-else>
          <li v-for="i in listed" :key="i.id">
            <button
              type="button"
              :data-testid="'evidence-item-' + i.id"
              :class="{ on: current?.id === i.id, archived: isFolded(i.id) }"
              @click="picked = i.id"
            >
              <img v-if="tab === 'evidence' && resolveEvidenceImage(i.id)" class="thumb" :src="resolveEvidenceImage(i.id)!" alt="">
              <span class="id">{{ i.id }}</span>
              <span class="name">{{ i.name }}</span>
              <span v-if="isFolded(i.id)" class="tag">已归档</span>
            </button>
          </li>
        </template>
      </ul>
      <section v-if="tab === 'conclusions' && currentConclusion" class="detail" data-testid="evidence-detail">
        <span class="badge big">结</span>
        <h3>{{ currentConclusion.name }}</h3>
        <p>{{ currentConclusion.desc }}</p>
        <h4>由这些线索得出：</h4>
        <div class="components">
          <button
            v-for="part in currentConclusion.components"
            :key="part.id"
            type="button"
            :data-testid="'component-' + part.id"
            @click="openComponent(part)"
          >
            <span class="id">{{ part.id }}</span>
            <span class="name">{{ part.name }}</span>
          </button>
        </div>
      </section>
      <section v-else-if="current" class="detail" data-testid="evidence-detail">
        <img v-if="image" class="big" data-testid="detail-image" :src="image" :alt="current.name">
        <h3>{{ current.name }}</h3>
        <p>{{ current.desc }}</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.evidence { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30; display: flex; flex-direction: column; width: min(860px, 94vw); height: min(540px, 76vh); padding: 14px 18px; color: #f1ece4; box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45), 0 16px 48px rgba(0, 0, 0, 0.5); }
header { display: flex; justify-content: space-between; align-items: center; flex: none; margin-bottom: 12px; }
nav { display: flex; gap: 8px; }
nav button.on { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
.close { width: 34px; height: 30px; padding: 0; font-size: 20px; line-height: 1; }
.none { margin: auto; color: #a99f92; }
.body { display: flex; gap: 16px; flex: 1 1 auto; min-height: 0; }
.list { flex: none; width: 270px; margin: 0; padding: 0 6px 0 0; list-style: none; overflow-y: auto; }
.list li { margin-bottom: 6px; }
.list button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; text-align: left; border-radius: 10px; }
.list button.on { border-color: var(--accent); background: rgba(232, 160, 112, 0.2); }
.thumb { width: 40px; height: 40px; flex: none; object-fit: contain; }
.badge { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border: 2px solid var(--accent); border-radius: 8px; color: var(--accent); font-size: 20px; font-weight: 700; background: rgba(232, 160, 112, 0.12); }
.badge.big { width: 96px; height: 96px; margin-top: 12px; font-size: 40px; border-radius: 14px; }
.id { flex: none; color: var(--accent); font-size: 12px; }
.name { font-size: 14px; line-height: 1.35; }
.list button.archived { opacity: 0.55; }
.tag { flex: none; margin-left: auto; padding: 0 6px; font-size: 11px; color: #a99f92; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 999px; }
.archived-row { flex: none; margin: -4px 0 8px; }
.archived-row button { padding: 2px 10px; font-size: 13px; border-radius: 999px; }
.archived-row button.on { background: rgba(232, 160, 112, 0.3); border-color: var(--accent); }
.filters { flex: none; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filter-row .lead { color: #a99f92; font-size: 13px; margin-right: 2px; }
.filter-row button { padding: 2px 10px; font-size: 13px; border-radius: 999px; }
.filter-row button.on { background: rgba(232, 160, 112, 0.3); border-color: var(--accent); }
.detail { flex: 1 1 auto; min-width: 0; overflow-y: auto; padding: 4px 10px; text-align: center; background: rgba(255, 255, 255, 0.04); border-radius: 10px; }
.big { max-width: 100%; max-height: 240px; margin-top: 8px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5)); }
h3 { margin: 10px 0 6px; font-size: 20px; }
h4 { margin: 14px 0 6px; font-size: 15px; color: #d9c7b4; text-align: left; }
p { margin: 0; text-align: left; line-height: 1.8; font-size: 16px; color: #e6e0d6; }
.components { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; text-align: left; }
.components button { display: flex; align-items: center; gap: 10px; padding: 6px 10px; text-align: left; border-radius: 10px; }
</style>
