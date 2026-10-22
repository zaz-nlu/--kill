// The frame-by-frame check of a recording (spec 9, 4-2): mark every row that is a real flaw, and none that is not.
export interface FrameRow { id: string; time: string; text: string; flaw: boolean }
export interface FrameDef { id: string; prompt: string; rows: FrameRow[] }

export type FrameOutcome =
  | { kind: 'incomplete' }
  | { kind: 'solved' }
  | { kind: 'partial'; missing: number; wrong: number }

// Tries are unlimited and cost nothing. The player is told how many flaws they missed and how many of their marks
// were red herrings — never which ones.
export function judgeFrames(def: FrameDef, marked: string[]): FrameOutcome {
  if (marked.length === 0) return { kind: 'incomplete' }
  const chosen = new Set(marked)
  const missing = def.rows.filter(r => r.flaw && !chosen.has(r.id)).length
  const wrong = def.rows.filter(r => !r.flaw && chosen.has(r.id)).length
  return missing === 0 && wrong === 0 ? { kind: 'solved' } : { kind: 'partial', missing, wrong }
}
