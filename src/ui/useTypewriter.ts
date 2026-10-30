import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { SPEED_MS, charDelay, textSpeed } from '../engine/textSpeed'

export interface TypewriterOptions {
  scale?: number
  active?: Ref<boolean>
}

export interface Typewriter {
  count: Ref<number>
  done: ComputedRef<boolean>
  skip: () => void
}

// Reveals `text` one character at a time. While `active` is false it holds at the start, so lines can follow one another.
export function useTypewriter(text: Ref<string>, opts: TypewriterOptions = {}): Typewriter {
  const scale = opts.scale ?? 1
  const count = ref(0)
  const done = computed(() => count.value >= text.value.length)
  let timer: ReturnType<typeof setTimeout> | null = null

  const isActive = (): boolean => (opts.active ? opts.active.value : true)
  const base = (): number => SPEED_MS[textSpeed.value] * scale

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function finish(): void {
    clearTimer()
    count.value = text.value.length
  }

  function schedule(): void {
    clearTimer()
    if (!isActive()) return
    const len = text.value.length
    if (count.value >= len) return
    const b = base()
    if (b <= 0) {
      count.value = len
      return
    }
    // The pause belongs to the character just shown, not the one coming next.
    const justShown = count.value > 0 ? text.value[count.value - 1] : ''
    const wait = justShown ? charDelay(justShown, b) : b
    timer = setTimeout(() => {
      timer = null
      if (!isActive()) return
      count.value = Math.min(text.value.length, count.value + 1)
      schedule()
    }, wait)
  }

  watch(text, (next, prev) => {
    const old = prev ?? ''
    // A line that was appended to (a statement after a press) picks up where it left off; anything else starts over.
    if (count.value <= old.length && next.startsWith(old)) count.value = Math.min(count.value, next.length)
    else count.value = 0
    schedule()
  }, { immediate: true })

  if (opts.active) {
    watch(opts.active, on => {
      if (on) schedule()
      else {
        clearTimer()
        count.value = 0
      }
    })
  }

  onBeforeUnmount(clearTimer)

  return { count, done, skip: finish }
}
