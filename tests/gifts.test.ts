import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { endDay } from '../src/engine/calendar'
import { loadData } from '../src/engine/data'
import { openShop, buyItem, giveGift } from '../src/engine/gifts'

const { items, npcs } = loadData()

function shopper(...bought: string[]) {
  const s = createInitialState()
  s.money = 1000
  bought.forEach((id, i) => {
    s.hour = 100 + i            // every purchase is its own visit
    openShop(s)
    buyItem(s, items, id)
  })
  return s
}

describe('shop', () => {
  it('lets you buy two items per visit, then refuses', () => {
    const s = createInitialState()
    openShop(s)
    expect(s.shopItemsLeft).toBe(2)
    expect(buyItem(s, items, 'ruanzhonghua')).toEqual({ ok: true })
    expect(buyItem(s, items, 'jianbing')).toEqual({ ok: true })
    expect(s.money).toBe(150 - 65 - 10)
    expect(s.shopItemsLeft).toBe(0)
    expect(buyItem(s, items, 'redbull')).toEqual({ ok: false, reason: 'visitLimit' })
    expect(s.money).toBe(75)
    expect(s.inventory).toEqual({ ruanzhonghua: 1, jianbing: 1 })
  })

  it('walking out and back in during the same meal hour does not refill the allowance', () => {
    const s = createInitialState()
    s.money = 1000
    s.hour = 12
    openShop(s)
    buyItem(s, items, 'jianbing')
    buyItem(s, items, 'redbull')
    openShop(s)                               // leave and come back
    expect(s.shopItemsLeft).toBe(0)
    expect(buyItem(s, items, 'cat_stick')).toEqual({ ok: false, reason: 'visitLimit' })
  })

  it('a half-used allowance is still there when you come back', () => {
    const s = createInitialState()
    s.money = 1000
    s.hour = 12
    openShop(s)
    buyItem(s, items, 'jianbing')
    openShop(s)
    expect(s.shopItemsLeft).toBe(1)
  })

  it('the next meal hour, and the next day, are fresh visits', () => {
    const s = createInitialState()
    s.money = 1000
    s.hour = 12
    openShop(s)
    buyItem(s, items, 'jianbing')
    buyItem(s, items, 'redbull')
    s.hour = 18
    openShop(s)
    expect(s.shopItemsLeft).toBe(2)
    buyItem(s, items, 'cat_stick')
    s.day += 1; s.hour = 18
    openShop(s)
    expect(s.shopItemsLeft).toBe(2)
  })

  it('refuses when money is short and changes nothing', () => {
    const s = createInitialState()
    openShop(s)
    s.money = 5
    expect(buyItem(s, items, 'ruanzhonghua')).toEqual({ ok: false, reason: 'noMoney' })
    expect(s.money).toBe(5)
    expect(s.inventory).toEqual({})
    expect(s.shopItemsLeft).toBe(2)
  })

  it('refuses unknown items', () => {
    const s = createInitialState()
    openShop(s)
    expect(buyItem(s, items, 'ghost')).toEqual({ ok: false, reason: 'unknownItem' })
  })
})

describe('gifts', () => {
  it('favourite: +15 affinity and the item is consumed', () => {
    const s = shopper('hongtashan')
    const r = giveGift(s, npcs, 'lucheng', 'hongtashan')
    expect(r).toEqual({ ok: true, tier: 'favorite', affinityDelta: 15, trustDelta: 0 })
    expect(s.affinity.lucheng).toBe(65)
    expect(s.inventory.hongtashan ?? 0).toBe(0)
    expect(s.giftedToday).toContain('lucheng')
    expect(s.giftsGiven.lucheng).toEqual(['hongtashan'])
  })

  it('minefield: -10 affinity', () => {
    const s = shopper('milk_tea')
    const r = giveGift(s, npcs, 'lucheng', 'milk_tea')
    expect(r).toMatchObject({ ok: true, tier: 'minefield', affinityDelta: -10 })
    expect(s.affinity.lucheng).toBe(40)
  })

  it('other food: +5 affinity', () => {
    const s = shopper('jianbing')
    const r = giveGift(s, npcs, 'shaoxy', 'jianbing')
    expect(r).toMatchObject({ ok: true, tier: 'ok', affinityDelta: 5 })
    expect(s.affinity.shaoxy).toBe(50)
  })

  it('laohan is paid in trust, not affinity', () => {
    let s = shopper('jasmine_tea')
    expect(giveGift(s, npcs, 'laohan', 'jasmine_tea')).toMatchObject({ tier: 'favorite', trustDelta: 5, affinityDelta: 0 })
    expect(s.trust).toBe(25)
    expect(s.affinity.laohan).toBe(0)
    s = shopper('hongtashan')
    giveGift(s, npcs, 'laohan', 'hongtashan')
    expect(s.trust).toBe(10)
    s = shopper('jianbing')
    giveGift(s, npcs, 'laohan', 'jianbing')
    expect(s.trust).toBe(20)
  })

  it('rejects bad gifts without touching money, inventory, affinity or the daily list', () => {
    const snapshot = (s: ReturnType<typeof createInitialState>) =>
      JSON.stringify({ m: s.money, i: s.inventory, a: s.affinity, t: s.trust, d: s.giftedToday, g: s.giftsGiven })

    let s = shopper('jianbing')
    let before = snapshot(s)
    expect(giveGift(s, npcs, 'tang', 'jianbing')).toEqual({ ok: false, reason: 'notGiftable' })
    expect(giveGift(s, npcs, 'lucheng', 'redbull')).toEqual({ ok: false, reason: 'noItem' })
    expect(giveGift(s, npcs, 'nobody' as never, 'jianbing')).toEqual({ ok: false, reason: 'unknownNpc' })
    expect(snapshot(s)).toBe(before)

    s = shopper('jianbing', 'redbull')
    expect(giveGift(s, npcs, 'lucheng', 'jianbing').ok).toBe(true)
    before = snapshot(s)
    expect(giveGift(s, npcs, 'lucheng', 'redbull')).toEqual({ ok: false, reason: 'dailyLimit' })
    expect(snapshot(s)).toBe(before)
  })

  it('the same item cannot be given to the same person twice, even on another day', () => {
    const s = shopper('jianbing', 'jianbing')
    expect(giveGift(s, npcs, 'lucheng', 'jianbing').ok).toBe(true)
    endDay(s, { rested: false })
    expect(s.giftedToday).toEqual([])
    const before = JSON.stringify(s.inventory)
    expect(giveGift(s, npcs, 'lucheng', 'jianbing')).toEqual({ ok: false, reason: 'alreadyGiven' })
    expect(JSON.stringify(s.inventory)).toBe(before)
  })

  it('after a new day the same person can receive a different item', () => {
    const s = shopper('jianbing', 'redbull')
    giveGift(s, npcs, 'lucheng', 'jianbing')
    endDay(s, { rested: false })
    expect(giveGift(s, npcs, 'lucheng', 'redbull').ok).toBe(true)
  })
})
