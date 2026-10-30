<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Statement } from '../engine/types'
import type { RecordInfo } from '../engine/data'
import { parseMarked } from '../engine/markup'
import EvidencePicker from './EvidencePicker.vue'
import ShatterText from './ShatterText.vue'
import TypedText from './TypedText.vue'
import { useTypewriter } from './useTypewriter'

interface View {
  text: string
  history: string[]
  weak: Record<string, 'open' | 'broken'>
  cleared: boolean
  exhausted: boolean
  canPress: boolean
  pressed: boolean
  dots: { id: string; cleared: boolean; pressed: boolean; revised: boolean }[]
  guard: number
  gaps: number
  gapLimit: number
  max: number
  title: string
}
interface ExamEventLike {
  n: number
  outcome: string
  kind?: string
  target?: string
  revised: boolean
  guarded: boolean
  lost: number
  lineCleared: boolean
}

const props = defineProps<{
  statement: Statement
  index: number
  total: number
  persuasion: number
  lastLines: { name: string; text: string }[]
  outcome?: string | null
  recordIds: string[]
  names: Record<string, string>
  quotes: { id: string; text: string; who?: string }[]
  argument: { stepId: string; prompt: string; options: string[] } | null
  // the rest is optional: without it the line is plain text and nothing is animated
  view?: View | null
  info?: Record<string, RecordInfo>
  folded?: string[]
  event?: ExamEventLike | null
  hold?: boolean
  witness?: string
}>()
const emit = defineEmits<{
  prev: []
  next: []
  goto: [index: number]
  press: []
  present: [id: string, target?: string]
  choose: [payload: { stepId: string; optionIndex: number }]
  record: [open: boolean]
  continue: []
  impact: [kind: 'hit' | 'hurt']
}>()

// ---- choosing what to show ----

const showRecord = ref(false)
const lock = ref<string | null>(null)       // the weak point clicked first
const lockPhrase = ref<string | null>(null)
watch(showRecord, open => {
  if (!open) {
    lock.value = null
    lockPhrase.value = null
  }
  emit('record', open)
})

const infoMap = computed<Record<string, RecordInfo>>(() => props.info ?? Object.fromEntries(
  props.recordIds.map(id => [id, { id, name: props.names[id] ?? id, desc: '', type: '记录' as const, who: [], image: null }]),
))

function lockOn(mark: string, phrase: string) {
  if (props.hold) return
  lock.value = mark
  lockPhrase.value = phrase
  showRecord.value = true
}

function confirmPresent(id: string) {
  const target = lock.value
  showRecord.value = false
  if (target) emit('present', id, target)
  else emit('present', id)
}

// ---- the line ----

const liveText = computed(() => props.view?.text ?? props.statement.text)
const frozen = ref<string | null>(null)    // the old line, while it is being smashed
const shown = computed(() => frozen.value ?? liveText.value)
const segs = computed(() => parseMarked(shown.value))
const weak = computed(() => props.view?.weak ?? {})
const locked = computed(() => Boolean(props.view?.exhausted) && !props.argument)

// ---- the line, typed out ----

const lineTyping = useTypewriter(shown)
const lineDone = lineTyping.done
const typedBefore = new Map<string, string>()   // statement id -> the text it was last typed out as

// How much of each piece has appeared: the count covers the plain text, so it is handed out piece by piece.
const lineParts = computed(() => {
  let left = lineTyping.count.value
  return segs.value.map(s => {
    const vis = Math.max(0, Math.min(s.text.length, left))
    left -= vis
    return { mark: s.mark, text: s.text, vis }
  })
})

// A line already read through once comes back whole; a line that was only appended to carries on from there.
watch(liveText, text => {
  if (typedBefore.get(props.statement.id) === text) lineTyping.skip()
})
watch(lineDone, d => {
  if (d && !frozen.value) typedBefore.set(props.statement.id, liveText.value)
})

function onStatementClick() {
  if (!lineDone.value) lineTyping.skip()
}

// ---- the reply, line after line ----

const replyTyped = ref(0)
const replySkips = new Map<number, () => void>()

function bindReply(i: number, el: unknown) {
  const fn = (el as { skip?: () => void } | null)?.skip
  if (fn) replySkips.set(i, () => fn.call(el))
  else replySkips.delete(i)
}

function skipReplies() {
  for (const s of replySkips.values()) s()
}

watch(() => props.event?.n ?? 0, () => {
  replyTyped.value = 0
  replySkips.clear()
})

