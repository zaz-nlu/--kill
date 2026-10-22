import type { GameState, Item, Npc, NpcId } from './types'
import { applyEffect } from './effects'

// Two items per visit. A visit is one meal hour: walking out and back in does not refill the allowance.
export function openShop(state: GameState): void {
  const visit = `shop:${state.day}:${state.hour}`
  if (state.flags[visit]) return
  state.flags[visit] = true
  state.shopItemsLeft = 2
}

export type BuyResult = { ok: true } | { ok: false; reason: 'noMoney' | 'visitLimit' | 'unknownItem' }

export function buyItem(state: GameState, items: Item[], itemId: string): BuyResult {
  const item = items.find(i => i.id === itemId)
  if (!item) return { ok: false, reason: 'unknownItem' }
  if (state.shopItemsLeft <= 0) return { ok: false, reason: 'visitLimit' }
  if (state.money < item.price) return { ok: false, reason: 'noMoney' }
  state.money -= item.price
  state.shopItemsLeft -= 1
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1
  return { ok: true }
}

export type GiftResult =
  | { ok: true; tier: 'favorite' | 'ok' | 'minefield'; affinityDelta: number; trustDelta: number }
  | { ok: false; reason: 'noItem' | 'notGiftable' | 'alreadyGiven' | 'dailyLimit' | 'unknownNpc' }

// Laohan is a policeman: gifts move trust, not affinity. Everyone else moves affinity.
const AFFINITY_BY_TIER = { favorite: 15, ok: 5, minefield: -10 } as const
const TRUST_BY_TIER = { favorite: 5, ok: 0, minefield: -10 } as const

export function giveGift(state: GameState, npcs: Npc[], npcId: NpcId, itemId: string): GiftResult {
  const npc = npcs.find(n => n.id === npcId)
  if (!npc) return { ok: false, reason: 'unknownNpc' }
  if (!npc.giftable) return { ok: false, reason: 'notGiftable' }
  if ((state.inventory[itemId] ?? 0) <= 0) return { ok: false, reason: 'noItem' }
  if (state.giftedToday.includes(npcId)) return { ok: false, reason: 'dailyLimit' }
  if ((state.giftsGiven[npcId] ?? []).includes(itemId)) return { ok: false, reason: 'alreadyGiven' }

  const tier = npc.favorite === itemId ? 'favorite' : npc.minefield?.includes(itemId) ? 'minefield' : 'ok'
  const usesTrust = npcId === 'laohan'
  const affinityDelta = usesTrust ? 0 : AFFINITY_BY_TIER[tier]
  const trustDelta = usesTrust ? TRUST_BY_TIER[tier] : 0

  state.inventory[itemId] -= 1
  if (state.inventory[itemId] === 0) delete state.inventory[itemId]
  state.giftsGiven[npcId] = [...(state.giftsGiven[npcId] ?? []), itemId]
  state.giftedToday.push(npcId)
  if (affinityDelta) applyEffect(state, { kind: 'affinity', npc: npcId, delta: affinityDelta })
  if (trustDelta) applyEffect(state, { kind: 'trust', delta: trustDelta })
  return { ok: true, tier, affinityDelta, trustDelta }
}
