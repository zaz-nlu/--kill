import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SavePanel from '../src/ui/SavePanel.vue'
import TimelinePanel from '../src/ui/TimelinePanel.vue'
import HelpPanel from '../src/ui/HelpPanel.vue'
import type { TimelineRow } from '../src/engine/timeline'

const meta = { day: 3, hour: 14, evidence: 9, testimony: 4, at: 1760000000000 }
const slots = Array.from({ length: 10 }, (_, i) => ({ slot: i + 1, meta: i === 1 ? meta : null }))

describe('SavePanel', () => {
  it('in load mode only the filled slots can be picked, and the auto save leads the list', async () => {
    const w = mount(SavePanel, { props: { mode: 'load', slots, auto: meta } })
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="slot-2"]').attributes('disabled')).toBeUndefined()
    await w.find('[data-testid="slot-2"]').trigger('click')
    await w.find('[data-testid="slot-auto"]').trigger('click')
    expect(w.emitted('pick')).toEqual([[2], ['auto']])
    expect(w.text()).toContain('第 3 天 14:00')
  })

  it('in save mode an empty slot saves at once, an occupied one asks first', async () => {
    const w = mount(SavePanel, { props: { mode: 'save', slots, auto: null } })
    expect(w.find('[data-testid="slot-auto"]').exists()).toBe(false)
    await w.find('[data-testid="slot-1"]').trigger('click')
    expect(w.emitted('pick')).toEqual([[1]])
    await w.find('[data-testid="slot-2"]').trigger('click')
    expect(w.emitted('pick')).toHaveLength(1)
    expect(w.text()).toContain('再点一次确认')
    await w.find('[data-testid="slot-2"]').trigger('click')
    expect(w.emitted('pick')).toEqual([[1], [2]])
  })

  it('delete needs a second click too', async () => {
    const w = mount(SavePanel, { props: { mode: 'load', slots, auto: null } })
    await w.find('[data-testid="remove-2"]').trigger('click')
    expect(w.emitted('remove')).toBeUndefined()
    await w.find('[data-testid="remove-2"]').trigger('click')
    expect(w.emitted('remove')).toEqual([[2]])
  })
})

describe('TimelinePanel', () => {
  const rows: TimelineRow[] = [
    { id: 1, label: '故事开始', kind: 'start', day: 1, hour: 9, depth: 0, onPath: true, isHead: false, forks: false },
    { id: 2, label: '说实话 / 沉默', kind: 'choice', day: 1, hour: 14, depth: 0, onPath: true, isHead: false, forks: true },
    { id: 3, label: '刚才：测试行动', kind: 'hub', day: 1, hour: 15, depth: 0, onPath: false, isHead: false, forks: false },
    { id: 4, label: '刚才：另一件事', kind: 'hub', day: 1, hour: 15, depth: 1, onPath: true, isHead: true, forks: false },
  ]

  it('draws the nodes of the chapter, and rewinds only after a second click on the node', async () => {
    const w = mount(TimelinePanel, { props: { rows } })
    expect(w.findAll('[data-testid^="node-"]')).toHaveLength(3)   // day 1 holds three of them; the start node is the prologue chapter
    expect(w.find('[data-testid="node-4"]').text()).toContain('当前')
    expect(w.find('[data-testid="go-2"]').exists()).toBe(false)
    await w.find('[data-testid="node-2"]').trigger('click')
    await w.find('[data-testid="go-2"]').trigger('click')
    expect(w.emitted('rewind')).toEqual([[2]])
  })

  it('the node you are on offers no rewind', async () => {
    const w = mount(TimelinePanel, { props: { rows } })
    await w.find('[data-testid="node-4"]').trigger('click')
    expect(w.find('[data-testid="go-4"]').exists()).toBe(false)
  })
})

describe('HelpPanel', () => {
  it('renders the title and a handful of tips', () => {
    const w = mount(HelpPanel)
    expect(w.find('[data-testid="help-panel"]').exists()).toBe(true)
    expect(w.text()).toContain('操作说明')
    expect(w.findAll('li').length).toBeGreaterThanOrEqual(4)
  })

  it('the close button emits close', async () => {
    const w = mount(HelpPanel)
    await w.find('[data-testid="help-close"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})

describe('small screens', () => {
  it('the toolbar is one row that holds the sound, rewind, evidence, relations and log buttons together (no fixed offsets to collide)', async () => {
    const { readFileSync } = await import('node:fs')
    const app = readFileSync('src/App.vue', 'utf8')
    expect(app).toContain('class="toolbar"')
    for (const cls of ['timeline-toggle', 'evidence-toggle', 'relations-toggle', 'log-toggle']) expect(app).toContain(cls)
    expect(app).not.toMatch(/\.timeline-toggle\s*\{\s*right:/)
    expect(readFileSync('src/ui/AudioToggle.vue', 'utf8')).not.toContain('position: fixed')
  })

  it('the page declares a phone viewport and the responsive rules ship', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('index.html', 'utf8')).toContain('viewport-fit=cover')
    expect(readFileSync('src/main.ts', 'utf8')).toContain('responsive.css')
    expect(readFileSync('src/ui/responsive.css', 'utf8')).toContain('max-height: 520px')
  })
})
