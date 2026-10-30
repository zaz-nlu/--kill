import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { leadLine } from '../src/engine/deduction'
import { useGameStore } from '../src/engine/store'
import { loadData } from '../src/engine/data'
import DeductionScreen from '../src/ui/DeductionScreen.vue'

const data = loadData()
const defs = Object.values(data.deductions)

describe('Lin speaks while the player thinks: the data', () => {
  it('every question has an opening line, two hints and a line of insight', () => {
    expect(defs).toHaveLength(19)
    for (const d of defs) {
      expect(d.intro?.length ?? 0, `${d.id} intro`).toBeGreaterThanOrEqual(1)
      expect(d.hints, `${d.id} hints`).toHaveLength(2)
      expect(d.aha, `${d.id} aha`).toBeTruthy()
    }
  })

  it('his words never name the culprit, the case numbers, or spell out who did it', () => {
    for (const d of defs) {
      const text = [...(d.intro ?? []), ...d.hints, d.aha ?? ''].join('')
      expect(text, d.id).not.toContain('黎默')
      expect(text, d.id).not.toMatch(/[ET]\d\d/)
      expect(text, d.id).not.toContain('凶手是')
    }
  })
})

describe('leadLine', () => {
  it('says something different for none, most, and nearly all of the pieces', () => {
    expect(leadLine(0, 3)).toBe('……不对。这几样，连不到一块。')
    expect(leadLine(2, 3)).toBe('差一点。有一样，不该放在这儿。')
    expect(leadLine(1, 3)).toBe('有对得上的，可还缺点什么。')
    expect(leadLine(1, 2)).toBe('差一点。有一样，不该放在这儿。')
  })
})

describe('store: his voice in the evening reasoning', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function atTheEvening() {
    const store = useGameStore()
    store.state.evidence.push('E03', 'E04')
    store.state.testimony.push('T02')
    store.data.scenes['tmp_merge_night'] = [
      { type: 'deduce', id: 'tier:1' },
      { type: 'say', speaker: 'lyc', text: '夜里过去了' },
    ]
    store.screen = 'scene'
    store.playScene('tmp_merge_night')
    return store
  }

  it('opens with his own line, and a wrong guess answers in his voice', () => {
    const store = atTheEvening()
    const def = data.deductions.m01
    expect(store.deduction?.intro).toEqual(def.intro)
    expect(store.deduction?.lead).toBe('')

    // E03 and E04 belong to the answer, E05 does not: two of three slots are right.
    const overlap = ['E03', 'E04', 'E05'].filter(id => def.answer.includes(id)).length
    expect(store.submitDeduction(['E03', 'E04', 'E05']).kind).toBe('wrong')
    expect(store.deduction?.lead).toBe(leadLine(overlap, def.pick))
    expect(store.deduction?.lead).toBe('差一点。有一样，不该放在这儿。')
    expect(store.deduction?.hint).toBe(def.hints[0])
  })

  it('the right pieces give the card its line of insight', () => {
    const store = atTheEvening()
    expect(store.submitDeduction(['E03', 'E04', 'T02']).kind).toBe('solved')
    expect(store.deductionResult?.aha).toBe(data.deductions.m01.aha)
  })

  it('clues already folded into a conclusion sink to the end, still among the choices', () => {
    const store = atTheEvening()
    store.state.evidence.push('E05')
    store.state.flags['deduce:night2:solved'] = true          // that card folds T02 into itself
    const items = store.deduction!.items
    expect(items.map(i => i.id)).toEqual(['E03', 'E04', 'E05', 'T02'])
    expect(items.map(i => i.folded)).toEqual([false, false, false, true])
  })
})

describe('DeductionScreen: the monologue blocks', () => {
  const base = {
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

  it('shows the opening monologue, one line per sentence', () => {
    const w = mount(DeductionScreen, { props: { ...base, intro: ['第一句', '第二句'] } })
    const intro = w.find('[data-testid="deduce-intro"]')
    expect(intro.exists()).toBe(true)
    expect(intro.text()).toContain('林一程')
    expect(intro.findAll('p')).toHaveLength(2)
    expect(intro.text()).toContain('第二句')
  })

  it('shows his lead in before the hint', () => {
    const w = mount(DeductionScreen, { props: { ...base, lead: '差一点。有一样，不该放在这儿。' } })
    const lead = w.find('[data-testid="deduce-lead"]')
    expect(lead.exists()).toBe(true)
    expect(lead.text()).toContain('差一点')
    expect(lead.text()).toContain('林一程')
  })

  it('shows his line of insight above the name on the card', () => {
    const w = mount(DeductionScreen, {
      props: { ...base, result: { name: '我在里面只有四分钟', desc: '四分钟。', aha: '四分钟。至少这一点，我能替自己说话了。' } },
    })
    const aha = w.find('[data-testid="deduce-aha"]')
    expect(aha.exists()).toBe(true)
    expect(aha.text()).toContain('林一程')
    expect(aha.text()).toContain('我能替自己说话了')
    const card = w.find('[data-testid="deduction-result"]')
    expect(card.text().indexOf('我能替自己说话了')).toBeLessThan(card.text().indexOf('我在里面只有四分钟'))
  })

  it('none of them appear when nothing is passed', () => {
    const w = mount(DeductionScreen, { props: base })
    expect(w.find('[data-testid="deduce-intro"]').exists()).toBe(false)
    expect(w.find('[data-testid="deduce-lead"]').exists()).toBe(false)
    expect(w.find('[data-testid="deduce-aha"]').exists()).toBe(false)
  })

  it('marks the clues already used elsewhere with a divider, and leaves them pickable', () => {
    const items = [
      { id: 'E07', name: '现场照片', kind: 'evidence' as const },
      { id: 'E08', name: '旧照片', kind: 'evidence' as const, folded: true },
      { id: 'T01', name: '荣誉底下', kind: 'testimony' as const, folded: true },
    ]
    const w = mount(DeductionScreen, { props: { ...base, items } })
    const divider = w.find('[data-testid="deduce-divider"]')
    expect(divider.exists()).toBe(true)
    expect(divider.text()).toContain('已用于别的结论')
    const rows = w.find('[data-testid="scroll"]').findAll('li')
    expect(rows).toHaveLength(4)                                   // three clues and the divider
    expect(rows[1].attributes('data-testid')).toBe('deduce-divider')
    expect(rows[1].text()).toContain('已用于别的结论')
    expect(rows[2].find('[data-testid="item-E08"]').exists()).toBe(true)
    const folded = w.find('[data-testid="item-E08"]')
    expect(folded.classes()).toContain('folded')
    expect(folded.attributes('disabled')).toBeUndefined()
  })

  it('shows no divider when nothing has been folded yet', () => {
    const w = mount(DeductionScreen, { props: base })
    expect(w.find('[data-testid="deduce-divider"]').exists()).toBe(false)
    expect(w.find('[data-testid="scroll"]').findAll('li')).toHaveLength(2)
  })
})
