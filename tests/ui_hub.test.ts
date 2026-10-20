import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HubScreen from '../src/ui/HubScreen.vue'
import ShopPanel from '../src/ui/ShopPanel.vue'
import GiftPicker from '../src/ui/GiftPicker.vue'
import { useGameStore } from '../src/engine/store'
import type { ActionDef } from '../src/engine/calendar'
import { loadData } from '../src/engine/data'
import { toDay2Noon } from './helpers'

const { items } = loadData()
const actions: ActionDef[] = [
  { id: '2-3', label: '帮邵晓阳修一个前端 bug', location: '外包区', days: [2], scene: 'act_2_3', costHours: 1, npc: 'shaoxy' },
  { id: '2-6', label: '去 1 楼吸烟区找陆诚', location: '1 楼', days: [2], scene: 'act_2_6', costHours: 1, npc: 'lucheng' },
]

describe('HubScreen', () => {
  it('lists the actions and emits the chosen id', async () => {
    const w = mount(HubScreen, { props: { actions, canShop: false, inventory: {}, items } })
    expect(w.text()).toContain('帮邵晓阳修一个前端 bug')
    await w.find('[data-testid="action-2-6"]').trigger('click')
    expect(w.emitted('action')?.[0]).toEqual(['2-6'])
  })

  it('only offers the shop when allowed, and always offers rest', async () => {
    const closed = mount(HubScreen, { props: { actions, canShop: false, inventory: {}, items } })
    expect(closed.find('[data-testid="go-shop"]').exists()).toBe(false)
    const open = mount(HubScreen, { props: { actions, canShop: true, inventory: {}, items } })
    await open.find('[data-testid="go-shop"]').trigger('click')
    expect(open.emitted('shop')?.length).toBe(1)
    await open.find('[data-testid="rest"]').trigger('click')
    expect(open.emitted('rest')?.length).toBe(1)
  })

  it('attaches a gift to an action: pick from the bag, then the action carries it', async () => {
    const w = mount(HubScreen, { props: { actions, canShop: false, inventory: { hongtashan: 1 }, items } })
    await w.find('[data-testid="gift-2-6"]').trigger('click')
    await w.find('[data-testid="pick-hongtashan"]').trigger('click')
    await w.find('[data-testid="action-2-6"]').trigger('click')
    expect(w.emitted('action')?.[0]).toEqual(['2-6', 'hongtashan'])
  })
})

describe('ShopPanel', () => {
  it('disables what you cannot afford and everything once the visit limit is hit', async () => {
    const poor = mount(ShopPanel, { props: { items, money: 8, itemsLeft: 2 } })
    expect(poor.find('[data-testid="buy-ruanzhonghua"]').attributes('disabled')).toBeDefined()
    expect(poor.find('[data-testid="buy-redbull"]').attributes('disabled')).toBeUndefined()
    const spent = mount(ShopPanel, { props: { items, money: 500, itemsLeft: 0 } })
    for (const b of spent.findAll('[data-testid^="buy-"]')) expect(b.attributes('disabled')).toBeDefined()
  })

  it('emits buy with the item id and leave', async () => {
    const w = mount(ShopPanel, { props: { items, money: 500, itemsLeft: 2 } })
    await w.find('[data-testid="buy-jianbing"]').trigger('click')
    expect(w.emitted('buy')?.[0]).toEqual(['jianbing'])
    await w.find('[data-testid="leave-shop"]').trigger('click')
    expect(w.emitted('leave')?.length).toBe(1)
  })
})

describe('GiftPicker', () => {
  it('says the bag is empty, or lets you pick', async () => {
    const empty = mount(GiftPicker, { props: { inventory: {}, items } })
    expect(empty.text()).toContain('背包是空的')
    const full = mount(GiftPicker, { props: { inventory: { redbull: 2 }, items } })
    await full.find('[data-testid="pick-redbull"]').trigger('click')
    expect(full.emitted('pick')?.[0]).toEqual(['redbull'])
  })
})

function finishScene(store: ReturnType<typeof useGameStore>) {
  let guard = 0
  while (store.currentNode) {
    if (guard++ > 200) throw new Error('runaway')
    if (store.currentNode.type === 'choice') store.advance(0)
    else store.advance()
  }
}

describe('store: day 2 flow', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('plays the prologue, day 1, then day 2 morning and lunch, and lands in the hub at 12:00', () => {
    const store = useGameStore()
    toDay2Noon(store)
    expect(store.screen).toBe('hub')
    expect(store.state.day).toBe(2)
    expect(store.state.hour).toBe(12)
    expect(store.state.backlog.some(l => l.tag === 'G3')).toBe(true)
  })

  it('startAction plays the scene, costs an hour and returns to the hub', () => {
    const store = useGameStore()
    toDay2Noon(store)
    store.waitAnHour()
    store.startAction('2-3')
    expect(store.screen).toBe('scene')
    finishScene(store)
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(14)
    expect(store.state.affinity.shaoxy).toBe(60)
  })

  it('an unknown or unavailable action does nothing', () => {
    const store = useGameStore()
    toDay2Noon(store)
    store.startAction('9-9')
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(12)
  })

  it('the shop opens at 12:00 but not at 13:00', () => {
    const store = useGameStore()
    toDay2Noon(store)
    store.goShop()
    expect(store.screen).toBe('shop')
    store.leaveShop()
    store.waitAnHour()
    store.startAction('2-3')
    finishScene(store)
    store.goShop()
    expect(store.screen).toBe('hub')
  })

  it('buy and gift work end to end, and a gift attached to an action is given after the scene', () => {
    const store = useGameStore()
    toDay2Noon(store)
    store.goShop()
    expect(store.buy('ruanzhonghua')).toEqual({ ok: true })
    expect(store.buy('hongtashan')).toEqual({ ok: true })
    expect(store.state.money).toBe(150 - 65 - 22)
    store.leaveShop()
    store.waitAnHour()
    store.startAction('2-6', 'hongtashan')
    finishScene(store)
    expect(store.state.affinity.lucheng).toBe(50 + 15)
    expect(store.state.inventory.hongtashan).toBeUndefined()
  })

  it('resting ends the day and, in the slice, the playable part', () => {
    const store = useGameStore()
    toDay2Noon(store)
    store.restAtHome()
    expect(store.state.day).toBe(3)
    expect(store.screen).toBe('end')
  })
})
