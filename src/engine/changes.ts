import type { GameState, NpcId } from './types'

export type Change =
  | { kind: 'affinity'; npc: NpcId; delta: number }
  | { kind: 'trust' | 'hp' | 'danger' | 'money'; delta: number }

export interface Snapshot {
  affinity: Record<string, number>
  trust: number
  hp: number
  danger: number
  money: number
}

export function snapshot(s: GameState): Snapshot {
  return { affinity: { ...s.affinity }, trust: s.trust, hp: s.hp, danger: s.danger, money: s.money }
}

// What the player should be told moved. Evidence and flags are not listed: finding things is its own feedback.
export function diffState(a: Snapshot, b: Snapshot): Change[] {
  const out: Change[] = []
  for (const npc of Object.keys(b.affinity).sort()) {
    const delta = b.affinity[npc] - (a.affinity[npc] ?? 0)
    if (delta) out.push({ kind: 'affinity', npc: npc as NpcId, delta })
  }
  for (const kind of ['trust', 'hp', 'danger', 'money'] as const) {
    const delta = b[kind] - a[kind]
    if (delta) out.push({ kind, delta })
  }
  return out
}
