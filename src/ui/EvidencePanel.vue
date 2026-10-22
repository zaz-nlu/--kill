<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveEvidenceImage } from '../engine/evidenceArt'

interface Def { id: string; name: string; desc: string }

const props = defineProps<{ evidence: Def[]; testimony: Def[] }>()
defineEmits<{ close: [] }>()

const tab = ref<'evidence' | 'testimony'>('evidence')
const list = computed(() => (tab.value === 'evidence' ? props.evidence : props.testimony))

// The first item of the open tab is shown at once; picking another replaces it.
const picked = ref('')
const current = computed(() => list.value.find(i => i.id === picked.value) ?? list.value[0] ?? null)
watch(tab, () => { picked.value = '' })

const image = computed(() => (current.value && tab.value === 'evidence' ? resolveEvidenceImage(current.value.id) : null))
</script>

<template>
  <aside class="evidence glass">
    <header>
      <nav>
        <button type="button" data-testid="tab-evidence" :class="{ on: tab === 'evidence' }" @click="tab = 'evidence'">证物 {{ evidence.length }}</button>
        <button type="button" data-testid="tab-testimony" :class="{ on: tab === 'testimony' }" @click="tab = 'testimony'">证言 {{ testimony.length }}</button>
      </nav>
      <button type="button" class="close" data-testid="close-evidence" @click="$emit('close')">×</button>
    </header>

    <p v-if="list.length === 0" class="none">还没有收集到{{ tab === 'evidence' ? '证物' : '证言' }}。</p>
    <div v-else class="body">
      <ul class="list" data-testid="scroll">
        <li v-for="i in list" :key="i.id">
          <button
            type="button"
            :data-testid="'evidence-item-' + i.id"
            :class="{ on: current?.id === i.id }"
            @click="picked = i.id"
          >
            <img v-if="tab === 'evidence' && resolveEvidenceImage(i.id)" class="thumb" :src="resolveEvidenceImage(i.id)!" alt="">
            <span class="id">{{ i.id }}</span>
            <span class="name">{{ i.name }}</span>
          </button>
        </li>
      </ul>
      <section v-if="current" class="detail" data-testid="evidence-detail">
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
.id { flex: none; color: var(--accent); font-size: 12px; }
.name { font-size: 14px; line-height: 1.35; }
.detail { flex: 1 1 auto; min-width: 0; overflow-y: auto; padding: 4px 10px; text-align: center; background: rgba(255, 255, 255, 0.04); border-radius: 10px; }
.big { max-width: 100%; max-height: 240px; margin-top: 8px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5)); }
h3 { margin: 10px 0 6px; font-size: 20px; }
p { margin: 0; text-align: left; line-height: 1.8; font-size: 16px; color: #e6e0d6; }
</style>
