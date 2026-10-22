import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HubScreen from '../src/ui/HubScreen.vue'
import ShopPanel from '../src/ui/ShopPanel.vue'
import ExamScreen from '../src/ui/ExamScreen.vue'
import BacklogPanel from '../src/ui/BacklogPanel.vue'
import ChoiceList from '../src/ui/ChoiceList.vue'
import { loadData } from '../src/engine/data'

const { items } = loadData()

// Long lists scroll inside their own box; the controls around them stay put.
const inside = (w: ReturnType<typeof mount>, box: string, target: string) => w.find(`[data-testid="${box}"] ${target}`).exists()

describe('long lists scroll inside a box, not the whole panel', () => {
  it('hub: the actions scroll, the shop/wait/rest/save bar does not', () => {
    const actions = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, label: `行动${i}`, location: 'x', days: [1], scene: 's', costHours: 1 }))
    const w = mount(HubScreen, { props: { actions, canShop: true, inventory: {}, items } })
    expect(inside(w, 'scroll', '[data-testid="action-a11"]')).toBe(true)
    for (const id of ['go-shop', 'wait', 'rest', 'save']) expect(inside(w, 'scroll', `[data-testid="${id}"]`), id).toBe(false)
  })

  it('shop: the goods scroll, leaving does not', () => {
    const w = mount(ShopPanel, { props: { items, money: 100, itemsLeft: 2 } })
    expect(inside(w, 'scroll', '[data-testid="buy-jianbing"]')).toBe(true)
    expect(inside(w, 'scroll', '[data-testid="leave-shop"]')).toBe(false)
  })

  it('exam: the statement scrolls, the reaction and the controls stay put', () => {
    const w = mount(ExamScreen, {
      props: {
        statement: { id: 's', text: '一句很长的证词', steps: [] }, index: 0, total: 3, persuasion: 5,
        lastLines: [{ name: '黎默', text: '回答' }], recordIds: [], names: {}, quotes: [], argument: null,
      },
    })
    expect(w.find('[data-testid="scroll"]').text()).toContain('一句很长的证词')
    expect(w.find('[data-testid="scroll"]').text()).not.toContain('回答')      // the reply has a block of its own, never pushed out of sight
    expect(w.find('[data-testid="reaction"]').text()).toContain('回答')
    for (const id of ['prev', 'press', 'open-record', 'next']) expect(inside(w, 'scroll', `[data-testid="${id}"]`), id).toBe(false)
  })

  it('backlog: the lines scroll, the tabs do not', () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, speaker: 'lyc' as const, text: `第${i}句`, noted: false, day: 1, hour: 9 }))
    const w = mount(BacklogPanel, { props: { lines, names: { lyc: '林一程' } } })
    expect(inside(w, 'scroll', '[data-testid="note-l29"]')).toBe(true)
    expect(inside(w, 'scroll', '[data-testid="tab-log"]')).toBe(false)
  })

  it('choices: many options scroll in a box', () => {
    const w = mount(ChoiceList, { props: { options: Array.from({ length: 9 }, (_, i) => `选项${i}`) } })
    expect(w.find('[data-testid="scroll"]').text()).toContain('选项8')
  })
})
