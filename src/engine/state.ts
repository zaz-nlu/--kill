import type { GameState, NpcId } from './types'

// boss 25 / mengyao 50 / suwen 60 / zhengcen 40 / shaoxy 45 / lucheng 50 / limo 70 come from the spec.
// laowang and xiaoxu are not specified there; 50 is this project's own choice.
export const INITIAL_AFFINITY: Record<NpcId, number> = {
  boss: 25,
  mengyao: 50,
  suwen: 60,
  zhengcen: 40,
  shaoxy: 45,
  lucheng: 50,
  limo: 70,
  laohan: 0,
  xiaoxu: 50,
  laowang: 50,
  tang: 0,
  laoliu: 0,
}

export function createInitialState(): GameState {
  return {
    version: 1,
    day: 1,
    hour: 9,
    money: 150,
    hp: 3,
    danger: 0,
    trust: 20,
    affinity: { ...INITIAL_AFFINITY },
    evidence: [],
    testimony: [],
    flags: {},
    intel: { phone: 'unknown', draft: 'unknown', trophy: 'unknown', card: 'unknown', attack: 'unknown' },
    backlog: [],
    notes: [],
    inventory: {},
    shopItemsLeft: 0,
    giftsGiven: {},
    giftedToday: [],
    persuasionLoss: 0,
    examGaps: 0,
  }
}
