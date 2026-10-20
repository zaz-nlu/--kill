import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { wasLimoAway } from '../src/engine/danger'
import { playOut } from './helpers'

type Store = ReturnType<typeof useGameStore>
// Start a scene the way the UI would: on the scene screen.
function start(store: Store, id: string) {
  store.screen = 'scene'
  store.playScene(id)
}

function atNight() {
  const store = useGameStore()
  store.newGame()
  playOut(store)
  store.state.hour = 19
  store.state.flags['event:day1_wechat'] = true
  return store
}

describe('random attacks follow the action that was just done', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the stairs are a high-risk place with an attack scene of their own', () => {
    const stairs = useGameStore().data.actions.find(a => a.id === '1-12')!
    expect(stairs.risk).toBe('high')
    expect(stairs.attack).toBe('attack_stairs')
  })

  it('an attack happens when the roll hits: Limo is marked away, the attack is learnt, then the hub returns', () => {
    const store = atNight()
    store.setRng(() => 0)
    store.state.danger = 60
    store.startAction('1-12')
    playOut(store, () => 1)                    // crouch? no. Then the attack scene runs as part of the same flow
    expect(store.screen).toBe('hub')
    expect(wasLimoAway(store.state, 1, 19)).toBe(true)
    expect(store.state.intel.attack).not.toBe('unknown')
  })

  it('nothing happens when danger is low, even with the worst luck', () => {
    const store = atNight()
    store.setRng(() => 0)
    store.state.danger = 10
    store.startAction('1-12')
    playOut(store, () => 1)
    expect(store.screen).toBe('hub')
    expect(wasLimoAway(store.state, 1, 19)).toBe(false)
    expect(store.state.intel.attack).toBe('unknown')
  })

  it('nothing happens when the roll misses', () => {
    const store = atNight()
    store.setRng(() => 0.99)
    store.state.danger = 100
    store.startAction('1-12')
    playOut(store, () => 1)
    expect(store.screen).toBe('hub')
  })

  it('safe places never attract an attack', () => {
    const store = atNight()
    store.setRng(() => 0)
    store.state.danger = 100
    store.data.actions.push({ id: 'x-safe', label: 's', location: 'x', days: [1], minHour: 19, scene: 'act_1_5', costHours: 1, risk: 'safe', attack: 'attack_stairs' })
    store.startAction('x-safe')
    playOut(store)
    expect(store.screen).toBe('hub')
  })

  it('police-station actions are marked safe', () => {
    const a = useGameStore().data.actions.find(x => x.id === '1-10')!
    expect(a.risk).toBe('safe')
  })
})

describe('the four attack scenes', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const kinds = ['attack_stairs', 'attack_parking', 'attack_office_night', 'attack_street']

  it('all exist and play to the end with either answer, with no timer', () => {
    const store = useGameStore()
    for (const id of kinds) {
      for (const pick of [0, 1]) {
        store.state.hp = 3
        store.state.danger = 50
        store.screen = 'scene'
        store.playScene(id, () => { store.screen = 'hub' })
        expect(() => playOut(store, () => pick), `${id}/${pick}`).not.toThrow()
        const node = store.currentNode
        expect(node).toBeNull()
      }
    }
  })

  it('a good answer finds a clue; a bad one only loses it, and costs no health below the critical tier', () => {
    const store = useGameStore()
    store.state.danger = 50
    start(store, 'attack_stairs')
    playOut(store, () => 0)
    expect(store.state.testimony).toContain('T15')
    expect(store.state.hp).toBe(3)

    setActivePinia(createPinia())
    const bad = useGameStore()
    bad.state.danger = 50
    start(bad, 'attack_stairs')
    playOut(bad, () => 1)
    expect(bad.state.testimony).not.toContain('T15')
    expect(bad.state.hp).toBe(3)
  })

  it('at the critical tier a bad answer does cost health', () => {
    const store = useGameStore()
    store.state.danger = 95
    start(store, 'attack_stairs')
    playOut(store, () => 1)
    expect(store.state.hp).toBe(2)
  })

  it('the parking-lot attack is two steps: left wrist and the black glove', () => {
    const store = useGameStore()
    store.state.danger = 50
    start(store, 'attack_parking')
    playOut(store, () => 0)
    expect(store.state.testimony).toEqual(expect.arrayContaining(['T16', 'T23']))
  })

  it('the night office gives the left wrist and the faint alcohol smell', () => {
    const store = useGameStore()
    store.state.danger = 50
    start(store, 'attack_office_night')
    playOut(store, () => 0)
    expect(store.state.testimony).toEqual(expect.arrayContaining(['T16', 'T24']))
  })

  it('being attacked makes the attack details a secret worth keeping', () => {
    const store = useGameStore()
    start(store, 'attack_stairs')
    playOut(store, () => 0)
    expect(store.state.intel.attack).toBe('clean')
  })
})

describe('running out of health ends the game', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('zero HP plays BAD END 1 and lands on the end screen', () => {
    const store = useGameStore()
    start(store, 'act_1_5')
    store.state.hp = 0
    playOut(store)
    playOut(store)
    expect(store.gameOver).toBe('hp')
    expect(store.screen).toBe('end')
  })

  it('a new game clears it', () => {
    const store = useGameStore()
    store.state.hp = 0
    start(store, 'act_1_5')
    playOut(store)
    playOut(store)
    store.newGame()
    expect(store.gameOver).toBeNull()
  })
})

describe('feedback after a scene', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lists what moved', () => {
    const store = useGameStore()
    start(store, 'act_1_4_a')
    playOut(store)
    expect(store.feed.some(f => f.kind === 'affinity' && f.npc === 'mengyao' && f.delta === 5)).toBe(true)
  })

  it('a gift reports the goodwill it bought', () => {
    const store = useGameStore()
    store.state.hour = 12
    store.state.day = 2
    store.goShop()
    store.buy('hongtashan')
    store.gift('lucheng', 'hongtashan')
    expect(store.feed.some(f => f.kind === 'affinity' && f.npc === 'lucheng' && f.delta === 15)).toBe(true)
  })

  it('items can be dismissed', () => {
    const store = useGameStore()
    start(store, 'act_1_4_a')
    playOut(store)
    const first = store.feed[0]
    store.dismissFeed(first.id)
    expect(store.feed.find(f => f.id === first.id)).toBeUndefined()
  })
})

describe('who the player knows', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lists the people met so far with a plain-language tier, and Laohan by trust', () => {
    const store = useGameStore()
    store.newGame()
    playOut(store)
    const rows = store.relations
    const laohan = rows.find(r => r.id === 'laohan')!
    expect(laohan.label).toBe('戒备')
    expect(laohan.kind).toBe('trust')
    expect(rows.find(r => r.id === 'lucheng')).toMatchObject({ kind: 'affinity', label: '一般' })   // he spoke in the prologue
    expect(rows.find(r => r.id === 'limo')).toBeUndefined()                                        // not met yet
    expect(rows.find(r => (r.id as string) === 'songyan')).toBeUndefined()                                     // not somebody you can win over
  })
})
