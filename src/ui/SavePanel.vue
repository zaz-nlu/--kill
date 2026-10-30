<script setup lang="ts">
import { ref } from 'vue'
import type { SlotMeta } from '../engine/saves'

interface OtherSlot { slot: number | 'auto'; meta: SlotMeta | null }
interface OtherGroup { chapter: string; title: string; slots: OtherSlot[] }

const props = withDefaults(defineProps<{
  mode: 'save' | 'load'
  slots: { slot: number; meta: SlotMeta | null }[]
  auto: SlotMeta | null
  chapterName?: string
  chapterId?: string
  others?: OtherGroup[]
}>(), { chapterName: '', chapterId: '', others: () => [] })
const emit = defineEmits<{ pick: [slot: number | 'auto']; remove: [slot: number]; pickOther: [chapter: string, slot: number | 'auto']; close: [] }>()

const confirming = ref<number | null>(null) // an occupied slot the player is about to overwrite or delete
const confirmingKind = ref<'save' | 'remove'>('save')

// Another chapter's save (read-only here): reading it leaves the chapter being played, so it asks first.
const showOthers = ref(false)
const pending = ref<{ chapter: string; title: string; slot: number | 'auto'; meta: SlotMeta } | null>(null)

function when(at: number): string {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function head(m: SlotMeta): string {
  return `第 ${m.day} 天 ${String(m.hour).padStart(2, '0')}:00`
}

function clickSlot(slot: number, meta: SlotMeta | null) {
  if (props.mode === 'load') {
    if (meta) emit('pick', slot)
    return
  }
  if (meta && !(confirming.value === slot && confirmingKind.value === 'save')) {
    confirming.value = slot
    confirmingKind.value = 'save'
    return
  }
  confirming.value = null
  emit('pick', slot)
}

function clickRemove(slot: number) {
  if (confirming.value === slot && confirmingKind.value === 'remove') {
    confirming.value = null
    emit('remove', slot)
    return
  }
  confirming.value = slot
  confirmingKind.value = 'remove'
}

function clickOther(g: OtherGroup, s: OtherSlot) {
  if (!s.meta) return
  pending.value = { chapter: g.chapter, title: g.title, slot: s.slot, meta: s.meta }
}

function readOther() {
  if (!pending.value) return
  const p = pending.value
  pending.value = null
  emit('pickOther', p.chapter, p.slot)
}

function slotName(slot: number | 'auto'): string {
  return slot === 'auto' ? '自动存档' : `存档 ${slot}`
}
</script>

<template>
  <div class="veil" data-testid="save-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>{{ mode === 'save' ? '存档' : '读取存档' }}</h3>
        <button type="button" data-testid="save-close" @click="emit('close')">关闭</button>
      </header>
      <p class="chapter-line" data-testid="save-chapter">{{ chapterName ? `当前章节：${chapterName}　` : '' }}存档只在本章内有效</p>
      <ul>
        <li v-if="mode === 'load'">
          <button type="button" class="slot auto" :disabled="!auto" data-testid="slot-auto" @click="auto && emit('pick', 'auto')">
            <b>继续上次</b>
            <span v-if="auto"><i v-if="chapterName" class="tag">{{ chapterName }}</i>{{ head(auto) }} · 证物 {{ auto.evidence }} · 证言 {{ auto.testimony }}</span>
            <span v-else class="dim">还没有</span>
            <em v-if="auto">{{ when(auto.at) }}</em>
          </button>
        </li>
        <li v-for="s in slots" :key="s.slot">
          <button type="button" class="slot" :class="{ empty: !s.meta, warn: confirming === s.slot }" :disabled="mode === 'load' && !s.meta"
                  :data-testid="'slot-' + s.slot" @click="clickSlot(s.slot, s.meta)">
            <b>存档 {{ s.slot }}</b>
            <span v-if="confirming === s.slot && confirmingKind === 'save'">覆盖这个存档？再点一次确认</span>
            <span v-else-if="confirming === s.slot && confirmingKind === 'remove'">删除{{ chapterName ? `（${chapterName}）` : '' }}存档 {{ s.slot }}{{ s.meta ? `（${head(s.meta)}）` : '' }}？再点右边的删除确认</span>
            <span v-else-if="s.meta"><i v-if="chapterName" class="tag">{{ chapterName }}</i>{{ head(s.meta) }} · 证物 {{ s.meta.evidence }} · 证言 {{ s.meta.testimony }}</span>
            <span v-else class="dim">本章空槽</span>
            <em v-if="s.meta">{{ when(s.meta.at) }}</em>
          </button>
          <button v-if="s.meta" type="button" class="del" :data-testid="'remove-' + s.slot" @click="clickRemove(s.slot)">删除</button>
        </li>
      </ul>
      <div v-if="others.length > 0" class="others">
        <button type="button" class="other-toggle" data-testid="other-saves" @click="showOthers = !showOthers">
          其他章节的存档（{{ others.length }}）{{ showOthers ? '收起' : '展开' }}
        </button>
        <div v-if="showOthers" class="other-list" data-testid="other-list">
          <div v-for="g in others" :key="g.chapter" class="other-group">
            <h4>{{ g.title }}</h4>
            <button
              v-for="s in g.slots" :key="String(s.slot)" type="button" class="slot other"
              :data-testid="`other-${g.chapter}-${s.slot}`" @click="clickOther(g, s)"
            >
              <b>{{ slotName(s.slot) }}</b>
              <span>{{ s.meta ? `${head(s.meta)} · 证物 ${s.meta.evidence} · 证言 ${s.meta.testimony}` : '空' }}</span>
              <em v-if="s.meta">{{ when(s.meta.at) }}</em>
            </button>
          </div>
        </div>
      </div>
      <p class="tip">{{ mode === 'save' ? '只能在行动菜单里存档。' : '读取后会回到那个时刻，之前的回溯分支不会带上。' }}</p>
      <div v-if="pending" class="confirm" data-testid="other-confirm">
        <p>这是【{{ pending.title }}】的存档，读取后将离开当前的【{{ chapterName }}】。当前进度会自动保存。</p>
        <div class="row">
          <button type="button" class="read" data-testid="other-read" @click="readOther">读取</button>
          <button type="button" data-testid="other-cancel" @click="pending = null">取消</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(560px, 92vw); max-height: 86vh; overflow: auto; padding: 16px 18px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h3 { margin: 0; letter-spacing: 3px; }
.chapter-line { margin: 0 0 10px; padding-bottom: 8px; font-size: 13px; color: #e8c8a8; border-bottom: 1px solid var(--glass-line); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; gap: 8px; align-items: stretch; }
.slot { flex: 1; display: flex; gap: 12px; align-items: baseline; text-align: left; padding: 10px 14px; }
.slot b { min-width: 64px; }
.slot span { flex: 1; }
.slot em { font-style: normal; font-size: 12px; color: #b9ad9d; }
.tag { font-style: normal; margin-right: 6px; padding: 1px 6px; font-size: 11px; border-radius: 8px; background: rgba(232, 160, 112, 0.18); color: #ecd3bb; }
.slot.warn { border-color: #e5484d; background: #e5484d22; }
.dim { color: #8c8c96; }
.auto { border-color: var(--accent); }
.del { padding: 4px 10px; font-size: 13px; }
.tip { margin: 12px 2px 0; font-size: 13px; color: #b9ad9d; }
.others { margin-top: 12px; }
.other-toggle { width: 100%; text-align: left; font-size: 13px; color: #8c8c96; background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.12); }
.other-list { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; opacity: 0.72; }
.other-group h4 { margin: 4px 0 6px; font-size: 13px; font-weight: normal; color: #b9ad9d; letter-spacing: 2px; }
.other { width: 100%; margin-bottom: 6px; }
.confirm { margin-top: 12px; padding: 10px 12px; border: 1px solid #e5484d66; border-radius: 10px; background: #e5484d18; }
.confirm p { margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #f0c9c5; }
.row { display: flex; gap: 8px; justify-content: flex-end; }
.read { border-color: var(--accent); background: rgba(232, 160, 112, 0.2); }
</style>
