import list from '../data/backgrounds.json'

export type TimeOfDay = 'night' | 'day'

const files = import.meta.glob('../assets/backgrounds/*.{webp,jpg,jpeg,png,svg}', { eager: true, import: 'default' }) as Record<string, string>

// Real artwork wins over any vector placeholder with the same name.
const PREFERENCE = ['webp', 'jpg', 'jpeg', 'png', 'svg']

function find(stem: string): string | null {
  for (const ext of PREFERENCE) {
    const hit = files[`../assets/backgrounds/${stem}.${ext}`]
    if (hit) return hit
  }
  return null
}

// `<id>.webp` is the night version (default), `<id>_day.webp` the daytime one; either falls back to the other.
export function resolveBackground(id: string, time: TimeOfDay = 'night'): string | null {
  if (!list.some(b => b.id === id)) return null
  const first = time === 'day' ? `${id}_day` : id
  const second = time === 'day' ? id : `${id}_day`
  return find(first) ?? find(second)
}

// 18:00 – 05:59 counts as night.
export function timeOfDay(hour: number): TimeOfDay {
  return hour >= 18 || hour < 6 ? 'night' : 'day'
}
