import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { RecordInfo } from '../src/engine/data'
import EvidencePanel from '../src/ui/EvidencePanel.vue'
import EvidencePicker from '../src/ui/EvidencePicker.vue'
import DeductionScreen from '../src/ui/DeductionScreen.vue'

const evidence = [
  { id: 'E07', name: '现场照片', desc: '宋砚倒在桌边。' },
  { id: 'E01', name: '数据线 LYC-03', desc: '勒颈凶器。' },
  { id: 'E03', name: '桌上的刻痕', desc: '桌角有一道新刻痕。' },
]
const testimony = [
  { id: 'T01', name: '荣誉底下', desc: '最重要的东西放在荣誉底下。' },
  { id: 'T02', name: '四分钟', desc: '我只在里面待了四分钟。' },
]
const conclusions = [{
  id: 'C05',
  name: '奖杯里藏着东西',
  desc: '刻痕与那句话一起指向奖杯。',
  components: [
    { id: 'E03', name: '桌上的刻痕', kind: 'evidence' as const },
    { id: 'T02', name: '四分钟', kind: 'testimony' as const },
  ],
}]
const folded = ['E03', 'T02']
const panelInfo = {
  E07: { type: '影像', who: ['宋砚'] },
  E01: { type: '记录', who: ['林一程'] },
  E03: { type: '记录', who: ['宋砚'] },
  T01: { type: '证言', who: ['宋砚'] },
  T02: { type: '证言', who: ['林一程'] },
}

describe('EvidencePanel: conclusion cards', () => {
  it('folds the clues a conclusion card stands for until they are asked for', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony, conclusions, folded } })
    expect(w.find('[data-testid="evidence-item-E03"]').exists()).toBe(false)
    expect(w.find('[data-testid="toggle-archived"]').text()).toContain('显示已归档')
    await w.find('[data-testid="toggle-archived"]').trigger('click')
    expect(w.find('[data-testid="evidence-item-E03"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-item-E03"]').text()).toContain('已归档')
  })

  it('has a conclusion tab that walks back to the clues it was drawn from', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony, conclusions, folded } })
    expect(w.find('[data-testid="tab-conclusions"]').text()).toContain('结论 1')
    await w.find('[data-testid="tab-conclusions"]').trigger('click')
    expect(w.find('[data-testid="evidence-item-C05"]').exists()).toBe(true)
    const detail = w.find('[data-testid="evidence-detail"]')
    expect(detail.text()).toContain('奖杯里藏着东西')
    expect(detail.text()).toContain('刻痕与那句话一起指向奖杯')
    expect(detail.text()).toContain('由这些线索得出')

    await w.find('[data-testid="component-E03"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="evidence-item-E03"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-detail"]').text()).toContain('桌上的刻痕')

    await w.find('[data-testid="tab-conclusions"]').trigger('click')
    await w.find('[data-testid="component-T02"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="evidence-item-T02"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-detail"]').text()).toContain('四分钟')
  })

  it('narrows the open tab by kind and by person', async () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony, conclusions, folded, info: panelInfo } })
    await w.find('[data-testid="filter-type-记录"]').trigger('click')
    expect(w.find('[data-testid="evidence-item-E01"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-item-E07"]').exists()).toBe(false)

    await w.find('[data-testid="filter-type-全部"]').trigger('click')
    await w.find('[data-testid="filter-who-宋砚"]').trigger('click')
    expect(w.find('[data-testid="evidence-item-E07"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-item-E01"]').exists()).toBe(false)
  })

  it('shows no conclusions tab and no filters when there is no card and no record info', () => {
    const w = mount(EvidencePanel, { props: { evidence, testimony } })
    expect(w.find('[data-testid="tab-conclusions"]').exists()).toBe(false)
    expect(w.find('[data-testid="filter-type-全部"]').exists()).toBe(false)
    expect(w.find('[data-testid="evidence-item-E07"]').exists()).toBe(true)
  })
})

