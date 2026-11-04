import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import { actionsOnMap, openPlaces } from '../src/engine/notebook'
import type { GameState } from '../src/engine/types'

const data = loadData()
const c2 = data.chapters.c2
const places = c2.map!

const held = (s: GameState) => new Set([...s.evidence, ...s.testimony])
const open = (s: GameState) => openPlaces(places, held(s), s.flags).map(p => p.id)

function play(state: GameState, sceneId: string): void {
  const runner = new SceneRunner(state, data.scenes)
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error(`${sceneId} did not terminate`)
    runner.advance()
  }
}

describe('the case 2 map opens with the clues', () => {
  it("starts with the office only; the jail opens once Shao is held, the store with the errand order, his home with the prepaid card and the diner", () => {
    const s = createInitialState(c2)
    expect(open(s)).toEqual(['office'])
    s.flags.shao_held = true
    expect(open(s)).toContain('jail')
    s.evidence.push('2E08e')
    expect(open(s)).toContain('market')
    s.evidence.push('2E41')
    expect(open(s)).not.toContain('lucheng')
    s.testimony.push('2T22')
    expect(open(s)).toContain('lucheng')
  })

  it('a place that is not open hides its actions', () => {
    const s = createInitialState(c2)
    s.day = 2
    s.hour = 13
    const all = availableActions(s, data.actions)
    const shown = actionsOnMap(all, places, openPlaces(places, held(s), s.flags)).map(a => a.id)
    expect(all.map(a => a.id)).toContain('c2-2-4')
    expect(shown).not.toContain('c2-2-4')
    s.evidence.push('2E05')
    expect(actionsOnMap(all, places, openPlaces(places, held(s), s.flags)).map(a => a.id)).toContain('c2-2-4')
  })

  it('played in order, every place the trial needs opens in time: nothing a player must do is ever hidden', () => {
    const s = createInitialState(c2)
    play(s, c2.prologue)
    const done = new Set<string>()
    for (let guard = 0; guard < 80; guard++) {
      const shown = actionsOnMap(availableActions(s, data.actions), places, openPlaces(places, held(s), s.flags))
        .filter(a => !a.meal && !done.has(a.id) && !a.pinned)
      const a = shown[0]
      if (!a) {
        // nothing left this hour: let the hour pass, and the day when the hours run out
        const cal = c2.calendar[s.day - 1]
        if (s.hour < cal.lastHour) s.hour += 1
        else if (s.day < c2.lastDay) { s.day += 1; s.hour = c2.calendar[s.day - 1].startHour } else break
        continue
      }
      done.add(a.id)
      if (a.scene) play(s, a.scene)
      if (a.room) {
        const room = data.rooms.find(r => r.id === a.room)!
        for (const h of room.hotspots) play(s, h.scene)
      }
    }
    const gate = data.actions.find(x => x.id === 'c2-3-4')!
    for (const id of gate.requiresEvidence ?? []) expect(s.evidence, id).toContain(id)
    expect(open(s)).toContain('police')
  })
})
