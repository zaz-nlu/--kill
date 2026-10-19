export type NpcId =
  | 'boss' | 'mengyao' | 'suwen' | 'zhengcen' | 'shaoxy' | 'lucheng'
  | 'limo' | 'laohan' | 'xiaoxu' | 'laowang' | 'tang'
export type Speaker = NpcId | 'lyc' | 'songyan' | 'narration'
export type IntelId = 'phone' | 'draft' | 'trophy' | 'card' | 'attack'
export type IntelStatus = 'unknown' | 'clean' | 'leaked'

export interface Line { speaker: Speaker; text: string; tag?: string }
export interface LogLine extends Line { id: string; day: number; hour: number }

export type LeakTrigger =
  | 'lunchTellAll' | 'groupPost' | 'coffeeTellAll' | 'tellAllToLimo'
  | { toNpc: NpcId; intel: IntelId[] }

export type Condition =
  | { kind: 'intelClean'; intel: IntelId }
  | { kind: 'affinityAtLeast'; npc: NpcId; value: number }
  | { kind: 'hasEvidence'; id: string }
  | { kind: 'hasTestimony'; id: string }
  | { kind: 'not'; cond: Condition }

export type Effect =
  | { kind: 'affinity'; npc: NpcId; delta: number }
  | { kind: 'trust' | 'money' | 'danger' | 'hp'; delta: number }
  | { kind: 'evidence' | 'testimony'; id: string }
  | { kind: 'learnIntel'; intel: IntelId }
  | { kind: 'flag'; key: string; value: boolean }

export interface Item { id: string; name: string; price: number }
export interface Npc {
  id: NpcId
  name: string
  giftable: boolean
  favorite?: string
  minefield?: string[]
}

export interface GameState {
  version: 1
  day: number
  hour: number
  money: number
  hp: number
  danger: number
  trust: number
  affinity: Record<NpcId, number>
  evidence: string[]
  testimony: string[]
  flags: Record<string, boolean>
  intel: Record<IntelId, IntelStatus>
  backlog: LogLine[]
  notes: string[]                      // LogLine.id
  inventory: Record<string, number>    // item id -> count
  shopItemsLeft: number
  giftsGiven: Record<string, string[]> // NpcId -> item ids already given
  giftedToday: NpcId[]
}
