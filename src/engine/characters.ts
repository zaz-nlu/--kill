import manifest from '../data/characters.json'

const files = import.meta.glob('../assets/characters/**/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const faces = manifest as Record<string, Record<string, string>>

// When a character has no art for the requested expression, try the closest one, then 'normal'.
const ALIASES: Record<string, string[]> = {
  panic: ['nervous'],
  nervous: ['panic', 'guilty'],
  sad: ['guilty'],
  guilty: ['nervous'],
  sneer: ['angry'],
  impatient: ['normal'],
  memory: ['normal'],
}

export interface Sprite { src: string; expr: string }

export function hasArt(id: string): boolean {
  return id in faces
}

export function resolveSprite(id: string, expr = 'normal'): Sprite | null {
  const set = faces[id]
  if (!set) return null
  for (const e of [expr, ...(ALIASES[expr] ?? []), 'normal']) {
    const path = set[e]
    const src = path ? files['../assets/' + path] : undefined
    if (src) return { src, expr: e }
  }
  return null
}
