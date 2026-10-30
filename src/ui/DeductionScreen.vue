<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveEvidenceImage } from '../engine/evidenceArt'
import TypedText from './TypedText.vue'

interface Item { id: string; name: string; kind: 'evidence' | 'testimony'; folded?: boolean }

const props = withDefaults(defineProps<{
  prompt: string
  pick: number
  items: Item[]
  left: number
  hint: string
  line: string
  intro?: string[]
  lead?: string
  result?: { name: string; desc: string; aha?: string } | null
}>(), { intro: () => [], lead: '', result: null })
const emit = defineEmits<{ submit: [ids: string[]]; continue: [] }>()

const chosen = ref<string[]>([])
const nameOf = (id: string) => props.items.find(i => i.id === id)?.name ?? id
const ready = computed(() => chosen.value.length >= 2)
// Where the clues already folded into a conclusion begin: the divider goes in just before them.
const firstFolded = computed(() => props.items.findIndex(i => i.folded))

function toggle(id: string) {
  const at = chosen.value.indexOf(id)
  if (at >= 0) chosen.value.splice(at, 1)
  else if (chosen.value.length < props.pick) chosen.value.push(id)
}

function submit() {
  if (ready.value) emit('submit', [...chosen.value])
}

// A wrong guess clears the table so you try a different combination.
watch(() => props.left, () => { chosen.value = [] })

// His opening lines follow one another; the count says how many have been said.
const introDone = ref(0)
watch(() => props.intro, () => { introDone.value = 0 })
</script>

<template>
  <section class="deduce glass">
    <header>
      <h2>夜里的推理</h2>
      <span v-if="!result" class="tries" data-testid="tries">还剩 {{ left }} 次机会</span>
    </header>
    <p class="prompt">{{ prompt }}</p>

    <div v-if="intro.length" class="intro" data-testid="deduce-intro">
      <span class="who">林一程</span>
      <p v-for="(t, n) in intro" :key="n"><TypedText :text="t" :scale="0.8" :active="n === 0 || introDone >= n" @done="introDone = Math.max(introDone, n + 1)" /></p>
    </div>

    <div v-if="result" class="conclusion" data-testid="deduction-result">
      <h3>得出结论</h3>
      <span class="badge">结</span>
      <p v-if="result.aha" class="aha" data-testid="deduce-aha"><span class="who">林一程</span><TypedText :text="result.aha" :scale="0.8" /></p>
      <p class="cname">{{ result.name }}</p>
      <p class="cdesc">{{ result.desc }}</p>
      <button type="button" class="go" data-testid="deduce-continue" @click="emit('continue')">继续</button>
    </div>

    <template v-else>
      <div class="slots">
        <template v-for="(_, n) in pick" :key="n">
          <div class="slot" :class="{ filled: chosen[n] }" :data-testid="'slot-' + n" @click="chosen[n] && toggle(chosen[n])">
            <template v-if="chosen[n]">{{ nameOf(chosen[n]) }}</template>
            <template v-else>？</template>
          </div>
          <span v-if="n < pick - 1" class="plus">＋</span>
        </template>
      </div>

      <p v-if="lead" class="lead" data-testid="deduce-lead"><span class="who">林一程</span><TypedText :text="lead" :scale="0.8" /></p>
      <p v-if="hint" class="hint"><span class="who">林一程</span><TypedText :text="hint" :scale="0.8" /></p>
      <p v-if="line" class="line">{{ line }}</p>

      <ul class="list" data-testid="scroll">
        <template v-for="(i, n) in items" :key="i.id">
          <li v-if="n === firstFolded" class="divider" data-testid="deduce-divider">已用于别的结论的线索</li>
          <li>
            <button type="button" :class="{ on: chosen.includes(i.id), folded: i.folded }" :data-testid="'item-' + i.id" @click="toggle(i.id)">
              <img v-if="i.kind === 'evidence' && resolveEvidenceImage(i.id)" class="thumb" :src="resolveEvidenceImage(i.id)!" alt="">
              <span class="id">{{ i.id }}</span>
              <span class="name">{{ i.name }}</span>
            </button>
          </li>
        </template>
      </ul>

      <footer>
        <button type="button" class="go" data-testid="deduce" :disabled="!ready" @click="submit">推理</button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.deduce { display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 76px); margin: 12px; padding: 14px 18px 12px; }
header { display: flex; justify-content: space-between; align-items: baseline; flex: none; }
h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 2px; }
.tries { font-size: 13px; color: #d9c7b4; }
.prompt { margin: 6px 0 10px; flex: none; color: #ece6dc; }
.intro { display: flex; flex-direction: column; gap: 4px; flex: none; margin: 0 0 10px; padding: 6px 12px; border-left: 2px solid rgba(232, 160, 112, 0.55); color: #e8cdb4; font-style: italic; line-height: 1.7; }
.intro p { margin: 0; }
.who { margin-right: 8px; font-style: normal; font-size: 12px; letter-spacing: 1px; color: rgba(232, 160, 112, 0.9); }
.lead { margin: 2px 0 8px; flex: none; padding: 6px 12px; border-left: 2px solid rgba(232, 160, 112, 0.55); background: rgba(232, 160, 112, 0.08); border-radius: 6px; color: #e8cdb4; font-style: italic; }
.slots { display: flex; align-items: center; gap: 10px; flex: none; margin-bottom: 8px; }
.slot { flex: 1; min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 6px 10px; text-align: center; border: 2px dashed rgba(255, 255, 255, 0.3); border-radius: 10px; color: #a99f92; }
.slot.filled { border-style: solid; border-color: var(--accent); color: #fff; background: rgba(232, 160, 112, 0.18); cursor: pointer; }
.plus { color: var(--accent); font-size: 20px; }
.hint { margin: 2px 0 8px; flex: none; padding: 8px 12px; border-left: 4px solid #4aa3ff; background: rgba(60, 110, 190, 0.2); border-radius: 6px; }
.line { margin: 2px 0 8px; flex: none; color: var(--accent); font-style: italic; }
.list { flex: 1 1 auto; min-height: 90px; margin: 0; padding: 0 6px 0 0; list-style: none; overflow-y: auto; }
.list li { margin-bottom: 6px; }
.list li.divider { margin: 2px 0 8px; padding-top: 8px; border-top: 1px solid var(--glass-line); font-size: 12px; letter-spacing: 1px; color: #9a9084; }
.list button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; text-align: left; border-radius: 10px; }
.list button.on { border-color: var(--accent); background: rgba(232, 160, 112, 0.22); }
.list button.folded { opacity: 0.55; }
.thumb { width: 36px; height: 36px; flex: none; object-fit: contain; }
.id { flex: none; font-size: 12px; color: var(--accent); }
footer { flex: none; display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.go { padding: 8px 32px; font-size: 16px; border-color: rgba(232, 160, 112, 0.7); }
.conclusion { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1 1 auto; padding: 16px 10px; text-align: center; }
.conclusion h3 { margin: 0; font-size: 17px; letter-spacing: 2px; color: #d9c7b4; }
.badge { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; border: 2px solid var(--accent); border-radius: 12px; color: var(--accent); font-size: 30px; font-weight: 700; background: rgba(232, 160, 112, 0.12); }
.aha { margin: 0; font-size: 17px; font-style: italic; line-height: 1.8; color: #f0d6bf; }
.cname { margin: 0; font-size: 20px; color: #fff; }
.cdesc { margin: 0; line-height: 1.8; color: #e6e0d6; }
</style>
