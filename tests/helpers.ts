import type { useGameStore } from '../src/engine/store'

type Store = ReturnType<typeof useGameStore>

// Plays scenes until the game leaves the 'scene' screen. `pick` chooses among the option texts (default: the first).
export function playOut(store: Store, pick: (texts: string[]) => number = () => 0): void {
  let guard = 0
  while (store.screen === 'scene' && store.currentNode) {
    if (guard++ > 1500) throw new Error('runaway scene')
    const n = store.currentNode
    if (n.type === 'choice') store.advance(pick(n.options.map(o => o.text)))
    else store.advance()
  }
}

export const cold = (texts: string[]) => Math.max(0, texts.findIndex(t => t.startsWith('还没')))

// title -> prologue -> day 1 (morning questioning) -> rest -> day 2 morning events -> lunch -> hub at 12:00 on day 2.
export function toDay2Noon(store: Store): void {
  store.newGame()
  playOut(store)
  store.restAtHome()
  playOut(store)
  store.state.hour = 11
  store.waitAnHour()
  playOut(store, cold)
}
