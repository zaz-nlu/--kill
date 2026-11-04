import type { NotebookDef, NotebookEntry, NotebookPlan, NotebookPlanLine } from './types'

// What the notebook shows, worked out from what the player holds (evidence and testimony ids) and the time. Pure.

export function writtenEntries(nb: NotebookDef, held: ReadonlySet<string>): NotebookEntry[] {
  return nb.entries.filter(e => e.any.some(id => held.has(id)))
}

export interface NightPlan { day: number; title: string; lines: NotebookPlanLine[] }

// A night's plan is there from 20:00 of that day on; each line appears only if everything it rests on is in hand.
export function nightPlans(nb: NotebookDef, held: ReadonlySet<string>, day: number, hour: number): NightPlan[] {
  const due = (p: NotebookPlan) => day > p.day || (day === p.day && hour >= 20)
  return nb.plans.filter(due).map(p => ({
    day: p.day,
    title: p.title,
    lines: p.lines.filter(l => (l.needs ?? []).every(id => held.has(id))),
  }))
}
