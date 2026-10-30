import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { canDeduce, MAX_MISSES, startDeduction, submitDeduction, type DeductionDef } from '../src/engine/deduction'
import { computePersuasion } from '../src/engine/crossexam'
import { SceneRunner } from '../src/engine/script'
import { useGameStore } from '../src/engine/store'
import { loadData } from '../src/engine/data'
import DeductionScreen from '../src/ui/DeductionScreen.vue'
import { playOut } from './helpers'

const def: DeductionDef = {
  id: 't',
  prompt: '把线索连起来',
  pick: 2,
  answer: ['E07', 'T01'],
  hints: ['再看看桌角', '她说过最重要的东西放在哪'],
  trap: { items: ['T12', 'E09'], flag: 'bossTheory', line: '……好像说得通。' },
}

describe('a deduction session', () => {
  it('accepts the right items in either order', () => {
    const s = createInitialState()
    expect(submitDeduction(s, startDeduction(def), ['E07', 'T01']).kind).toBe('solved')
    expect(submitDeduction(s, startDeduction(def), ['T01', 'E07']).kind).toBe('solved')
    expect(s.flags['deduce:t:solved']).toBe(true)
  })

  it('wants exactly the right number of items before it judges', () => {
    const s = createInitialState()
    expect(submitDeduction(s, startDeduction(def), ['E07']).kind).toBe('incomplete')
    expect(submitDeduction(s, startDeduction(def), ['E07', 'T01', 'E01']).kind).toBe('incomplete')
    expect(s.flags['deduce:t:solved']).toBeUndefined()
  })

  it('a wrong guess gives one hint at a time and counts down', () => {
    const s = createInitialState()
    const session = startDeduction(def)
    const a = submitDeduction(s, session, ['E01', 'E02'])
    expect(a).toEqual({ kind: 'wrong', hint: '再看看桌角', left: MAX_MISSES - 1 })
    const b = submitDeduction(s, session, ['E01', 'E03'])
    expect(b).toEqual({ kind: 'wrong', hint: '她说过最重要的东西放在哪', left: MAX_MISSES - 2 })
  })

  it('three misses and the conclusion is handed over, at a price', () => {
    const s = createInitialState()
    const session = startDeduction(def)
    submitDeduction(s, session, ['E01', 'E02'])
    submitDeduction(s, session, ['E01', 'E03'])
    expect(submitDeduction(s, session, ['E01', 'E04']).kind).toBe('forced')
    expect(s.flags['deduce:t:solved']).toBe(true)
    expect(s.flags['deduce:t:forced']).toBe(true)
  })

  it('every forced conclusion costs one point of persuasion in the finale', () => {
    const s = createInitialState()
    expect(computePersuasion(s)).toBe(8)
    s.flags['deduce:night1:forced'] = true
    expect(computePersuasion(s)).toBe(7)
    s.flags['deduce:night2:forced'] = true
    expect(computePersuasion(s)).toBe(6)
  })

  it('the tempting wrong theory is never marked wrong: it ends the evening and sets its flag', () => {
    const s = createInitialState()
    const out = submitDeduction(s, startDeduction(def), ['E09', 'T12'])
    expect(out).toEqual({ kind: 'trap', line: '……好像说得通。' })
    expect(s.flags.bossTheory).toBe(true)
    expect(s.flags['deduce:t:solved']).toBeUndefined()
  })

  it('you can only attempt it if you hold every piece', () => {
    const s = createInitialState()
    expect(canDeduce(s, def)).toBe(false)
    s.evidence.push('E07')
    expect(canDeduce(s, def)).toBe(false)
    s.testimony.push('T01')
    expect(canDeduce(s, def)).toBe(true)
  })
})

describe("the 'deduce' node", () => {
  it('stops the scene like a choice, and moves on when advanced', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'deduce', id: 't' }, { type: 'say', speaker: 'lyc', text: 'x' }] })
    r.start('a')
    expect(r.current()).toMatchObject({ type: 'deduce', id: 't' })
    r.advance()
    expect(r.current()).toMatchObject({ text: 'x' })
  })
})

describe('the real deductions', () => {
  const data = loadData()
  it('night 1 and night 2 exist, and every item they name exists', () => {
    for (const id of ['night1', 'night2']) {
      const d = data.deductions[id]
      expect(d, id).toBeDefined()
      expect(d.answer.length, id).toBe(d.pick)
      for (const item of [...d.answer, ...(d.trap?.items ?? [])]) {
        expect(data.evidence.some(e => e.id === item) || data.testimony.some(t => t.id === item), `${id} ${item}`).toBe(true)
      }
    }
  })

  it('night 1: the mark on the desk and the trophy line point to the trophy', () => {
    expect(new Set(data.deductions.night1.answer)).toEqual(new Set(['E07', 'T01']))
  })

  it('night 2 has the boss theory as its trap', () => {
    expect(data.deductions.night2.trap?.flag).toBe('bossTheory')
    expect(data.deductions.night2.trap?.items).toEqual(expect.arrayContaining(['T12', 'E09']))
  })
})

