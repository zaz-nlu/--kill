import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HubScreen from '../src/ui/HubScreen.vue'
import { loadData } from '../src/engine/data'
import type { ActionDef } from '../src/engine/calendar'

const data = loadData()
const act = (id: string, location: string, room?: string): ActionDef => ({ id, label: id, location, days: [1], costHours: 1, room })
const { map: places, nudges } = data.chapters.c2

describe('chapter 2 city map', () => {
  it('is defined for case 2 only, and every action location of case 2 sits on a place', () => {
    expect(data.chapters.c1.map).toBeUndefined()
    const known = new Set(places!.flatMap(p => p.locations))
    for (const a of data.actions.filter((a: ActionDef) => a.chapter === 'c2')) expect(known.has(a.location), a.location).toBe(true)
    for (const n of nudges!) expect(places!.some(p => p.id === n.place), n.place).toBe(true)
  })

  it('shows no action list until a place is picked; then only that place, with room searches as the 调查 button', async () => {
    const w = mount(HubScreen, { props: { actions: [act('a', '街上'), act('r', '街上', 'c2_store_front'), act('b', '饭馆')], canShop: false, inventory: {}, items: [], places, mapOpen: true } })
    expect(w.findAll('[data-testid^="action-"]')).toHaveLength(0)
    expect(w.find('[data-testid="pick-hint"]').exists()).toBe(true)
    await w.get('[data-testid="place-street"]').trigger('click')
    expect(w.emitted('update:mapOpen')![0]).toEqual([false])
    await w.setProps({ mapOpen: true })
    expect(w.emitted('place')![0]).toEqual(['store_front'])
    expect(w.findAll('[data-testid^="action-"]').map(b => b.attributes('data-testid'))).toEqual(['action-r', 'action-a'])
    expect(w.get('[data-testid="action-r"]').classes()).toContain('search')
    await w.get('[data-testid="place-market"]').trigger('click')
    await w.setProps({ mapOpen: true })
    expect(w.find('[data-testid="place-empty"]').exists()).toBe(true)
    await w.get('[data-testid="place-home"]').trigger('click')
    await w.setProps({ mapOpen: true })
    await w.get('[data-testid="map-rest"]').trigger('click')
    expect(w.emitted('rest')).toBeTruthy()
  })

  it("the notebook points at a place by day and hour, only while that place has something to do", () => {
    const base = { canShop: false, inventory: {}, items: [], places, nudges }
    const d2 = (hour: number, actions: ActionDef[]) => mount(HubScreen, { props: { ...base, actions, day: 2, hour } })
    expect(d2(9, [act('a', '街上'), act('b', '17 层')]).get('[data-testid="nudge"]').text()).toContain('巷口那条街')
    expect(d2(9, [act('b', '饭馆')]).get('[data-testid="nudge"]').text()).toContain('老门口')
    expect(d2(21, [act('b', '17 层'), act('a', '街上')]).get('[data-testid="nudge"]').text()).toContain('晚上')
    expect(d2(9, [act('x', '分局')]).find('[data-testid="nudge"]').exists()).toBe(false)
  })
})
