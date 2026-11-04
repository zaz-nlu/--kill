import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HubScreen from '../src/ui/HubScreen.vue'
import { loadData } from '../src/engine/data'
import type { ActionDef } from '../src/engine/calendar'

const act = (id: string, location: string): ActionDef => ({ id, label: id, location, days: [1], costHours: 1 })
const data = loadData()
const places = data.chapters.c2.map!

describe('chapter 2 city map', () => {
  it('is defined for case 2 only, and every action location of case 2 sits on a place', () => {
    expect(data.chapters.c1.map).toBeUndefined()
    const known = new Set(places.flatMap((p: { locations: string[] }) => p.locations))
    for (const a of data.actions.filter((a: ActionDef) => a.chapter === 'c2')) expect(known.has(a.location), a.location).toBe(true)
  })

  it('tapping a place narrows the list to that place; an empty place says so; home offers the way to rest', async () => {
    const w = mount(HubScreen, { props: { actions: [act('a', '街上'), act('b', '饭馆')], canShop: false, inventory: {}, items: [], places } })
    expect(w.findAll('[data-testid^="action-"]')).toHaveLength(2)
    await w.get('[data-testid="place-street"]').trigger('click')
    expect(w.findAll('[data-testid^="action-"]').map(b => b.attributes('data-testid'))).toEqual(['action-a'])
    await w.get('[data-testid="place-market"]').trigger('click')
    expect(w.find('[data-testid="place-empty"]').exists()).toBe(true)
    await w.get('[data-testid="place-home"]').trigger('click')
    await w.get('[data-testid="map-rest"]').trigger('click')
    expect(w.emitted('rest')).toBeTruthy()
  })
})
