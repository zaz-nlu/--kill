import { forcedCount } from './deduction'
import type { ExamDef, GameState, Line, Step } from './types'
import { noticedSlip } from './log'
import { parseMarked } from './markup'

export interface ExamState {
  def: ExamDef
  persuasion: number
  done: Record<string, string[]>   // statementId -> completed stepIds
  failed: boolean
  cleared: boolean
  waived: string[]                 // any-of statements nobody could answer: let through, once, at a cost
  gaps: number                     // steps passed over in this exam for want of evidence
  priorGaps: number                // gaps carried over from the earlier acts
  wrongs: number                   // how many wrong presentations so far (picks the next reply in turn)
  bluffs: number                   // how many too-early, repeated or misdirected presentations so far
  guard: number                    // mistakes still to be shrugged off (earned in the investigation); gaps are never covered
  pressed: string[]                // lines pressed at least once
  stuck?: Record<string, number>   // statementId -> failed presentations in a row on that line (drives Lao Han's nudge)
}

// 'miss': a useful item aimed at the wrong weak point; 'elsewhere': useful, but for another line; 'cleared': the line is
// already settled. None of the three costs anything.
export type Outcome = 'correct' | 'wrong' | 'premature' | 'ignored' | 'miss' | 'elsewhere' | 'cleared'

export interface ExamResult {
  outcome: Outcome
  stepId?: string
  lines: Line[]
  persuasion: number
  statementCleared: boolean
  examCleared: boolean
  failed: boolean
  guarded?: boolean   // a mistake that the guard absorbed
  revised?: boolean   // the step rewrote its line (the line shatters, a new one takes its place)
  target?: string     // the weak point that was broken
  stuck?: number      // failed presentations in a row on this line, after this one
}

// Evidence you never found is not forgiven lightly: each step passed over costs this much persuasion…
export const GAP_COST = 2
// …and this many gaps over the whole finale end it (BAD END 2).
export const GAP_LIMIT = 3

// Every act of the finale starts afresh with this much persuasion: what the last act cost is not carried over. Only what a
// scene takes away or gives back (`persuasionLoss`, see effects.ts) and the conclusions forced in the reasoning count.
export const EXAM_START = 8
// A presentation can win some back, but never past this.
export const EXAM_CAP = EXAM_START + 1

export function computePersuasion(state: GameState): number {
  return Math.min(EXAM_CAP, EXAM_START - (state.persuasionLoss ?? 0)) - forcedCount(state)
}

// …and the two things that used to add to it now each cover one mistake.
export function computeGuard(state: GameState): number {
  return (state.flags.challengeAllCorrect ? 1 : 0) + (noticedSlip(state) ? 1 : 0)
}

function isRequired(step: Step): boolean {
  return step.required ?? step.kind !== 'press'
}

function statementOf(exam: ExamState, statementId: string) {
  return exam.def.statements.find(s => s.id === statementId)
}

export function isStatementCleared(exam: ExamState, statementId: string): boolean {
  return statementCleared(exam, statementId)
}

function statementCleared(exam: ExamState, statementId: string): boolean {
  const st = statementOf(exam, statementId)
  if (!st) return false
  const done = exam.done[statementId] ?? []
  if (st.anyOf && !st.anyOf.some(id => done.includes(id)) && !exam.waived.includes(statementId)) return false
  return st.steps.every(s => !isRequired(s) || done.includes(s.id))
}

function allCleared(exam: ExamState): boolean {
  return exam.def.statements.every(s => statementCleared(exam, s.id))
}

export function startExam(def: ExamDef, persuasion: number, priorGaps = 0, guard = 0): ExamState {
  const exam: ExamState = {
    def,
    persuasion,
    done: Object.fromEntries(def.statements.map(s => [s.id, [] as string[]])),
    failed: false,
    cleared: false,
    waived: [],
    gaps: 0,
    priorGaps,
    wrongs: 0,
    bluffs: 0,
    guard,
    pressed: [],
  }
  exam.cleared = allCleared(exam)
  return exam
}

