import { forcedCount } from './deduction'
import type { ExamDef, GameState, Line, Step } from './types'
import { noticedSlip } from './log'

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
  bluffs: number                   // how many too-early or repeated presentations so far
}

export type Outcome = 'correct' | 'wrong' | 'premature' | 'ignored'

export interface ExamResult {
  outcome: Outcome
  stepId?: string
  lines: Line[]
  persuasion: number
  statementCleared: boolean
  examCleared: boolean
  failed: boolean
}

// Evidence you never found is not forgiven lightly: each step passed over costs this much persuasion…
export const GAP_COST = 2
// …and this many gaps over the whole finale end it (BAD END 2).
export const GAP_LIMIT = 3

export function computePersuasion(state: GameState): number {
  let p = 5
  if (state.flags.challengeAllCorrect) p += 1
  if (noticedSlip(state)) p += 1
  return Math.min(7, p - (state.persuasionLoss ?? 0)) - forcedCount(state)
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

export function startExam(def: ExamDef, persuasion: number, priorGaps = 0): ExamState {
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

function result(exam: ExamState, statementId: string, outcome: Outcome, lines: Line[], stepId?: string): ExamResult {
  return {
    outcome,
    stepId,
    lines,
    persuasion: exam.persuasion,
    statementCleared: statementCleared(exam, statementId),
    examCleared: exam.cleared,
    failed: exam.failed,
  }
}

function finished(exam: ExamState): boolean {
  return exam.failed || exam.cleared
}

function complete(exam: ExamState, statementId: string, stepId: string): void {
  exam.done[statementId].push(stepId)
  exam.cleared = allCleared(exam)
}

function penalize(exam: ExamState, n = 1): void {
  exam.persuasion = Math.max(0, exam.persuasion - n)
  if (exam.persuasion === 0) exam.failed = true
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

export function present(exam: ExamState, statementId: string, itemId: string, owned: string[]): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId) || !owned.includes(itemId)) {
    return result(exam, statementId, 'ignored', [])
  }
  const st = statementOf(exam, statementId)!
  const done = exam.done[statementId]
  const accepting = (s: Step) => s.kind === 'present' && s.accepts.includes(itemId)

  const hit = availableSteps(exam, statementId).find(accepting)
  if (hit && hit.kind === 'present') {
    complete(exam, statementId, hit.id)
    if (hit.bonus) exam.persuasion = Math.min(7, exam.persuasion + hit.bonus)
    return result(exam, statementId, 'correct', hit.replyFor?.[itemId] ?? hit.reply, hit.id)
  }
  if (st.steps.some(s => accepting(s) && done.includes(s.id))) {
    return result(exam, statementId, 'ignored', inTurn(exam.def.repeatReplies, exam.bluffs++))
  }
  if (st.steps.some(accepting)) {
    return result(exam, statementId, 'premature', inTurn(exam.def.prematureReplies, exam.bluffs++))
  }
  penalize(exam)
  return result(exam, statementId, 'wrong', inTurn(exam.def.wrongReplies, exam.wrongs++, exam.def.wrongReply))
}

export function press(exam: ExamState, statementId: string): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId)) return result(exam, statementId, 'ignored', [])
  const hit = availableSteps(exam, statementId).find(s => s.kind === 'press')
  if (!hit) return result(exam, statementId, 'ignored', [])
  complete(exam, statementId, hit.id)
  return result(exam, statementId, 'correct', hit.kind === 'press' ? hit.reply : [], hit.id)
}

export function chooseOption(exam: ExamState, statementId: string, stepId: string, optionIndex: number): ExamResult {
  if (finished(exam) || !statementOf(exam, statementId)) return result(exam, statementId, 'ignored', [])
  const step = availableSteps(exam, statementId).find(s => s.id === stepId)
  if (!step || step.kind !== 'argument') return result(exam, statementId, 'ignored', [])
  const opt = step.options[optionIndex]
  if (!opt) return result(exam, statementId, 'ignored', [])
  if (opt.correct) {
    complete(exam, statementId, step.id)
    return result(exam, statementId, 'correct', opt.reply, step.id)
  }
  penalize(exam)
  return result(exam, statementId, 'wrong', opt.reply, step.id)
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