const pickerInfo: Record<string, RecordInfo> = {
  E07: { id: 'E07', name: '现场照片', desc: '宋砚倒在桌边。', type: '影像', who: ['宋砚'], image: null },
  E03: { id: 'E03', name: '桌上的刻痕', desc: '桌角有一道新刻痕。', type: '记录', who: ['宋砚'], image: null },
  C05: { id: 'C05', name: '奖杯里藏着东西', desc: '刻痕与那句话一起指向奖杯。', type: '结论', who: [], image: null },
}

describe('EvidencePicker: conclusion cards', () => {
  it('files folded clues away until they are asked for', async () => {
    const w = mount(EvidencePicker, { props: { ids: ['E07', 'E03'], info: pickerInfo, quotes: [], folded: ['E03'] } })
    expect(w.find('[data-testid="record-E03"]').exists()).toBe(false)
    expect(w.find('[data-testid="picker-toggle-archived"]').text()).toContain('显示已归档')
    await w.find('[data-testid="picker-toggle-archived"]').trigger('click')
    expect(w.find('[data-testid="record-E03"]').exists()).toBe(true)
    expect(w.find('[data-testid="record-E03"]').text()).toContain('已归档')
  })

  it('has a tab of its own for conclusion cards, still listed under 全部', async () => {
    const w = mount(EvidencePicker, { props: { ids: ['E07', 'C05'], info: pickerInfo, quotes: [] } })
    expect(w.find('[data-testid="record-C05"]').exists()).toBe(true)
    expect(w.find('[data-testid="tab-结论"]').exists()).toBe(true)
    expect(w.find('[data-testid="record-C05"]').text()).toContain('结')
    await w.find('[data-testid="tab-结论"]').trigger('click')
    expect(w.find('[data-testid="record-C05"]').exists()).toBe(true)
    expect(w.find('[data-testid="record-E07"]').exists()).toBe(false)
  })

  it('without folded it lists everything, exactly as before', () => {
    const w = mount(EvidencePicker, { props: { ids: ['E07', 'E03'], info: pickerInfo, quotes: [] } })
    expect(w.find('[data-testid="record-E03"]').exists()).toBe(true)
    expect(w.find('[data-testid="picker-toggle-archived"]').exists()).toBe(false)
  })
})

const deductionBase = {
  prompt: '把线索连起来',
  pick: 2,
  items: [
    { id: 'E07', name: '现场照片', kind: 'evidence' as const },
    { id: 'T01', name: '荣誉底下', kind: 'testimony' as const },
  ],
  left: 3,
  hint: '',
  line: '',
}

describe('DeductionScreen: the card handed over', () => {
  it('with a result, only the conclusion and the way on are shown', async () => {
    const w = mount(DeductionScreen, {
      props: { ...deductionBase, result: { name: '奖杯里藏着东西', desc: '刻痕与那句话一起指向奖杯。' } },
    })
    const card = w.find('[data-testid="deduction-result"]')
    expect(card.text()).toContain('得出结论')
    expect(card.text()).toContain('奖杯里藏着东西')
    expect(card.text()).toContain('刻痕与那句话一起指向奖杯')
    expect(w.find('[data-testid="slot-0"]').exists()).toBe(false)
    expect(w.find('[data-testid="item-E07"]').exists()).toBe(false)
    expect(w.find('[data-testid="deduce"]').exists()).toBe(false)

    await w.find('[data-testid="deduce-continue"]').trigger('click')
    expect(w.emitted('continue')).toHaveLength(1)
  })

  it('without a result the table is as it was', () => {
    const w = mount(DeductionScreen, { props: deductionBase })
    expect(w.find('[data-testid="slot-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="item-E07"]').exists()).toBe(true)
    expect(w.find('[data-testid="deduce"]').exists()).toBe(true)
    expect(w.find('[data-testid="deduce-continue"]').exists()).toBe(false)
  })
})