export function availableSteps(exam: ExamState, statementId: string): Step[] {
  const st = statementOf(exam, statementId)
  if (!st) return []
  const done = exam.done[statementId] ?? []
  return st.steps.filter(s => !done.includes(s.id) && (s.after ?? []).every(a => done.includes(a)))
}

function result(exam: ExamState, statementId: string, outcome: Outcome, lines: Line[], stepId?: string, extra: Partial<ExamResult> = {}): ExamResult {
  return {
    outcome,
    stepId,
    lines,
    persuasion: exam.persuasion,
    statementCleared: statementCleared(exam, statementId),
    examCleared: exam.cleared,
    failed: exam.failed,
    ...extra,
  }
}

function finished(exam: ExamState): boolean {
  return exam.failed || exam.cleared
}

// A line the player cannot crack keeps a tally; breaking it wipes the tally. Returns the new value when it changed in a
// way the caller should report.
function trackStuck(exam: ExamState, statementId: string, outcome: Outcome): number | undefined {
  if (outcome === 'wrong' || outcome === 'miss' || outcome === 'elsewhere' || outcome === 'premature') {
    const stuck = exam.stuck ?? (exam.stuck = {})
    stuck[statementId] = (stuck[statementId] ?? 0) + 1
    return stuck[statementId]
  }
  if (outcome === 'correct') {
    if (exam.stuck) exam.stuck[statementId] = 0
  }
  return undefined
}

function complete(exam: ExamState, statementId: string, stepId: string): void {
  exam.done[statementId].push(stepId)
  exam.cleared = allCleared(exam)
}

// Returns true when the guard took the blow instead.
function penalize(exam: ExamState, n = 1, guardable = false): boolean {
  if (guardable && exam.guard > 0) {
    exam.guard -= 1
    return true
  }
  exam.persuasion = Math.max(0, exam.persuasion - n)
  if (exam.persuasion === 0) exam.failed = true
  return false
}

function gap(exam: ExamState): void {
  exam.gaps += 1
  penalize(exam, GAP_COST)
  if (exam.priorGaps + exam.gaps >= GAP_LIMIT) exam.failed = true
}

// Replies are taken in turn, so repeated mistakes are answered by different voices and lines.
function inTurn(lists: Line[][] | undefined, n: number, fallback: Line[] = []): Line[] {
  return lists && lists.length > 0 ? lists[n % lists.length] : fallback
}

const say = (text: string): Line[][] => [[{ speaker: 'narration', text }]]
// What is said when the act's own data has nothing better to offer.
const DEFAULT_REPLIES = {
  miss: say('东西没拿错，可打的不是这一处。再看看这句话里，到底哪个地方站不住脚。'),
  elsewhere: say('这件东西是有用的，但不是用在这一句上。'),
  press: say('你追问了几句，对方一口咬定，没有再多说什么。'),
  cleared: say('这一句已经没有破绽了，去看看别的证词。'),
}

function isRewrite(step: Step): boolean {
  return Boolean(step.revise || step.append)
}

// A line that asks for nothing (a plain opening statement) is never "settled": there is nothing to be struck dumb about.
export function isSettleable(exam: ExamState, statementId: string): boolean {
  const st = statementOf(exam, statementId)
  return Boolean(st && (st.anyOf || st.steps.some(isRequired)))
}

// Showing the line: the witness has been taken apart a piece at a time, so what is on screen is the original with every
// landed step's rewrite applied, in the order they landed. `history` holds what was replaced (oldest first).
export interface StatementView { text: string; history: string[] }

export function statementView(exam: ExamState, statementId: string): StatementView {
  const st = statementOf(exam, statementId)
  if (!st) return { text: '', history: [] }
  let text = st.text
  const history: string[] = []
  for (const id of exam.done[statementId] ?? []) {
    const s = st.steps.find(x => x.id === id)
    if (!s) continue
    if (s.revise) {
      history.push(text)
      text = s.revise
    }
    if (s.append) text = `${text}\n${s.append}`
  }
  return { text, history }
}

