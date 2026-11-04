import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookPanel from '../src/ui/NotebookPanel.vue'
import { loadData } from '../src/engine/data'
import { nightPlans, writtenEntries } from '../src/engine/notebook'

const data = loadData()
const c2 = data.chapters.c2
const nb = c2.notebook!
const records = Object.fromEntries([...data.evidence, ...data.testimony].map(r => [r.id, { name: r.name, desc: r.desc }]))
const known = new Set([...data.evidence.map(e => e.id), ...data.testimony.map(t => t.id)])

describe('chapter 2 notebook', () => {
  it('case 1 has none; every id and place it names exists', () => {
    expect(data.chapters.c1.notebook).toBeUndefined()
    const places = new Set(c2.map!.map(p => p.id))
    for (const e of nb.entries) {
      for (const id of e.any) expect(known.has(id), id).toBe(true)
      if (e.place) expect(places.has(e.place), e.place).toBe(true)
    }
    for (const pl of nb.plans) for (const l of pl.lines) {
      for (const id of l.needs ?? []) expect(known.has(id), id).toBe(true)
      if (l.place) expect(places.has(l.place), l.place).toBe(true)
    }
  })

  it('writes a line once a clue is in hand, and only then', () => {
    expect(writtenEntries(nb, new Set())).toEqual([])
    expect(writtenEntries(nb, new Set(['2E33'])).map(e => e.id)).toEqual(['n05'])
  })

  it("works out a night's plan from 20:00, line by line from what is held", () => {
    expect(nightPlans(nb, new Set(), 1, 19)).toEqual([])
    const day1 = nightPlans(nb, new Set(), 1, 20)
    expect(day1).toHaveLength(1)
    const bare = day1[0].lines.length
    const rich = nightPlans(nb, new Set(['2E33', '2E04']), 2, 8)
    expect(rich[0].lines.length).toBeGreaterThan(bare)
    expect(rich[0].lines.some(l => l.place === 'street')).toBe(true)
  })

  it('shows notes, the plan and the map on three tabs', async () => {
    const places = c2.map!
    const w = mount(NotebookPanel, { props: { entries: writtenEntries(nb, new Set(['2E33'])), plans: nightPlans(nb, new Set(['2E33']), 2, 8), places, counts: { office: 2 }, records, held: new Set(['2E33']) } })
    expect(w.find('[data-testid="note-n05"]').exists()).toBe(true)
    await w.get('[data-testid="photo-n05"]').trigger('click')
    expect(w.get('[data-testid="nb-lightbox"]').text()).toContain(records['2E33'].name)
    await w.get('[data-testid="nb-lightbox-close"]').trigger('click')
    expect(w.find('[data-testid="nb-lightbox"]').exists()).toBe(false)
    await w.get('[data-testid="nb-tab-plan"]').trigger('click')
    expect(w.get('[data-testid="nb-plan"]').text()).toContain('第一夜')
    await w.get('[data-testid="nb-tab-map"]').trigger('click')
    expect(w.find('[data-testid="city-map"]').exists()).toBe(true)
    await w.get('[data-testid="nb-close"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
