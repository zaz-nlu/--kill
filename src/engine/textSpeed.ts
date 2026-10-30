import { ref } from 'vue'

// How fast dialogue types itself out. Milliseconds per character; punctuation pauses are multiples of that.
export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant'

export const SPEED_MS: Record<TextSpeed, number> = { slow: 55, normal: 32, fast: 14, instant: 0 }
export const SPEED_LABEL: Record<TextSpeed, string> = { slow: '慢', normal: '中', fast: '快', instant: '瞬间' }

const SAVE_KEY = 'jiudian-text'
const ORDER: TextSpeed[] = ['slow', 'normal', 'fast', 'instant']

// A pause after a character: a beat at a comma, a longer one at the end of a sentence.
const COMMA = new Set(['，', '、', '；', '：', ',', ';', ':'])
const STOP = new Set(['。', '？', '！', '…', '.', '?', '!'])

export function charDelay(ch: string, base: number): number {
  if (STOP.has(ch)) return base * 6
  if (COMMA.has(ch)) return base * 3
  return base
}

function readSaved(): TextSpeed | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as string
      if ((ORDER as string[]).includes(v)) return v as TextSpeed
    }
  } catch { /* blocked storage: fall through */ }
  return null
}

function persist(s: TextSpeed): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)) } catch { /* blocked storage */ }
}

// Tests hold pages still: unless they ask otherwise, text is already there.
const initial: TextSpeed = import.meta.env.MODE === 'test' ? 'instant' : (readSaved() ?? 'normal')
export const textSpeed = ref<TextSpeed>(initial)

export function setTextSpeed(s: TextSpeed): void {
  textSpeed.value = s
  persist(s)
}

export function cycleTextSpeed(): TextSpeed {
  const next = ORDER[(ORDER.indexOf(textSpeed.value) + 1) % ORDER.length]
  setTextSpeed(next)
  return next
}
