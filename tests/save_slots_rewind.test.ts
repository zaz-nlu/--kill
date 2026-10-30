import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import { skipEvents } from './helpers'
import type { SceneNode } from '../src/engine/script'

const TEST_SCENE: SceneNode[] = [
  { type: 'say', speaker: 'narration', text: '开场' },
  {
    type: 'choice',
    options: [
      { text: '说实话', effects: [{ kind: 'trust', delta: 10 }] },
      { text: '沉默', effects: [{ kind: 'trust', delta: -5 }] },
    ],
  },
  { type: 'say', speaker: 'narration', text: '之后' },
]

function fresh() {
  localStorage.clear()
  setActivePinia(createPinia())
  const store = useGameStore()
  store.state.day = 1
  store.state.hour = 13
  skipEvents(store, 1)
  store.data.scenes.t_scene = TEST_SCENE
  store.data.actions.push({ id: 't-1', label: '测试行动', location: '家', days: [1], costHours: 1, scene: 't_scene', kind: 'key' })
  store.waitAnHour() // 14:00: the first hub is recorded
  return store
}

function playUntilChoice(store: ReturnType<typeof useGameStore>) {
  let guard = 0
  while (store.screen === 'scene' && store.currentNode && store.currentNode.type !== 'choice') {
    if (guard++ > 50) throw new Error('runaway')
    store.advance()
  }
}

function finish(store: ReturnType<typeof useGameStore>) {
  let guard = 0
  while (store.screen === 'scene' && store.currentNode) {
    if (guard++ > 50) throw new Error('runaway')
    store.advance(store.currentNode.type === 'choice' ? 0 : undefined)
  }
}

describe('the rewind tree in the store', () => {
  beforeEach(() => localStorage.clear())

  it('records a node for every hour at the hub, labelled with what you just did', () => {
    const store = fresh()
    expect(store.timelineRows.map(r => r.hour)).toEqual([14])
    store.startAction('t-1')
    playUntilChoice(store)
    finish(store)
    const rows = store.timelineRows
    expect(rows.filter(r => r.kind === 'hub').map(r => r.hour)).toEqual([14, 15])
    expect(rows.find(r => r.hour === 15 && r.kind === 'hub')!.label).toContain('测试行动')
  })

  it('records a node at a consequential choice, between the two hubs', () => {
    const store = fresh()
    store.startAction('t-1')
    playUntilChoice(store)
    const choice = store.timelineRows.find(r => r.kind === 'choice')!
    expect(choice.label).toContain('说实话')
    expect(choice.label).toContain('沉默')
    expect(store.timelineRows.map(r => r.kind)).toEqual(['hub', 'choice'])
  })

  it('rewinding to the choice replays the scene up to it, with the state from before it', () => {
    const store = fresh()
    const trust = store.state.trust
    store.startAction('t-1')
    playUntilChoice(store)
    store.advance(0)               // 说实话: trust +10
    finish(store)
    expect(store.state.trust).toBe(trust + 10)
    expect(store.state.hour).toBe(15)

    store.rewindTo(store.timelineRows.find(r => r.kind === 'choice')!.id)
    expect(store.state.trust).toBe(trust)
    expect(store.state.hour).toBe(14)
    expect(store.screen).toBe('scene')
    expect(store.currentNode?.type).toBe('choice')
    expect(store.timelineRows.filter(r => r.kind === 'choice')).toHaveLength(1)   // arriving again adds nothing

    store.advance(1)               // 沉默: trust −5: a new branch
    finish(store)
    expect(store.state.trust).toBe(trust - 5)
    const rows = store.timelineRows
    expect(rows.filter(r => r.kind === 'hub')).toHaveLength(3)
    expect(rows.some(r => r.depth > 0)).toBe(true)
  })

  it('rewinding to a hub restores the state and lands on the hub without a duplicate node', () => {
    const store = fresh()
    const hubId = store.timelineRows[0].id
    store.state.money = 7
    store.startAction('t-1')
    playUntilChoice(store)
    finish(store)
    const before = store.timelineRows.length
    store.rewindTo(hubId)
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(14)
    expect(store.state.money).not.toBe(7)
    expect(store.timelineRows).toHaveLength(before)
    expect(store.timelineRows.find(r => r.id === hubId)!.isHead).toBe(true)
  })

  it('the log goes back with the state: a branch has only its own lines', () => {
    const store = fresh()
    const hubId = store.timelineRows[0].id
    const lines = store.state.backlog.length
    store.startAction('t-1')
    playUntilChoice(store)
    finish(store)
    expect(store.state.backlog.length).toBeGreaterThan(lines)
    store.rewindTo(hubId)
    expect(store.state.backlog).toHaveLength(lines)
  })

  it('works on the real script: the day-2 lunch choice can be rewound to and answered the other way', () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 11
    skipEvents(store, 2)
    delete store.state.flags['event:day2_lunch']
    store.waitAnHour()                       // 12:00: the lunch event fires
    playUntilChoice(store)
    const node = store.timelineRows.find(r => r.kind === 'choice')
    expect(node).toBeDefined()
    expect(node!.label).toContain('全说了')
    const before = JSON.stringify(store.state.flags)
    store.advance(0)                         // 全说了
    store.rewindTo(node!.id)
    expect(store.screen).toBe('scene')
    expect(store.currentNode?.type).toBe('choice')
    expect(JSON.stringify(store.state.flags)).toBe(before)
    store.advance(1)                         // 还没什么头绪
    expect(store.timelineRows.filter(r => r.kind === 'choice')).toHaveLength(1)
  })

  it('a new game starts a new tree with a start node', () => {
    const store = fresh()
    expect(store.timelineRows.length).toBeGreaterThan(0)
    store.newGame()
    expect(store.timelineRows).toHaveLength(1)
    expect(store.timelineRows[0].kind).toBe('start')
  })
})