// The weak points showing in the line now: 'open' ones can be attacked, 'broken' ones already were. A point whose turn
// has not come yet is not shown at all.
export function weakPoints(exam: ExamState, statementId: string): Record<string, 'open' | 'broken'> {
  const st = statementOf(exam, statementId)
  if (!st) return {}
  const done = exam.done[statementId] ?? []
  const open = availableSteps(exam, statementId)
  const out: Record<string, 'open' | 'broken'> = {}
  for (const seg of parseMarked(statementView(exam, statementId).text)) {
    if (!seg.mark) continue
    // several steps may break the same point (each with its own evidence): it stays open until none of them is left
    const steps = st.steps.filter(s => s.kind === 'present' && s.target === seg.mark)
    if (steps.some(s => open.some(o => o.id === s.id))) out[seg.mark] = 'open'
    else if (steps.some(s => done.includes(s.id))) out[seg.mark] = 'broken'
  }
  return out
}

export function canPress(exam: ExamState, statementId: string): boolean {
  return availableSteps(exam, statementId).some(s => s.kind === 'press')
}

export function wasPressed(exam: ExamState, statementId: string): boolean {
  const st = statementOf(exam, statementId)
  const done = exam.done[statementId] ?? []
  return exam.pressed.includes(statementId) || Boolean(st?.steps.some(s => s.kind === 'press' && done.includes(s.id)))
}

// `target` is the weak point the player clicked before choosing the item (if they did). Aimed at one, the item has to be
// the one that breaks it; aimed at nothing, it is tried against whatever the line has open.
// `alias` is what a conclusion card folds into: the card is accepted wherever any of those pieces would be.
export function present(exam: ExamState, statementId: string, itemId: string, owned: string[], target?: string, alias?: string[]): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId) || !owned.includes(itemId)) {
    return result(exam, statementId, 'ignored', [])
  }
  const ids = [itemId, ...(alias ?? [])]
  const st = statementOf(exam, statementId)!
  const done = exam.done[statementId]
  const accepting = (s: Step) => s.kind === 'present' && s.accepts.some(a => ids.includes(a))
  // Every answer that comes back from this line updates the tally before it is handed out.
  const withStuck = (r: ExamResult): ExamResult => {
    const n = trackStuck(exam, statementId, r.outcome)
    return n === undefined ? r : { ...r, stuck: n }
  }

  const open = availableSteps(exam, statementId)
  const aimedAt = target ? open.filter(s => s.kind === 'present' && s.target === target) : []
  const aimed = aimedAt.length > 0
  const hit = aimed ? aimedAt.find(accepting) : open.find(accepting)
  if (hit && hit.kind === 'present') {
    complete(exam, statementId, hit.id)
    if (hit.bonus) exam.persuasion = Math.min(EXAM_CAP, exam.persuasion + hit.bonus)
    // the reply follows the piece that actually broke the point, not the card that stood for it
    const matched = hit.accepts.includes(itemId) ? itemId : ids.find(id => hit.accepts.includes(id)) ?? itemId
    return withStuck(result(exam, statementId, 'correct', hit.replyFor?.[matched] ?? hit.reply, hit.id, { revised: isRewrite(hit), target: hit.target }))
  }
  if (statementCleared(exam, statementId)) {
    return withStuck(result(exam, statementId, 'cleared', inTurn(exam.def.clearedReplies ?? DEFAULT_REPLIES.cleared, exam.bluffs++)))
  }
  if (aimed && open.some(s => !aimedAt.includes(s) && accepting(s))) {
    return withStuck(result(exam, statementId, 'miss', inTurn(exam.def.missReplies ?? DEFAULT_REPLIES.miss, exam.bluffs++)))
  }
  if (st.steps.some(s => accepting(s) && done.includes(s.id))) {
    return withStuck(result(exam, statementId, 'ignored', inTurn(exam.def.repeatReplies, exam.bluffs++)))
  }
  if (st.steps.some(accepting)) {
    return withStuck(result(exam, statementId, 'premature', inTurn(exam.def.prematureReplies, exam.bluffs++)))
  }
  if (exam.def.statements.some(o => o.id !== statementId && o.steps.some(accepting))) {
    return withStuck(result(exam, statementId, 'elsewhere', inTurn(exam.def.elsewhereReplies ?? DEFAULT_REPLIES.elsewhere, exam.bluffs++)))
  }
  const guarded = penalize(exam, 1, true)
  return withStuck(result(exam, statementId, 'wrong', inTurn(exam.def.wrongReplies, exam.wrongs++, exam.def.wrongReply), undefined, { guarded }))
}

