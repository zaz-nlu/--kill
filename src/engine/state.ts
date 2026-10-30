import type { ChapterDef, GameState, NpcId } from './types'
import c1 from '../data/chapters/c1.json'

// boss 25 / mengyao 50 / suwen 60 / zhengcen 40 / shaoxy 45 / lucheng 50 / limo 70 come from the spec.
// laowang and xiaoxu are not specified there; 50 is this project's own choice.
// Case 1's opening numbers live in data/chapters/c1.json; this table stays as the fallback for any npc a chapter's
// startState leaves out, and for the code that still reads it directly.
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

// The chapter the game opens on; callers that do not name a chapter get case 1.
export const DEFAULT_CHAPTER = c1 as unknown as ChapterDef

export function createInitialState(chapter: ChapterDef = DEFAULT_CHAPTER): GameState {
  const start = chapter.startState
  return {
    version: 2,
    chapter: chapter.id,
    day: 1,
    hour: start.hour,
    money: start.money,
    hp: start.hp,
    danger: start.danger,
    trust: start.trust,
    affinity: { ...INITIAL_AFFINITY, ...start.affinity },
    evidence: [...chapter.startKit.evidence],
    testimony: [...chapter.startKit.testimony],
    flags: {},
    intel: { ...start.intel },
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
