import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TimelinePanel from '../src/ui/TimelinePanel.vue'
import type { TimelineRow } from '../src/engine/timeline'

const row = (r: Partial<TimelineRow> & Pick<TimelineRow, 'id' | 'day' | 'hour' | 'kind' | 'label'>): TimelineRow => ({
  depth: 0, onPath: true, isHead: false, forks: false, parent: null, ...r,
})

// 序章: the start. 第 1 天: node 2 forks, node 3 keeps the line, node 4 is the other branch, node 5 is where we are.
const rows: TimelineRow[] = [
  row({ id: 1, kind: 'start', day: 1, hour: 9, label: '故事开始' }),
  row({ id: 2, kind: 'choice', day: 1, hour: 10, parent: 1, label: '说实话 / 沉默', forks: true }),
  row({ id: 3, kind: 'hub', day: 1, hour: 11, parent: 2, label: '刚才：说实话' }),
  row({ id: 4, kind: 'hub', day: 1, hour: 12, parent: 2, label: '刚才：沉默', onPath: false }),
  row({ id: 5, kind: 'hub', day: 1, hour: 12, parent: 3, label: '刚才：继续', isHead: true }),
]

describe('TimelinePanel: chapters', () => {
  it('splits the rows into chapters, opens on the one you are in, and shows one chapter at a time', async () => {
    const w = mount(TimelinePanel, { props: { rows } })
    expect(w.find('[data-testid="chapter-0"]').text()).toContain('序章')
    expect(w.find('[data-testid="chapter-1"]').text()).toContain('第 1 天')
    expect(w.find('[data-testid="chapter-1"]').text()).toContain('9 月 15 日')
    expect(w.find('[data-testid="chapter-1"]').classes()).toContain('on')

    // the chapter you are in shows its nodes; the prologue does not
    expect(w.find('[data-testid="node-2"]').exists()).toBe(true)
    expect(w.find('[data-testid="node-1"]').exists()).toBe(false)

    await w.find('[data-testid="chapter-0"]').trigger('click')
    expect(w.find('[data-testid="node-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="node-2"]').exists()).toBe(false)
    expect(w.find('[data-testid="chapter-0"]').classes()).toContain('on')

    await w.find('[data-testid="chapter-1"]').trigger('click')
    expect(w.find('[data-testid="node-2"]').exists()).toBe(true)
  })
})

describe('TimelinePanel: branch lanes', () => {
  it('the first child keeps the parent lane, the second child opens a new one', () => {
    const w = mount(TimelinePanel, { props: { rows } })
    const parent = w.find('[data-testid="node-2"]').attributes('data-lane')
    const first = w.find('[data-testid="node-3"]').attributes('data-lane')
    const second = w.find('[data-testid="node-4"]').attributes('data-lane')
    expect(first).toBe(parent)
    expect(second).not.toBe(first)
    expect(w.find('[data-testid="node-2"]').attributes('data-chapter')).toBe('1')
  })
})

describe('TimelinePanel: picking a node', () => {
  it('a node shows its time and label, and rewinds only when "回到这里" is pressed', async () => {
    const w = mount(TimelinePanel, { props: { rows } })
    expect(w.find('[data-testid="timeline-detail"]').text()).toContain('点一个节点')

    await w.find('[data-testid="node-3"]').trigger('click')
    const detail = w.find('[data-testid="timeline-detail"]')
    expect(detail.text()).toContain('第 1 天 11:00')
    expect(detail.text()).toContain('刚才：说实话')
    expect(w.find('[data-testid="go-3"]').exists()).toBe(true)

    await w.find('[data-testid="go-3"]').trigger('click')
    expect(w.emitted('rewind')).toEqual([[3]])
  })

  it('the node you are on offers no rewind', async () => {
    const w = mount(TimelinePanel, { props: { rows } })
    await w.find('[data-testid="node-5"]').trigger('click')
    expect(w.find('[data-testid="timeline-detail"]').text()).toContain('你就在这里')
    expect(w.find('[data-testid="go-5"]').exists()).toBe(false)
  })
})

describe('TimelinePanel: rows without a parent', () => {
  it('falls back to the list order and still draws every node', () => {
    const legacy: TimelineRow[] = [
      { id: 1, label: 'a', kind: 'hub', day: 2, hour: 9, depth: 0, onPath: true, isHead: false, forks: false },
      { id: 2, label: 'b', kind: 'hub', day: 2, hour: 10, depth: 0, onPath: true, isHead: false, forks: false },
      { id: 3, label: 'c', kind: 'hub', day: 2, hour: 11, depth: 0, onPath: true, isHead: true, forks: false },
    ]
    const w = mount(TimelinePanel, { props: { rows: legacy } })
    for (const id of [1, 2, 3]) {
      expect(w.find(`[data-testid="node-${id}"]`).exists()).toBe(true)
      expect(w.find(`[data-testid="node-${id}"]`).attributes('data-lane')).toBe('0')
    }
  })
})
