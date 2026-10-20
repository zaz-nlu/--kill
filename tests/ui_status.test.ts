import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HudBar from '../src/ui/HudBar.vue'
import RelationsPanel from '../src/ui/RelationsPanel.vue'
import FeedToasts from '../src/ui/FeedToasts.vue'

describe('HudBar', () => {
  const base = { day: 1, hour: 13, money: 150, danger: 0, hp: 3 }

  it('shows the remaining health as hearts', () => {
    const w = mount(HudBar, { props: { ...base, hp: 2 } })
    expect(w.findAll('[data-testid="hp"] .full')).toHaveLength(2)
    expect(w.findAll('[data-testid="hp"] .empty')).toHaveLength(1)
  })

  it('names the danger mood for the screen to react to, and never shows a number', () => {
    for (const [danger, tier] of [[0, 'calm'], [30, 'uneasy'], [60, 'tense'], [90, 'critical']] as const) {
      const w = mount(HudBar, { props: { ...base, danger } })
      expect(w.attributes('data-tier')).toBe(tier)
      expect(w.text()).not.toContain(String(danger === 0 ? 'nope' : danger))
    }
  })

  it('the heartbeat appears from the uneasy tier and speeds up', () => {
    expect(mount(HudBar, { props: { ...base, danger: 29 } }).find('[data-testid="heartbeat"]').exists()).toBe(false)
    expect(mount(HudBar, { props: { ...base, danger: 30 } }).find('[data-testid="heartbeat"]').classes()).toContain('slow')
    expect(mount(HudBar, { props: { ...base, danger: 60 } }).find('[data-testid="heartbeat"]').classes()).toContain('mid')
    expect(mount(HudBar, { props: { ...base, danger: 90 } }).find('[data-testid="heartbeat"]').classes()).toContain('fast')
  })
})

describe('RelationsPanel', () => {
  const rows = [
    { id: 'lucheng', name: '陆诚', kind: 'affinity' as const, tier: 'guarded', label: '一般', fill: 50 },
    { id: 'laohan', name: '老韩', kind: 'trust' as const, tier: 'low', label: '戒备', fill: 20 },
  ]

  it('lists each person with a word, not a score', () => {
    const w = mount(RelationsPanel, { props: { rows } })
    expect(w.find('[data-testid="relation-lucheng"]').text()).toContain('陆诚')
    expect(w.find('[data-testid="relation-lucheng"]').text()).toContain('一般')
    expect(w.find('[data-testid="relation-laohan"]').text()).toContain('戒备')
    expect(w.text()).not.toMatch(/\d/)
  })

  it('says so when nobody has been met', () => {
    const w = mount(RelationsPanel, { props: { rows: [] } })
    expect(w.text()).toContain('还没有')
  })
})

describe('FeedToasts', () => {
  it('words each change, and says nothing at all about danger', () => {
    const items = [
      { id: 1, kind: 'affinity' as const, npc: 'mengyao' as const, delta: 5 },
      { id: 2, kind: 'trust' as const, delta: -15 },
      { id: 3, kind: 'hp' as const, delta: -1 },
      { id: 4, kind: 'money' as const, delta: -22 },
      { id: 5, kind: 'danger' as const, delta: 10 },
    ]
    const w = mount(FeedToasts, { props: { items, names: { mengyao: '孟遥' } } })
    const text = w.text()
    expect(text).toContain('孟遥 好感 +5')
    expect(text).toContain('信任 −15')
    expect(text).toContain('生命 −1')
    expect(text).toContain('¥ −22')
    expect(w.findAll('[data-testid^="toast-"]')).toHaveLength(4)
    expect(text).not.toContain('危险')
  })

  it('colours gains and losses differently', () => {
    const w = mount(FeedToasts, { props: { items: [{ id: 1, kind: 'trust' as const, delta: 10 }, { id: 2, kind: 'trust' as const, delta: -10 }], names: {} } })
    expect(w.find('[data-testid="toast-1"]').classes()).toContain('up')
    expect(w.find('[data-testid="toast-2"]').classes()).toContain('down')
  })
})