type Phase = 'idle' | 'shatter' | 'crack' | 'rise' | 'pulse' | 'hurt'
const phase = ref<Phase>('idle')
const freshMark = ref<string | null>(null)
const loss = ref<{ n: number; v: number } | null>(null)
const stampFresh = ref(false)
const stamped = computed(() => Boolean(props.view?.cleared) && phase.value !== 'shatter')

const timers: ReturnType<typeof setTimeout>[] = []
function later(fn: () => void, ms: number) {
  timers.push(setTimeout(fn, ms))
}
function clearTimers() {
  while (timers.length) clearTimeout(timers.pop())
}

function react(ev: ExamEventLike, before: string, now: string) {
  clearTimers()
  frozen.value = null
  freshMark.value = null
  const calm = () => { phase.value = 'idle' }
  if (ev.lost > 0) {
    loss.value = { n: ev.n, v: ev.lost }
    later(() => { loss.value = null }, 1300)
  }
  if (ev.outcome === 'wrong') {
    phase.value = 'hurt'
    emit('impact', 'hurt')
    later(calm, 650)
  } else if (ev.outcome === 'correct' && ev.kind === 'present') {
    emit('impact', 'hit')
    if (ev.revised && before !== now) {
      frozen.value = before
      phase.value = 'shatter'
      later(() => {
        frozen.value = null
        phase.value = 'rise'
        later(calm, 700)
      }, 950)
    } else {
      freshMark.value = ev.target ?? null
      phase.value = 'crack'
      later(() => { freshMark.value = null; calm() }, 900)
    }
  } else if (ev.outcome === 'correct') {
    phase.value = 'pulse'
    later(calm, 800)
  } else {
    phase.value = 'idle'
  }
  if (ev.lineCleared) {
    stampFresh.value = true
    later(() => { stampFresh.value = false }, 2000)
  }
}

watch(
  () => [liveText.value, props.event?.n ?? 0, props.index] as const,
  ([text, n, idx], [oldText, oldN, oldIdx]) => {
    if (idx !== oldIdx) {
      clearTimers()
      frozen.value = null
      phase.value = 'idle'
      stampFresh.value = false
      return
    }
    if (n !== oldN && props.event) react(props.event, oldText, text)
  },
)

// The act is won: let the last blow land, then move on.
watch(() => props.hold, h => {
  if (h) later(() => emit('continue'), 1500)
}, { immediate: true })

// ---- keys ----

function onKey(e: KeyboardEvent) {
  if (showRecord.value || props.hold) return
  if (e.key === 'ArrowLeft' && props.index > 0) emit('prev')
  else if (e.key === 'ArrowRight' && props.index < props.total - 1) emit('next')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimers()
})

const TONE: Record<string, string> = { correct: 'ok', wrong: 'bad', premature: 'meh', ignored: 'meh', miss: 'meh', elsewhere: 'meh', cleared: 'meh' }
const dots = computed(() => props.view?.dots ?? Array.from({ length: props.total }, (_, i) => ({ id: String(i), cleared: false, pressed: false, revised: false })))
const maxPips = computed(() => Math.max(props.view?.max ?? props.persuasion, props.persuasion))
</script>

