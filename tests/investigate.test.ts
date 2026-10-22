import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { isSeen, markSeen, visibleHotspots, type RoomDef } from '../src/engine/rooms'
import { useGameStore } from '../src/engine/store'
import { loadData } from '../src/engine/data'
import { skipEvents } from './helpers'
import { loadSave, serializeState } from '../src/engine/save'
import backgrounds from '../src/data/backgrounds.json'
import InvestigateScreen from '../src/ui/InvestigateScreen.vue'

const room: RoomDef = {
  id: 'r', label: '某处', bg: 'office',
  hotspots: [
    { id: 'h1', label: '桌子', rect: [10, 10, 20, 20], scene: 's1' },
    { id: 'h2', label: '抽屉', rect: [50, 50, 10, 10], scene: 's2', requires: { kind: 'hasEvidence', id: 'E01' } },
  ],
}

describe('rooms engine', () => {
  it('hides hotspots whose requirement is not met', () => {
    const s = createInitialState()
    expect(visibleHotspots(s, room).map(h => h.id)).toEqual(['h1'])
    s.evidence.push('E01')
    expect(visibleHotspots(s, room).map(h => h.id)).toEqual(['h1', 'h2'])
  })

  it('remembers what was inspected, and the memory survives a save', () => {
    const s = createInitialState()
    expect(isSeen(s, 'h1')).toBe(false)
    markSeen(s, 'h1')
    expect(isSeen(s, 'h1')).toBe(true)
    expect(visibleHotspots(s, room)[0].seen).toBe(true)
    const r = loadSave(serializeState(s))
    expect(r.ok && isSeen(r.state, 'h1')).toBe(true)
  })
})

describe('room data', () => {
  const data = loadData()
  it('every room points at real backgrounds, scenes and in-bounds rectangles', () => {
    expect(data.rooms.length).toBeGreaterThanOrEqual(2)
    for (const r of data.rooms) {
      expect(backgrounds.some(b => b.id === r.bg), `${r.id} bg`).toBe(true)
      expect(r.hotspots.length, r.id).toBeGreaterThan(0)
      for (const h of r.hotspots) {
        expect(data.scenes[h.scene], `${h.id} scene`).toBeDefined()
        const [x, y, w, hh] = h.rect
        expect(x >= 0 && y >= 0 && w > 0 && hh > 0 && x + w <= 100 && y + hh <= 100, `${h.id} rect`).toBe(true)
      }
    }
  })
  it('every room action names a known room', () => {
    for (const a of data.actions.filter(x => x.room)) expect(data.rooms.some(r => r.id === a.room), a.id).toBe(true)
  })
})

describe('store: investigating', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function finishScene(store: ReturnType<typeof useGameStore>) {
    let guard = 0
    while (store.screen === 'scene') {
      if (guard++ > 100) throw new Error('scene never ended')
      store.advance()
    }
  }

  function enter() {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 10
    skipEvents(store, 2)
    store.screen = 'hub'
    store.startAction('2-2')
    return store
  }

  it('entering a room action shows the room on its background with its hotspots', () => {
    const store = enter()
    expect(store.screen).toBe('investigate')
    expect(store.room?.id).toBe('meeting_b')
    expect(store.stage.bg).toBe('meeting_b')
    expect(store.hotspots.length).toBeGreaterThan(0)
  })

  it('inspecting the projector plays its scene, finds E11, then returns to the room', () => {
    const store = enter()
    store.inspect('mb_projector')
    expect(store.screen).toBe('scene')
    finishScene(store)
    expect(store.screen).toBe('investigate')
    expect(store.state.evidence).toContain('E11')
    expect(store.hotspots.find(h => h.id === 'mb_projector')?.seen).toBe(true)
  })

  it('inspecting the same thing twice does not duplicate evidence', () => {
    const store = enter()
    store.inspect('mb_projector'); finishScene(store)
    store.inspect('mb_projector'); finishScene(store)
    expect(store.state.evidence.filter(e => e === 'E11')).toHaveLength(1)
  })

  it('leaving costs the action hours once and returns to the hub', () => {
    const store = enter()
    store.inspect('mb_laptop'); finishScene(store)
    expect(store.state.hour).toBe(10)
    store.leaveRoom()
    expect(store.state.hour).toBe(11)
    expect(store.screen).toBe('hub')
    expect(store.room).toBeNull()
  })

  it('ignores a hotspot that is not in the room', () => {
    const store = enter()
    store.inspect('nope')
    expect(store.screen).toBe('investigate')
  })

  it('a spot you already looked at is not replayed: no second dose of danger', () => {
    const store = enter()
    store.inspect('mb_projector'); finishScene(store)
    const danger = store.state.danger
    store.inspect('mb_projector')
    expect(store.screen).toBe('investigate')
    expect(store.state.danger).toBe(danger)
    expect(store.notice).toContain('查过')
  })

  it('a sneaked search has a budget: the last look ends it, and the hour is paid', () => {
    const store = enter()
    const r = store.data.rooms.find(x => x.id === 'meeting_b')!
    r.budget = 2
    store.inspect('mb_laptop'); finishScene(store)
    expect(store.looksLeft).toBe(1)
    expect(store.screen).toBe('investigate')
    store.inspect('mb_glass'); finishScene(store)
    expect(store.screen).toBe('hub')
    expect(store.room).toBeNull()
    expect(store.state.hour).toBe(11)
    delete r.budget
  })
})

describe('InvestigateScreen', () => {
  const hotspots = [
    { id: 'h1', label: '桌子', rect: [10, 10, 20, 20] as [number, number, number, number], scene: 's1', seen: false },
    { id: 'h2', label: '抽屉', rect: [50, 50, 10, 10] as [number, number, number, number], scene: 's2', seen: true },
  ]

  it('draws a placed button per hotspot, marks the seen ones, and emits inspect', async () => {
    const w = mount(InvestigateScreen, { props: { label: '某处', hotspots } })
    const h1 = w.find('[data-testid="hotspot-h1"]')
    expect(h1.attributes('style')).toContain('left: 10%')
    expect(h1.attributes('style')).toContain('width: 20%')
    expect(w.find('[data-testid="hotspot-h2"]').classes()).toContain('seen')
    await h1.trigger('click')
    expect(w.emitted('inspect')?.[0]).toEqual(['h1'])
  })

  it('has a leave button', async () => {
    const w = mount(InvestigateScreen, { props: { label: '某处', hotspots } })
    await w.find('[data-testid="leave-room"]').trigger('click')
    expect(w.emitted('leave')).toHaveLength(1)
  })
})
