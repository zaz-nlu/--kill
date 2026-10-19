import type { GameState, Line, LogLine, Speaker } from './types'
import { SLIP_FOR_INTEL } from './flow'

const SLIP_TAGS = new Set(Object.values(SLIP_FOR_INTEL))

export function addLog(state: GameState, line: Line): LogLine {
  const entry: LogLine = {
    ...line,
    id: `L${state.backlog.length + 1}`,
    day: state.day,
    hour: state.hour,
  }
  state.backlog.push(entry)
  return entry
}

export function logLines(state: GameState, lines: Line[]): void {
  for (const l of lines) addLog(state, l)
}

export interface NoteResult { noted: boolean; reaction: string | null }

export function toggleNote(state: GameState, lineId: string): NoteResult {
  const line = state.backlog.find(l => l.id === lineId)
  const idx = state.notes.indexOf(lineId)
  if (idx >= 0) {
    state.notes.splice(idx, 1)
    return { noted: false, reaction: null }
  }
  if (!line) return { noted: false, reaction: null }
  state.notes.push(lineId)
  const isSlip = line.tag !== undefined && SLIP_TAGS.has(line.tag)
  return { noted: true, reaction: isSlip ? '……？' : null }
}

export interface VisibleLogLine { id: string; speaker: Speaker; text: string; noted: boolean }

export function visibleLog(state: GameState): VisibleLogLine[] {
  return state.backlog.map(l => ({
    id: l.id,
    speaker: l.speaker,
    text: l.text,
    noted: state.notes.includes(l.id),
  }))
}

export function presentableIds(state: GameState): string[] {
  const ids = new Set<string>([...state.evidence, ...state.testimony])
  // Any logged line can be presented; a slip is indistinguishable from a plain line, so a plain line is just wrong evidence.
  for (const l of state.backlog) {
    ids.add(l.id)
    if (l.tag) ids.add(l.tag)
  }
  return [...ids]
}

export function noticedSlip(state: GameState): boolean {
  return state.notes.some(id => {
    const tag = state.backlog.find(l => l.id === id)?.tag
    return tag !== undefined && SLIP_TAGS.has(tag)
  })
}

// Every logged line, shaped identically whether or not it carries a hidden tag (spec 6.9: no highlight).
export function quoteList(state: GameState): { id: string; text: string }[] {
  const seen = new Set<string>()
  const out: { id: string; text: string }[] = []
  for (const line of state.backlog) {
    const id = line.tag ?? line.id
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, text: line.text })
  }
  return out
}