<template>
  <section class="exam glass" :class="{ holding: hold, noblur: showRecord }">
    <header class="top">
      <div class="plate" data-testid="witness-plate">
        <b>{{ witness || '证人' }}</b>
        <small v-if="view?.title">{{ view.title }}</small>
      </div>
      <div class="gauge">
        <div class="meter" data-testid="meter">
          <span>说服力</span>
          <span v-for="n in persuasion" :key="'f' + n" class="pip" data-testid="pip" />
          <span v-for="n in Math.max(0, maxPips - persuasion)" :key="'e' + n" class="pip empty" data-testid="pip-empty" />
        </div>
        <div v-if="loss" :key="loss.n" class="loss" data-testid="loss">−{{ loss.v }}</div>
        <div v-if="view" class="status" data-testid="exam-status">
          <span v-if="view.guard > 0" class="guard" data-testid="guard" title="免死：下一次答错不扣说服力">护×{{ view.guard }}</span>
          <span class="gaps" :class="{ danger: view.gaps >= view.gapLimit - 1 }" data-testid="gaps" title="手里缺证据被硬过的次数，满了就输">破绽 {{ view.gaps }}/{{ view.gapLimit }}</span>
        </div>
      </div>
    </header>

    <div class="dots" data-testid="dots">
      <button
        v-for="(d, i) in dots"
        :key="d.id"
        type="button"
        class="dot"
        :class="{ now: i === index, done: d.cleared, pressed: d.pressed, revised: d.revised }"
        :data-testid="'dot-' + i"
        :title="'第 ' + (i + 1) + ' 句' + (d.cleared ? '（已击破）' : '')"
        @click="emit('goto', i)"
      />
      <small class="count">{{ index + 1 }} / {{ total }}</small>
    </div>

    <div class="scroll" data-testid="scroll">
      <div class="card statement" :class="['phase-' + phase, { cleared: view?.cleared }]" data-testid="statement" @click="onStatementClick">
        <svg v-if="phase === 'shatter' || phase === 'crack'" class="crack" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="46,0 52,9 44,16 55,24 48,31 56,40" />
          <polyline points="52,9 66,6 78,12" />
          <polyline points="44,16 30,14 18,20" />
          <polyline points="55,24 70,27 86,25" />
        </svg>
        <div v-if="view && view.history.length" class="trail" data-testid="history">
          <p v-for="(h, i) in view.history.slice(-2)" :key="i">{{ parseMarked(h).map(s => s.text).join('') }}</p>
        </div>
        <ShatterText v-if="phase === 'shatter' && frozen" class="line" :text="frozen" :playing="true" />
        <p v-else class="line" :class="{ rise: phase === 'rise', pulse: phase === 'pulse' }" data-testid="line">
          <template v-for="(s, i) in lineParts" :key="i">
            <button
              v-if="s.mark && weak[s.mark] === 'open'"
              type="button"
              class="weak"
              :class="{ aimed: lock === s.mark }"
              :data-testid="'weak-' + s.mark"
              :disabled="hold || !lineDone"
              @click="lockOn(s.mark, s.text)"
            >{{ s.text.slice(0, s.vis) }}<span v-if="s.vis < s.text.length" class="rest">{{ s.text.slice(s.vis) }}</span></button>
            <span v-else-if="s.mark && weak[s.mark] === 'broken'" class="broken" :class="{ fresh: freshMark === s.mark }">{{ s.text.slice(0, s.vis) }}<span v-if="s.vis < s.text.length" class="rest">{{ s.text.slice(s.vis) }}</span></span>
            <template v-else>{{ s.text.slice(0, s.vis) }}<span v-if="s.vis < s.text.length" class="rest">{{ s.text.slice(s.vis) }}</span></template>
          </template>
        </p>
        <div v-if="stamped" class="stamp" :class="{ fresh: stampFresh }" data-testid="stamp">哑口无言</div>
      </div>
      <div v-if="argument" class="argument">
        <p>{{ argument.prompt }}</p>
        <button
          v-for="(o, i) in argument.options"
          :key="i"
          type="button"
          :data-testid="'option-' + i"
          :disabled="hold"
          @click="emit('choose', { stepId: argument.stepId, optionIndex: i })"
        >{{ o }}</button>
      </div>
      <p v-else-if="view && weak && Object.values(weak).includes('open')" class="aimhint" data-testid="aim-hint">红色的字是破绽。点它，再选一样证物打上去。</p>
    </div>

    <!-- What they said back. Kept outside the scrolling statement so it can never be pushed out of sight. -->
    <div v-if="lastLines.length" :key="event?.n ?? 0" class="reply" :class="(outcome && TONE[outcome]) || 'meh'" data-testid="reaction" @click="skipReplies">
      <p v-for="(l, i) in lastLines" :key="i"><b v-if="l.name">{{ l.name }}：</b><TypedText :ref="el => bindReply(i, el)" :text="l.text" :scale="0.7" :active="i === 0 || replyTyped >= i" @done="replyTyped = Math.max(replyTyped, i + 1)" /></p>
      <p v-if="event?.guarded" class="shielded">护身符挡下了这一击，说服力没有损失。</p>
    </div>

    <div class="bar">
      <button type="button" class="step" data-testid="prev" :disabled="index <= 0 || hold" @click="emit('prev')">◀ 上一句</button>
      <button type="button" class="act press" data-testid="press" :disabled="locked || hold" :title="locked ? '这一句已经没有破绽了' : ''" @click="emit('press')">
        追问<i v-if="view?.canPress" class="pip-dot" data-testid="press-hint" />
      </button>
      <button type="button" class="act present" data-testid="open-record" :disabled="locked || hold" :title="locked ? '这一句已经没有破绽了' : ''" @click="showRecord = true">出示</button>
      <button type="button" class="step" :class="{ go: view?.cleared && index < total - 1 }" data-testid="next" :disabled="index >= total - 1 || hold" @click="emit('next')">下一句 ▶</button>
    </div>

    <div v-if="showRecord" class="veil" data-testid="present-window" @click.self="showRecord = false">
      <EvidencePicker :ids="recordIds" :info="infoMap" :quotes="quotes" :folded="folded" :target="lockPhrase" @confirm="confirmPresent" @close="showRecord = false" />
    </div>
  </section>
