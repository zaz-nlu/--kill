import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { SceneRunner } from '../src/engine/script'
import { useGameStore } from '../src/engine/store'
import Stage from '../src/ui/Stage.vue'
import { logLines } from '../src/engine/log'
import { skipEvents } from './helpers'

describe('bg nodes', () => {
  it('call the background hook and do not stop the scene', () => {
    const seen: string[] = []
    const r = new SceneRunner(
      createInitialState(),
      { a: [{ type: 'bg', id: 'office' }, { type: 'say', speaker: 'lyc', text: 'hi' }, { type: 'bg', id: 'cafe' }, { type: 'say', speaker: 'lyc', text: 'bye' }] },
      { onBackground: id => seen.push(id) },
    )
    r.start('a')
    expect(seen).toEqual(['office'])
    expect(r.current()).toMatchObject({ text: 'hi' })
    r.advance()
    expect(seen).toEqual(['office', 'cafe'])
  })

  it('work without hooks', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'bg', id: 'office' }, { type: 'say', speaker: 'lyc', text: 'x' }] })
    r.start('a')
    expect(r.current()).toMatchObject({ text: 'x' })
  })
})

describe('store stage', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function advanceUntil(store: ReturnType<typeof useGameStore>, pred: () => boolean) {
    let guard = 0
    while (!pred()) {
      if (guard++ > 300) throw new Error('never reached')
      const n = store.currentNode
      if (!n) throw new Error('scene ended first')
      store.advance(n.type === 'choice' ? 0 : undefined)
    }
  }

  it('starts the prologue on the office background with nobody on stage', () => {
    const store = useGameStore()
    store.newGame()
    expect(store.stage.bg).toBe('office')
    expect(store.stage.left).toBeNull()
    expect(store.stage.right).toBeNull()
  })

  it('puts the speaker on stage: the protagonist on the left, everyone else on the right', () => {
    const store = useGameStore()
    store.newGame()
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'songyan')
    expect(store.stage.right?.id).toBe('songyan')
    expect(store.stage.side).toBe('right')
    expect(store.stage.bg).toBe('hr_office')
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'lyc')
    expect(store.stage.left?.id).toBe('lyc')
    expect(store.stage.side).toBe('left')
    expect(store.stage.right?.id).toBe('songyan')   // still there, just not speaking
  })

  it('narration keeps both characters but nobody is the speaker', () => {
    const store = useGameStore()
    store.newGame()
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'songyan')
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'narration')
    expect(store.stage.right?.id).toBe('songyan')
    expect(store.stage.side).toBeNull()
  })

  it('a new scene clears the stage', () => {
    const store = useGameStore()
    store.newGame()
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'songyan')
    store.playScene('act_2_3')
    expect(store.stage.right).toBeNull()
    expect(store.stage.left).toBeNull()
  })

  it('uses the expression written on the line', () => {
    const store = useGameStore()
    store.playScene('finale_act1_end')
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'limo' && store.currentNode.expr === 'guilty')
    expect(store.stage.right).toEqual({ id: 'limo', expr: 'guilty' })
  })

  it('characters without art still take a slot (the UI draws a placeholder)', () => {
    const store = useGameStore()
    store.playScene('act_2_9')
    advanceUntil(store, () => store.currentNode?.type === 'say' && store.currentNode.speaker === 'mengyao')
    expect(store.stage.right?.id).toBe('mengyao')
  })

  it('the exam puts Limo on stage and reacts to his replies', () => {
    const store = useGameStore()
    const kit = store.data.debugKit
    store.state.evidence.push(...kit.evidence)
    logLines(store.state, kit.backlog)
    store.startExamById('finale_act1')
    expect(store.stage.bg).toBe('meeting_a')
    expect(store.stage.right).toEqual({ id: 'limo', expr: 'normal' })
    store.examGoto(1)
    store.examPresent('E06')
    expect(store.stage.right?.id).toBe('limo')
    expect(store.stage.right?.expr).toBe('nervous')
  })

  it('background follows the screen: shop and hub', () => {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 12
    skipEvents(store, 2)
    store.screen = 'hub'
    store.goShop()
    expect(store.stage.bg).toBe('store')
    store.leaveShop()
    expect(store.stage.bg).toBe('office')
  })
})

