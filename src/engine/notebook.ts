import type { MapPlace, NotebookDef, NotebookEntry, NotebookPlan, NotebookPlanLine } from './types'
import type { ActionDef } from './calendar'

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

// The map opens up with the case: a place shows once the clues that lead there are in hand.
export function placeOpen(p: MapPlace, held: ReadonlySet<string>, flags: Readonly<Record<string, boolean>>): boolean {
  const u = p.unlock
  if (!u) return true
  if (u.any && !u.any.some(id => held.has(id))) return false
  if (u.all && !u.all.every(id => held.has(id))) return false
  if (u.flag && !flags[u.flag]) return false
  return true
}

export function openPlaces(places: readonly MapPlace[], held: ReadonlySet<string>, flags: Readonly<Record<string, boolean>>): MapPlace[] {
  return places.filter(p => placeOpen(p, held, flags))
}

// Actions at a place that is not on the map yet are not offered. Actions at a location no place covers stay.
export function actionsOnMap(actions: readonly ActionDef[], places: readonly MapPlace[], open: readonly MapPlace[]): ActionDef[] {
  return actions.filter(a => {
    const p = places.find(pl => pl.locations.includes(a.location))
    return !p || open.some(o => o.id === p.id)
  })
}
