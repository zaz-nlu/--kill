export type NpcId =
  | 'boss' | 'mengyao' | 'suwen' | 'zhengcen' | 'shaoxy' | 'lucheng'
  | 'limo' | 'laohan' | 'xiaoxu' | 'laowang' | 'tang' | 'laoliu'
export type Speaker = NpcId | 'lyc' | 'songyan' | 'narration'
export type IntelId = 'phone' | 'draft' | 'trophy' | 'card' | 'attack'
export type IntelStatus = 'unknown' | 'clean' | 'leaked'

export interface Line { speaker: Speaker; text: string; tag?: string; expr?: string }
export interface LogLine extends Line { id: string; day: number; hour: number }

export type LeakTrigger =
  | 'lunchTellAll' | 'groupPost' | 'coffeeTellAll' | 'tellAllToLimo'
  | { toNpc: NpcId; intel: IntelId[] }

export type Condition =
  | { kind: 'intelClean'; intel: IntelId }
  | { kind: 'affinityAtLeast'; npc: NpcId; value: number }
  | { kind: 'hasEvidence'; id: string }
  | { kind: 'hasTestimony'; id: string }
  | { kind: 'flag'; key: string }
  | { kind: 'gaveGift'; npc: NpcId; item: string }
  | { kind: 'trustAtLeast'; value: number }
  | { kind: 'dangerAtLeast'; value: number }
  | { kind: 'affinityTier'; npc: NpcId; tier: 'open' | 'guarded' | 'closed' }
  | { kind: 'any'; conds: Condition[] }      // at least one of them
  | { kind: 'not'; cond: Condition }

export type Effect =
  | { kind: 'affinity'; npc: NpcId; delta: number }
  | { kind: 'trust' | 'money' | 'danger' | 'hp'; delta: number }
  | { kind: 'evidence' | 'testimony'; id: string }
  | { kind: 'learnIntel'; intel: IntelId }
  | { kind: 'flag'; key: string; value: boolean }
  | { kind: 'time'; hour: number }          // jump the clock forward to this hour
  | { kind: 'persuasion'; delta: number }   // finale persuasion, carried from act to act

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
  persuasionLoss: number               // finale persuasion spent so far (negative = won back)
  examGaps?: number                    // finale steps passed over for want of evidence, over all acts (old saves: absent)
}

// What a step does to the line it is about once it lands: `revise` replaces the whole line with the witness's corrected
// version, `append` adds a sentence after it. Both may carry weak points, written {{id:phrase}} (see markup.ts); a present
// step's `target` names the weak point it breaks.
export interface StepEffect { revise?: string; append?: string }

export type Step =
  | ({ kind: 'present'; id: string; accepts: string[]; after?: string[]; required?: boolean; reply: Line[]; bonus?: number;
      replyFor?: Record<string, Line[]>;          // when the presented id has an entry here, use it instead of reply
      target?: string } & StepEffect)
  | ({ kind: 'press'; id: string; after?: string[]; required?: boolean; reply: Line[] } & StepEffect)
  | ({ kind: 'argument'; id: string; after?: string[]; required?: boolean; prompt: string;
      options: { text: string; correct: boolean; reply: Line[] }[] } & StepEffect)

export interface Statement {
  id: string
  text: string
  steps: Step[]
  anyOf?: string[]   // the statement also needs at least one of these steps done
}

export interface ExamDef {
  id: string
  title: string
  startPersuasion: number
  statements: Statement[]
  wrongReply: Line[]
  wrongReplies?: Line[][]       // taken in turn: the witness and the detective can both lose patience
  prematureReplies?: Line[][]   // right item, wrong moment: answered, no penalty
  repeatReplies?: Line[][]      // the same item shown twice: answered, no penalty
  missReplies?: Line[][]        // a useful item aimed at the wrong weak point of the line: answered, no penalty
  elsewhereReplies?: Line[][]   // a useful item, but for another line of this act: answered, no penalty
  pressReplies?: Line[][]       // pressing a line that has nothing more to give
  clearedReplies?: Line[][]     // anything tried on a line that is already settled
  intro?: string
  onClear?: string
}