</template>

<style scoped>
.exam { position: relative; display: flex; flex-direction: column; min-height: 0; margin: 12px; padding: 12px 16px 14px; }
.exam.holding { pointer-events: none; }

.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex: none; }
.plate { display: flex; align-items: baseline; gap: 10px; }
.plate b { padding: 2px 14px; font-size: 17px; letter-spacing: 3px; background: rgba(60, 110, 190, 0.45); border: 1px solid rgba(120, 170, 255, 0.5); border-radius: 6px; }
.plate small { color: #a99f92; font-size: 13px; }
.gauge { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.meter { display: flex; gap: 6px; align-items: center; }
.meter > span:first-child { margin-right: 4px; font-size: 14px; color: #d8cdbd; }
.pip { width: 16px; height: 16px; background: #ee8044; border-radius: 4px; box-shadow: 0 0 8px #ee804488; transition: transform 0.2s; }
.pip.empty { background: transparent; border: 1px solid rgba(238, 128, 68, 0.45); box-shadow: none; }
.status { display: flex; gap: 10px; font-size: 12px; color: #a99f92; }
.guard { color: #8fd0ff; }
.gaps.danger { color: #ff8a7a; }
.loss { position: absolute; right: 0; top: -2px; font-size: 22px; font-weight: 700; color: #ff5a4f; text-shadow: 0 0 10px #ff5a4f88; pointer-events: none; animation: lossfloat 1.3s ease-out forwards; }
@keyframes lossfloat { 0% { opacity: 0; transform: translateY(6px) scale(1.4); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-26px) scale(1); } }

.dots { display: flex; align-items: center; gap: 7px; flex: none; margin: 10px 0 2px; }
.dot { width: 14px; height: 14px; padding: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.35); }
.dot.pressed { border-color: #6fb3ff; }
.dot.revised { box-shadow: 0 0 0 2px rgba(232, 160, 112, 0.7); }
.dot.done { background: #6aa86a; border-color: #6aa86a; }
.dot.now { transform: scale(1.35); border-color: #fff; }
.count { margin-left: 6px; color: #a99f92; }

.scroll { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding: 2px 6px 2px 0; }
.card { position: relative; margin: 10px 0; padding: 16px 20px; overflow: hidden; background: rgba(40, 70, 130, 0.3); border-left: 5px solid #4aa3ff; border-radius: 10px; transition: background 0.4s, filter 0.4s; }
.card.cleared { filter: saturate(0.25) brightness(0.85); border-left-color: #6aa86a; }
.line { margin: 0; font-size: 21px; line-height: 1.85; white-space: pre-line; }
.rest { visibility: hidden; }
.line.rise { animation: rise 0.65s cubic-bezier(0.2, 0.8, 0.3, 1); }
.line.pulse { animation: pulse 0.8s ease-out; }
.card.phase-hurt { animation: hurt 0.5s ease-out; background: rgba(190, 60, 50, 0.38); }
.card.phase-pulse { box-shadow: 0 0 0 3px rgba(106, 179, 255, 0.55), 0 0 28px rgba(106, 179, 255, 0.45); }
.trail { margin-bottom: 6px; }
.trail p { margin: 0; font-size: 14px; color: #8d8478; text-decoration: line-through; text-decoration-color: rgba(255, 90, 79, 0.6); }

.weak { display: inline; padding: 0 3px; margin: 0 1px; font: inherit; font-weight: 700; color: #ff6b5e; background: rgba(255, 90, 79, 0.14); border: none; border-bottom: 2px solid #ff5a4f; border-radius: 3px; cursor: pointer; text-shadow: 0 0 10px rgba(255, 90, 79, 0.65); animation: tremble 0.14s steps(2) infinite, throb 1.6s ease-in-out infinite; }
.weak:hover:not(:disabled), .weak.aimed { color: #fff; background: #d8382d; box-shadow: 0 0 16px rgba(255, 90, 79, 0.85); animation: throb 0.8s ease-in-out infinite; }
.broken { padding: 0 3px; color: #8d8478; text-decoration: line-through; text-decoration-color: #6aa86a; }
.broken.fresh { animation: cracked 0.9s ease-out; color: #ff6b5e; }

.crack { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
.crack polyline { fill: none; stroke: #fff; stroke-width: 0.7; stroke-linecap: round; filter: drop-shadow(0 0 2px #ff9a8c); stroke-dasharray: 60; stroke-dashoffset: 60; animation: draw 0.28s ease-out forwards; }

.stamp { position: absolute; right: 18px; bottom: 8px; padding: 2px 16px; font-size: 26px; font-weight: 800; letter-spacing: 6px; color: #7be07b; border: 3px solid #7be07b; border-radius: 6px; transform: rotate(-9deg); opacity: 0.9; pointer-events: none; }
.stamp.fresh { animation: stamp 0.5s cubic-bezier(0.2, 1.4, 0.4, 1); }

.argument { margin: 10px 0; }
.argument button { display: block; width: 100%; margin: 6px 0; text-align: left; padding: 10px 14px; }
.aimhint { margin: 4px 2px; font-size: 13px; color: #ffb4a8; }

.reply { flex: none; max-height: 24vh; overflow-y: auto; margin-top: 10px; padding: 10px 14px; border-radius: 10px; border-left: 4px solid; animation: shake 0.35s ease-out; }
.reply p { margin: 2px 0; font-size: 17px; line-height: 1.7; }
.reply b { color: var(--accent); }
.reply .shielded { font-size: 14px; color: #8fd0ff; }
.reply.ok { background: rgba(80, 160, 90, 0.2); border-color: #6aa86a; animation: none; }
.reply.bad { background: rgba(190, 70, 60, 0.26); border-color: #e5484d; }
.reply.meh { background: rgba(255, 255, 255, 0.08); border-color: #bdb3a6; animation: none; }

.bar { display: flex; gap: 10px; flex: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-line); }
.bar .step { flex: none; padding: 8px 14px; font-size: 14px; }
.bar .step.go { border-color: #7be07b; color: #fff; background: rgba(106, 168, 106, 0.35); animation: nudge 1.1s ease-in-out infinite; }
.bar .act { position: relative; flex: 1 1 0; padding: 10px; font-size: 18px; letter-spacing: 8px; }
.bar .press { border-color: rgba(111, 179, 255, 0.7); }
.bar .present { border-color: rgba(232, 160, 112, 0.8); background: rgba(200, 80, 30, 0.35); }
.bar button:disabled { opacity: 0.4; cursor: default; }
.pip-dot { position: absolute; right: 12px; top: 8px; width: 9px; height: 9px; border-radius: 50%; background: #6fb3ff; box-shadow: 0 0 8px #6fb3ff; }

/* A backdrop-filter makes the panel the containing block of fixed descendants: with it on, the evidence window below was
   laid out inside (and clipped by) the panel instead of the screen. The window's own veil covers the panel anyway. */
.exam.noblur { backdrop-filter: none; -webkit-backdrop-filter: none; }
.veil { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); }

@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
@keyframes hurt { 0%, 100% { transform: translateX(0); } 15% { transform: translateX(-10px); } 35% { transform: translateX(9px); } 55% { transform: translateX(-6px); } 75% { transform: translateX(4px); } }
@keyframes tremble { 0% { transform: translate(0, 0); } 50% { transform: translate(0.6px, -0.5px); } }
@keyframes throb { 0%, 100% { background: rgba(255, 90, 79, 0.12); } 50% { background: rgba(255, 90, 79, 0.3); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes rise { 0% { opacity: 0; transform: translateY(26px) scale(0.97); } 100% { opacity: 1; transform: none; } }
@keyframes pulse { 0% { opacity: 0.4; transform: translateY(8px); } 100% { opacity: 1; transform: none; } }
@keyframes cracked { 0% { transform: scale(1.7); text-shadow: 0 0 18px #fff; } 100% { transform: none; text-shadow: none; } }
@keyframes stamp { 0% { opacity: 0; transform: rotate(-9deg) scale(2.6); } 60% { opacity: 1; transform: rotate(-9deg) scale(0.92); } 100% { transform: rotate(-9deg) scale(1); } }
@keyframes nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(4px); } }

@media (prefers-reduced-motion: reduce) {
  .weak, .reply, .card.phase-hurt, .bar .step.go, .line.rise, .line.pulse, .broken.fresh, .stamp.fresh, .loss { animation: none; }
  .crack polyline { animation: none; stroke-dashoffset: 0; }
}
</style>