describe('Stage component', () => {
  const names = { lyc: '林一程', mengyao: '孟遥', tang: '唐经理' }

  it('draws the sprite for characters with art and a named placeholder for the rest', () => {
    const w = mount(Stage, {
      props: { bg: 'office', left: { id: 'lyc', expr: 'normal' }, right: { id: 'tang', expr: 'normal' }, side: 'right', names },
    })
    expect(w.find('img[data-testid="sprite-left"]').exists()).toBe(true)
    expect(w.find('[data-testid="sprite-right-placeholder"]').text()).toContain('唐经理')
    expect(w.find('img[data-testid="sprite-right"]').exists()).toBe(false)
  })

  it('brightens the speaker and dims the other side', () => {
    const w = mount(Stage, {
      props: { bg: 'office', left: { id: 'lyc', expr: 'normal' }, right: { id: 'limo', expr: 'normal' }, side: 'right', names },
    })
    expect(w.find('[data-testid="slot-right"]').classes()).toContain('active')
    expect(w.find('[data-testid="slot-left"]').classes()).toContain('dim')
  })

  it('narration dims nobody', () => {
    const w = mount(Stage, {
      props: { bg: 'office', left: { id: 'lyc', expr: 'normal' }, right: null, side: null, names },
    })
    expect(w.find('[data-testid="slot-left"]').classes()).not.toContain('dim')
  })

  it('sets the background and renders the slot content', () => {
    const w = mount(Stage, { props: { bg: 'cafe', left: null, right: null, side: null, names }, slots: { default: '<p>里面的内容</p>' } })
    expect(w.find('[data-testid="bg"]').attributes('data-bg')).toBe('cafe')
    expect(w.text()).toContain('里面的内容')
  })

  it('shows nothing for empty slots', () => {
    const w = mount(Stage, { props: { bg: 'office', left: null, right: null, side: null, names } })
    expect(w.find('[data-testid="slot-left"]').exists()).toBe(false)
    expect(w.find('[data-testid="slot-right"]').exists()).toBe(false)
  })
})

describe('memory scenes are grey', () => {
  it('the memory node calls the hook with on/off and does not stop the scene', () => {
    const seen: boolean[] = []
    const r = new SceneRunner(
      createInitialState(),
      { a: [{ type: 'memory', on: true }, { type: 'say', speaker: 'lyc', text: 'x' }, { type: 'memory', on: false }, { type: 'say', speaker: 'lyc', text: 'y' }] },
      { onMemory: on => seen.push(on) },
    )
    r.start('a')
    expect(seen).toEqual([true])
    r.advance()
    expect(seen).toEqual([true, false])
  })

  it('works without hooks', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'memory', on: true }, { type: 'say', speaker: 'lyc', text: 'x' }] })
    r.start('a')
    expect(r.current()).toMatchObject({ text: 'x' })
  })

  it('the store turns it on and off with the story, and always starts a new scene in colour', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.data.scenes.__flash = [
      { type: 'say', speaker: 'narration', text: '现在' },
      { type: 'memory', on: true },
      { type: 'say', speaker: 'narration', text: '那时' },
      { type: 'memory', on: false },
      { type: 'say', speaker: 'narration', text: '又回到现在' },
    ]
    store.screen = 'scene'
    store.playScene('__flash')
    expect(store.stage.memory).toBe(false)
    store.advance()
    expect(store.stage.memory).toBe(true)
    store.advance()
    expect(store.stage.memory).toBe(false)
    store.advance()
    // a scene that ends while still in a memory does not leave the next one grey
    store.data.scenes.__stuck = [{ type: 'memory', on: true }, { type: 'say', speaker: 'narration', text: 'x' }]
    store.playScene('__stuck')
    expect(store.stage.memory).toBe(true)
    store.playScene('__flash')
    expect(store.stage.memory).toBe(false)
  })

  it('going back to the hub clears it too', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.stage.memory = true
    store.state.day = 2
    store.state.hour = 15
    skipEvents(store, 2)
    store.screen = 'hub'
    store.leaveShop()
    expect(store.stage.memory).toBe(false)
  })

  it('the stage greys the picture and the people and says why', () => {
    const grey = mount(Stage, { props: { bg: 'office', left: { id: 'lyc', expr: 'normal' }, right: null, side: 'left', names: { lyc: '林一程' }, memory: true } })
    expect(grey.find('[data-testid="stage-root"]').classes()).toContain('memory')
    expect(grey.find('[data-testid="memory-tag"]').text()).toContain('回忆')
    const live = mount(Stage, { props: { bg: 'office', left: null, right: null, side: null, names: {} } })
    expect(live.find('[data-testid="stage-root"]').classes()).not.toContain('memory')
    expect(live.find('[data-testid="memory-tag"]').exists()).toBe(false)
  })
})

describe('a scene with a node the engine does not know', () => {
  it('fails loudly instead of hanging', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'warp', id: 'x' } as never, { type: 'say', speaker: 'lyc', text: 'x' }] })
    expect(() => r.start('a')).toThrow(/warp/)
  })
})
