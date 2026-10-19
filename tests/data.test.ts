import { describe, it, expect } from 'vitest'
import { loadData } from '../src/engine/data'

describe('loadData', () => {
  const data = loadData()

  it('has the 11 npcs and 10 shop items from the spec', () => {
    expect(data.npcs.length).toBe(11)
    expect(data.items.length).toBe(10)
    expect(data.items.reduce((sum, i) => sum + i.price, 0)).toBe(190)
  })

  it('every npc favourite and minefield is a real item', () => {
    const ids = new Set(data.items.map(i => i.id))
    for (const n of data.npcs) {
      if (n.favorite) expect(ids.has(n.favorite)).toBe(true)
      for (const m of n.minefield ?? []) expect(ids.has(m)).toBe(true)
    }
  })

  it('tang cannot be gifted and everyone else can', () => {
    for (const n of data.npcs) expect(n.giftable).toBe(n.id !== 'tang')
  })

  it('knows the evidence and testimony the slice needs', () => {
    const ev = new Set(data.evidence.map(e => e.id))
    const te = new Set(data.testimony.map(t => t.id))
    for (const id of ['E01', 'E03', 'E06', 'E07', 'E12', 'E13', 'E14', 'E15', 'E30']) expect(ev.has(id)).toBe(true)
    for (const id of ['T01', 'T02', 'T03', 'T05', 'T06', 'T06a', 'T22', 'T26', 'T27', 'T28', 'T29']) expect(te.has(id)).toBe(true)
  })

  it('has unique ids', () => {
    const all = [...data.evidence, ...data.testimony].map(r => r.id)
    expect(new Set(all).size).toBe(all.length)
    const npcIds = data.npcs.map(n => n.id)
    expect(new Set(npcIds).size).toBe(npcIds.length)
  })
})