describe('save slots', () => {
  it('ten slots hold different saves; the old single slot is slot 1', () => {
    const store = fresh()
    store.state.money = 11
    store.saveGame(3)
    store.state.money = 22
    store.saveGame(1)
    expect(store.slotList).toHaveLength(10)
    expect(store.slotList[2].meta?.day).toBe(1)
    expect(store.slotList[3].meta).toBeNull()
    expect(localStorage.getItem('jiudian-save:c1:1')).not.toBeNull()
    store.state.money = 99
    store.loadGame(3)
    expect(store.state.money).toBe(11)
    store.loadGame(1)
    expect(store.state.money).toBe(22)
  })

  it('deleting a slot empties it', () => {
    const store = fresh()
    store.saveGame(2)
    expect(store.slotList[1].meta).not.toBeNull()
    store.deleteSlot(2)
    expect(store.slotList[1].meta).toBeNull()
  })

  it('a save taken at the hub is a bookmark: loading it keeps the tree and its branches', () => {
    const store = fresh()
    store.saveGame(2)
    const mark = store.timelineRows[0].id
    store.startAction('t-1')
    playUntilChoice(store)
    finish(store)
    const nodes = store.timelineRows.length
    expect(nodes).toBeGreaterThan(1)
    store.loadGame(2)
    expect(store.screen).toBe('hub')
    expect(store.state.hour).toBe(14)
    expect(store.timelineRows).toHaveLength(nodes)
    expect(store.timelineRows.find(r => r.id === mark)!.isHead).toBe(true)
  })

  it('the hub keeps an automatic save, and "continue" brings back the last session with its tree', () => {
    const first = fresh()
    first.startAction('t-1')
    playUntilChoice(first)
    first.advance(0)
    finish(first)
    expect(first.autoSlot?.hour).toBe(15)
    const nodes = first.timelineRows.length

    setActivePinia(createPinia())            // the page is reloaded
    const again = useGameStore()
    expect(again.hasSave).toBe(true)
    expect(again.timelineRows).toHaveLength(0)
    again.continueAuto()
    expect(again.screen).toBe('hub')
    expect(again.state.hour).toBe(15)
    expect(again.timelineRows).toHaveLength(nodes)
  })

  it('a slot saved away from the hub has no bookmark: loading it starts a fresh tree', () => {
    const store = fresh()
    store.state.money = 5
    store.screen = 'scene'
    store.saveGame(4)
    store.startAction('t-1')
    store.loadGame(4)
    expect(store.screen).toBe('hub')
    expect(store.state.money).toBe(5)
    expect(store.timelineRows).toHaveLength(1)
    expect(store.timelineRows[0].label).toContain('读取存档')
  })
})