describe('store: the evening reasoning', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function atNight1() {
    const store = useGameStore()
    store.state.evidence.push('E07')
    store.state.testimony.push('T01')
    store.screen = 'scene'
    store.playScene('day1_night')
    // run until the deduction node
    let guard = 0
    while (store.currentNode && store.currentNode.type !== 'deduce') {
      if (guard++ > 100) throw new Error('never reached the deduction')
      store.advance()
    }
    return store
  }

  it('night 1 opens the deduction screen when you hold both pieces', () => {
    const store = atNight1()
    expect(store.deduction?.def.id).toBe('night1')
  })

  it('the right answer moves the story on and unlocks the conclusion', () => {
    const store = atNight1()
    expect(store.submitDeduction(['E07', 'T01']).kind).toBe('solved')
    expect(store.deduction).toBeNull()
    playOut(store)
    expect(store.state.flags['deduce:night1:solved']).toBe(true)
    expect(store.state.intel.trophy).toBe('clean')
  })

  it('a wrong guess keeps you on the screen with a hint', () => {
    const store = atNight1()
    const r = store.submitDeduction(['E07', 'E07'])
    expect(r.kind === 'incomplete' || r.kind === 'wrong').toBe(true)
    const w = store.submitDeduction(['E07', 'E01'])
    expect(w.kind).toBe('wrong')
    expect(store.deduction?.def.id).toBe('night1')
  })

  it('without the pieces the evening reasoning is skipped, with no penalty', () => {
    const store = useGameStore()
    store.screen = 'scene'
    store.playScene('day1_night')
    playOut(store)
    expect(store.deduction).toBeNull()
    expect(store.state.flags['deduce:night1:solved']).toBeUndefined()
    expect(store.state.flags['deduce:night1:forced']).toBeUndefined()
  })
})

describe('DeductionScreen', () => {
  const items = [
    { id: 'E07', name: '现场照片', kind: 'evidence' as const },
    { id: 'T01', name: '荣誉底下', kind: 'testimony' as const },
    { id: 'E01', name: '数据线 LYC-03', kind: 'evidence' as const },
  ]
  const base = { prompt: '把线索连起来', pick: 2, items, left: 3, hint: '', line: '' }

  it('lists what you hold and fills the slots as you pick', async () => {
    const w = mount(DeductionScreen, { props: base })
    expect(w.text()).toContain('把线索连起来')
    await w.find('[data-testid="item-E07"]').trigger('click')
    await w.find('[data-testid="item-T01"]').trigger('click')
    expect(w.findAll('[data-testid^="slot-"]').filter(s => s.classes().includes('filled'))).toHaveLength(2)
  })

  it('will not let you pick more than the slots allow, and clicking again removes', async () => {
    const w = mount(DeductionScreen, { props: base })
    for (const id of ['E07', 'T01', 'E01']) await w.find(`[data-testid="item-${id}"]`).trigger('click')
    expect(w.findAll('[data-testid^="slot-"]').filter(s => s.classes().includes('filled'))).toHaveLength(2)
    await w.find('[data-testid="item-E07"]').trigger('click')
    expect(w.findAll('[data-testid^="slot-"]').filter(s => s.classes().includes('filled'))).toHaveLength(1)
  })

  it('the button waits for a full set, then submits the ids', async () => {
    const w = mount(DeductionScreen, { props: base })
    expect(w.find('[data-testid="deduce"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="item-E07"]').trigger('click')
    await w.find('[data-testid="item-T01"]').trigger('click')
    expect(w.find('[data-testid="deduce"]').attributes('disabled')).toBeUndefined()
    await w.find('[data-testid="deduce"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([['E07', 'T01']])
  })

  it('shows the hint and the tries left', () => {
    const w = mount(DeductionScreen, { props: { ...base, hint: '再看看桌角', left: 2 } })
    expect(w.text()).toContain('再看看桌角')
    expect(w.find('[data-testid="tries"]').text()).toContain('2')
  })

  it('the long list scrolls in its own box', () => {
    const w = mount(DeductionScreen, { props: base })
    expect(w.find('[data-testid="scroll"]').exists()).toBe(true)
  })
})
