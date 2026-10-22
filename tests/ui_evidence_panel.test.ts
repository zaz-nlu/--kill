import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EvidencePanel from '../src/ui/EvidencePanel.vue'
import { useGameStore } from '../src/engine/store'

const evidence = [
  { id: 'E01', name: '数据线 LYC-03', desc: '勒颈凶器，贴着林一程的标签。' },
  { id: 'E07', name: '现场照片', desc: '宋砚倒在桌边。' },
]
const testimony = [{ id: 'T01', name: '荣誉底下', desc: '宋砚敲着奖杯说：我最重要的东西都放在荣誉底下。' }]

describe('EvidencePanel', () => {
  it('lists what has been collected, in order, and shows the first item at once', () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    const items = w.findAll('[data-testid^="evidence-item-"]')
    expect(items.map(i => i.attributes('data-testid'))).toEqual(['evidence-item-E01', 'evidence-item-E07'])
    expect(w.find('[data-testid="evidence-detail"]').text()).toContain('数据线 LYC-03')
    expect(w.find('[data-testid="evidence-detail"]').text()).toContain('勒颈凶器')
  })

  it('shows the picture and the description of the item you pick', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    await w.find('[data-testid="evidence-item-E07"]').trigger('click')
    const detail = w.find('[data-testid="evidence-detail"]')
    expect(detail.text()).toContain('现场照片')
    expect(detail.text()).toContain('宋砚倒在桌边')
    expect(detail.find('img[data-testid="detail-image"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-item-E07"]').classes()).toContain('on')
  })

  it('testimony is on its own tab and has no picture', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    await w.find('[data-testid="tab-testimony"]').trigger('click')
    expect(w.find('[data-testid="evidence-item-T01"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-item-E01"]').exists()).toBe(false)
    expect(w.find('[data-testid="evidence-detail"]').text()).toContain('荣誉底下')
    expect(w.find('img[data-testid="detail-image"]').exists()).toBe(false)
  })

  it('says so when there is nothing yet', () => {
    const w = mount(EvidencePanel, { props: { evidence: [], testimony: [] } })
    expect(w.text()).toContain('还没有收集到证物')
    const t = mount(EvidencePanel, { props: { evidence: [], testimony: [] } })
    expect(t.find('[data-testid="evidence-detail"]').exists()).toBe(false)
  })

  it('has a close button', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    await w.find('[data-testid="close-evidence"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('every list is a scroll box', () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    expect(w.find('[data-testid="scroll"]').exists()).toBe(true)
  })
})

describe('store: what the player holds', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('collected evidence and testimony come with their names and descriptions, in the order they were found', () => {
    const store = useGameStore()
    store.state.evidence.push('E07', 'E01')
    store.state.testimony.push('T01')
    expect(store.collected.evidence.map(e => e.id)).toEqual(['E07', 'E01'])
    expect(store.collected.evidence[1]).toMatchObject({ name: '数据线 LYC-03' })
    expect(store.collected.testimony[0]).toMatchObject({ id: 'T01', name: '荣誉底下' })
  })

  it('an id with no definition still shows up under its own name', () => {
    const store = useGameStore()
    store.state.evidence.push('E99')
    expect(store.collected.evidence).toEqual([{ id: 'E99', name: 'E99', desc: '' }])
  })
})