export function press(exam: ExamState, statementId: string): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId)) return result(exam, statementId, 'ignored', [])
  if (!exam.pressed.includes(statementId)) exam.pressed.push(statementId)
  const hit = availableSteps(exam, statementId).find(s => s.kind === 'press')
  if (hit) {
    complete(exam, statementId, hit.id)
    return result(exam, statementId, 'correct', hit.kind === 'press' ? hit.reply : [], hit.id, { revised: isRewrite(hit) })
  }
  if (statementCleared(exam, statementId)) {
    return result(exam, statementId, 'cleared', inTurn(exam.def.clearedReplies ?? DEFAULT_REPLIES.cleared, exam.bluffs++))
  }
  // Nothing more to get out of it, but pressing always gets an answer.
  return result(exam, statementId, 'ignored', inTurn(exam.def.pressReplies ?? DEFAULT_REPLIES.press, exam.bluffs++))
}

export function chooseOption(exam: ExamState, statementId: string, stepId: string, optionIndex: number): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId)) return result(exam, statementId, 'ignored', [])
  const step = availableSteps(exam, statementId).find(s => s.id === stepId)
  if (!step || step.kind !== 'argument') return result(exam, statementId, 'ignored', [])
  const opt = step.options[optionIndex]
  if (!opt) return result(exam, statementId, 'ignored', [])
  if (opt.correct) {
    complete(exam, statementId, step.id)
    return result(exam, statementId, 'correct', opt.reply, step.id, { revised: isRewrite(step) })
  }
  const guarded = penalize(exam, 1, true)
  return result(exam, statementId, 'wrong', opt.reply, step.id, { guarded })
}

// Nobody is left stuck for want of evidence, but missing it hurts. A step that asks for something you never found is
// passed over at the cost of GAP_COST persuasion and counts as a gap; GAP_LIMIT gaps lose the finale. An any-of statement
// none of whose routes you could walk is let through once, at the same price.
// Only steps whose turn has come are touched, so the order of the argument is kept. Returns the steps passed over.
export function skipUnreachable(exam: ExamState, owned: string[]): string[] {
  const skipped: string[] = []
  const holds = (s: Step) => s.kind !== 'present' || s.accepts.some(a => owned.includes(a))
  for (const st of exam.def.statements) {
    const byId = new Map(st.steps.map(s => [s.id, s]))
    const feasible = (s: Step): boolean => holds(s) && (s.after ?? []).every(a => {
      const dep = byId.get(a)
      return !dep || (exam.done[st.id] ?? []).includes(a) || feasible(dep)
    })
    let again = true
    while (again && !exam.failed) {
      again = false
      for (const s of st.steps) {
        const done = exam.done[st.id]
        if (done.includes(s.id) || !isRequired(s) || holds(s)) continue
        if (!(s.after ?? []).every(a => done.includes(a))) continue
        complete(exam, st.id, s.id)
        gap(exam)
        skipped.push(s.id)
        again = true
      }
    }
    if (st.anyOf && !exam.failed && !exam.waived.includes(st.id)) {
      const done = exam.done[st.id]
      if (!st.anyOf.some(id => done.includes(id)) && !st.anyOf.some(id => { const s = byId.get(id); return s ? feasible(s) : false })) {
        exam.waived.push(st.id)
        gap(exam)
        skipped.push(st.id)
      }
    }
  }
  exam.cleared = allCleared(exam)
  return skipped
}
