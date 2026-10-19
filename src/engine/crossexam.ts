import type { ExamDef, GameState, Line, Step } from './types'
import { noticedSlip } from './log'

export interface ExamState {
  def: ExamDef
  persuasion: number
  done: Record<string, string[]>   // statementId -> completed stepIds
  failed: boolean
  cleared: boolean
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

export function computePersuasion(state: GameState): number {
  let p = 5
  if (state.flags.challengeAllCorrect) p += 1
  if (noticedSlip(state)) p += 1
  return Math.min(7, p)
}

function isRequired(step: Step): boolean {
  return step.required ?? step.kind !== 'press'
}

function statementOf(exam: ExamState, statementId: string) {
  return exam.def.statements.find(s => s.id === statementId)
}

function statementCleared(exam: ExamState, statementId: string): boolean {
  const st = statementOf(exam, statementId)
  if (!st) return false
  const done = exam.done[statementId] ?? []
  return st.steps.every(s => !isRequired(s) || done.includes(s.id))
}

function allCleared(exam: ExamState): boolean {
  return exam.def.statements.every(s => statementCleared(exam, s.id))
}

export function startExam(def: ExamDef, persuasion: number): ExamState {
  const exam: ExamState = {
    def,
    persuasion,
    done: Object.fromEntries(def.statements.map(s => [s.id, [] as string[]])),
    failed: false,
    cleared: false,
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

function penalize(exam: ExamState): void {
  exam.persuasion = Math.max(0, exam.persuasion - 1)
  if (exam.persuasion === 0) exam.failed = true
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
    return result(exam, statementId, 'correct', hit.replyFor?.[itemId] ?? hit.reply, hit.id)
  }
  if (st.steps.some(s => accepting(s) && done.includes(s.id))) {
    return result(exam, statementId, 'ignored', [])
  }
  if (st.steps.some(accepting)) {
    return result(exam, statementId, 'premature', [])
  }
  penalize(exam)
  return result(exam, statementId, 'wrong', exam.def.wrongReply)
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
