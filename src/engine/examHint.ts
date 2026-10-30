import { availableSteps, statementView, type ExamState } from './crossexam'
import { parseMarked } from './markup'
import type { Line, Step } from './types'

type PresentStep = Extract<Step, { kind: 'present' }>
type KindOf = (id: string) => 'evidence' | 'testimony' | 'other'

// How often Lao Han should speak up when a line keeps resisting: on the second failure, then every other one after that,
// the later nudges naming the kind of thing that would break it. Zero: say nothing.
export function shouldNudge(stuck: number): 0 | 1 | 2 {
  if (stuck >= 2 && stuck % 2 === 0) return stuck >= 4 ? 2 : 1
  return 0
}

const PRESS_HINT = '先问问他，再拿东西出来。这句话，你追问过吗？'
const NO_PHRASE = '这一句里，有个地方对不上。再读一遍。'

// What kind of piece would break the point. Never names the item itself.
function categoryHint(id: string | undefined, meta: Record<string, { type: string }>, kindOf: KindOf): string {
  if (!id) return ''
  const type = meta[id]?.type
  if (type === '物证') return '要拆它，大概得拿一件实物出来。'
  if (type === '记录') return '……大概得拿一份记录出来。'
  if (type === '影像') return '……大概得拿一段影像或照片出来。'
  if (type === '文书') return '……大概得拿一份文书出来。'
  if (type === '证言' || (!type && kindOf(id) === 'testimony')) return '……大概得翻翻谁说过的话。'
  return ''
}

// The nudge for a line the player is stuck on: first which words do not hold up, then what sort of evidence would break
// them. Names no exhibit: the player still has to find the piece themselves.
export function nudgeLine(
  exam: ExamState,
  statementId: string,
  level: 1 | 2,
  meta: Record<string, { type: string }>,
  kindOf: KindOf,
): Line | null {
  const steps = availableSteps(exam, statementId)
  const presents = steps.filter((s): s is PresentStep => s.kind === 'present')
  if (presents.length === 0) {
    if (steps.some(s => s.kind === 'press')) return { speaker: 'laohan', text: PRESS_HINT, expr: 'soft' }
    return null
  }
  const step = presents.find(s => s.required) ?? presents[0]
  const phrase = step.target
    ? parseMarked(statementView(exam, statementId).text).find(seg => seg.mark === step.target)?.text
    : undefined
  let text = phrase ? `「${phrase}」这几个字，你觉得说得通吗？` : NO_PHRASE
  if (level === 2) text += categoryHint(step.accepts[0], meta, kindOf)
  return { speaker: 'laohan', text, expr: 'soft' }
}
