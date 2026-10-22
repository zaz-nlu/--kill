<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveEvidenceImage } from '../engine/evidenceArt'

interface Item { id: string; name: string; kind: 'evidence' | 'testimony' }

const props = defineProps<{ prompt: string; pick: number; items: Item[]; left: number; hint: string; line: string }>()
const emit = defineEmits<{ submit: [ids: string[]] }>()

const chosen = ref<string[]>([])
const nameOf = (id: string) => props.items.find(i => i.id === id)?.name ?? id
const ready = computed(() => chosen.value.length >= 2)

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
</script>

<template>
  <section class="deduce glass">
    <header>
      <h2>夜里的推理</h2>
      <span class="tries" data-testid="tries">还剩 {{ left }} 次机会</span>
    </header>
    <p class="prompt">{{ prompt }}</p>

    <div class="slots">
      <template v-for="(_, n) in pick" :key="n">
        <div class="slot" :class="{ filled: chosen[n] }" :data-testid="'slot-' + n" @click="chosen[n] && toggle(chosen[n])">
          <template v-if="chosen[n]">{{ nameOf(chosen[n]) }}</template>
          <template v-else>？</template>
        </div>
        <span v-if="n < pick - 1" class="plus">＋</span>
      </template>
    </div>

    <p v-if="hint" class="hint">{{ hint }}</p>
    <p v-if="line" class="line">{{ line }}</p>

    <ul class="list" data-testid="scroll">
      <li v-for="i in items" :key="i.id">
        <button type="button" :class="{ on: chosen.includes(i.id) }" :data-testid="'item-' + i.id" @click="toggle(i.id)">
          <img v-if="i.kind === 'evidence' && resolveEvidenceImage(i.id)" class="thumb" :src="resolveEvidenceImage(i.id)!" alt="">
          <span class="id">{{ i.id }}</span>
          <span class="name">{{ i.name }}</span>
        </button>
      </li>
    </ul>

    <footer>
      <button type="button" class="go" data-testid="deduce" :disabled="!ready" @click="submit">推理</button>
    </footer>
  </section>
</template>

<style scoped>
.deduce { display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 76px); margin: 12px; padding: 14px 18px 12px; }
header { display: flex; justify-content: space-between; align-items: baseline; flex: none; }
h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 2px; }
.tries { font-size: 13px; color: #d9c7b4; }
.prompt { margin: 6px 0 10px; flex: none; color: #ece6dc; }
.slots { display: flex; align-items: center; gap: 10px; flex: none; margin-bottom: 8px; }
.slot { flex: 1; min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 6px 10px; text-align: center; border: 2px dashed rgba(255, 255, 255, 0.3); border-radius: 10px; color: #a99f92; }
.slot.filled { border-style: solid; border-color: var(--accent); color: #fff; background: rgba(232, 160, 112, 0.18); cursor: pointer; }
.plus { color: var(--accent); font-size: 20px; }
.hint { margin: 2px 0 8px; flex: none; padding: 8px 12px; border-left: 4px solid #4aa3ff; background: rgba(60, 110, 190, 0.2); border-radius: 6px; }
.line { margin: 2px 0 8px; flex: none; color: var(--accent); font-style: italic; }
.list { flex: 1 1 auto; min-height: 90px; margin: 0; padding: 0 6px 0 0; list-style: none; overflow-y: auto; }
.list li { margin-bottom: 6px; }
.list button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; text-align: left; border-radius: 10px; }
.list button.on { border-color: var(--accent); background: rgba(232, 160, 112, 0.22); }
.thumb { width: 36px; height: 36px; flex: none; object-fit: contain; }
.id { flex: none; font-size: 12px; color: var(--accent); }
footer { flex: none; display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.go { padding: 8px 32px; font-size: 16px; border-color: rgba(232, 160, 112, 0.7); }
</style>
