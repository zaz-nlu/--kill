import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createInitialState } from '../src/engine/state'
import { judgeFrames, type FrameDef } from '../src/engine/frames'
import { SceneRunner } from '../src/engine/script'
import { useGameStore } from '../src/engine/store'
import { loadData } from '../src/engine/data'
import FrameCheckScreen from '../src/ui/FrameCheckScreen.vue'
import { playOut } from './helpers'

const def: FrameDef = {
  id: 't',
  prompt: '找出破绽',
  rows: [
    { id: 'r1', time: '20:32', text: '正常', flaw: false },
    { id: 'r2', time: '20:45:12', text: '黑了一帧', flaw: true },
    { id: 'r3', time: '21:00:12', text: '跳了一下', flaw: true },
    { id: 'r4', time: '21:02', text: '陆诚离开画面', flaw: false },
  ],
}

describe('judging a frame-by-frame check', () => {
  it('asks you to mark something first', () => {
    expect(judgeFrames(def, []).kind).toBe('incomplete')
  })

  it('is solved when every flaw is marked and nothing else', () => {
    expect(judgeFrames(def, ['r2', 'r3']).kind).toBe('solved')
    expect(judgeFrames(def, ['r3', 'r2']).kind).toBe('solved')
  })

  it('tells you how many flaws you missed', () => {
    expect(judgeFrames(def, ['r2'])).toMatchObject({ kind: 'partial', missing: 1, wrong: 0 })
  })

  it('tells you how many of your marks were red herrings, without saying which', () => {
    const out = judgeFrames(def, ['r2', 'r3', 'r4'])
    expect(out).toMatchObject({ kind: 'partial', missing: 0, wrong: 1 })
    expect(JSON.stringify(out)).not.toContain('陆诚')
  })

  it('counts both kinds of mistake at once', () => {
    expect(judgeFrames(def, ['r1', 'r4'])).toMatchObject({ kind: 'partial', missing: 2, wrong: 2 })
  })
})

describe("the 'frames' node", () => {
  it('stops the scene like a choice and moves on when advanced', () => {
    const r = new SceneRunner(createInitialState(), { a: [{ type: 'frames', id: 't' }, { type: 'say', speaker: 'lyc', text: 'x' }] })
    r.start('a')
    expect(r.current()).toMatchObject({ type: 'frames', id: 't' })
    r.advance()
    expect(r.current()).toMatchObject({ text: 'x' })
  })
})

describe('the real frame check', () => {
  const data = loadData()
  it('is the stand-up recording: eleven rows, eight real flaws, three red herrings', () => {
    const d = data.frames.e19
    expect(d.rows).toHaveLength(11)
    expect(d.rows.filter(r => r.flaw)).toHaveLength(8)
    expect(new Set(d.rows.map(r => r.id)).size).toBe(11)
  })

  it('has the decisive contradiction in it: the lights are on behind him while the real room is dark', () => {
    const d = data.frames.e19
    expect(d.rows.some(r => r.flaw && r.text.includes('顶灯一直亮着'))).toBe(true)
  })

  it('has the two famous red herrings: Lu Cheng leaving the frame and the voice replies after 21:09', () => {
    const d = data.frames.e19
    expect(d.rows.find(r => r.text.includes('陆诚离开'))?.flaw).toBe(false)
    expect(d.rows.find(r => r.text.includes('秒回'))?.flaw).toBe(false)
  })
})

describe('store: playing the frame check', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function reach() {
    const store = useGameStore()
    store.data.scenes.__f = [{ type: 'frames', id: 'e19' }, { type: 'say', speaker: 'narration', text: '看完了' }]
    store.screen = 'scene'
    store.playScene('__f')
    return store
  }
  const flaws = () => loadData().frames.e19.rows.filter(r => r.flaw).map(r => r.id)

  it('shows the rows on its own screen', () => {
    const store = reach()
    expect(store.frameCheck?.def.id).toBe('e19')
    expect(store.frameCheck?.def.rows).toHaveLength(11)
  })

  it('a wrong try keeps you there with a count; the right marks move the story on and set a flag', () => {
    const store = reach()
    const all = loadData().frames.e19.rows.map(r => r.id)
    const partial = store.submitFrames(all)
    expect(partial.kind).toBe('partial')
    expect(store.frameCheck).not.toBeNull()
    expect(store.submitFrames(flaws()).kind).toBe('solved')
    expect(store.frameCheck).toBeNull()
    expect(store.state.flags['frames:e19:solved']).toBe(true)
    playOut(store)
  })

  it('you can give up and carry on without the flag', () => {
    const store = reach()
    store.skipFrames()
    expect(store.frameCheck).toBeNull()
    expect(store.state.flags['frames:e19:solved']).toBeUndefined()
    expect(store.currentNode).toMatchObject({ text: '看完了' })
  })
})

describe('FrameCheckScreen', () => {
  const props = { prompt: '找出破绽', rows: def.rows, feedback: '' }

  it('lists every row with its time', () => {
    const w = mount(FrameCheckScreen, { props })
    expect(w.find('[data-testid="row-r2"]').text()).toContain('20:45:12')
    expect(w.find('[data-testid="row-r2"]').text()).toContain('黑了一帧')
    expect(w.findAll('[data-testid^="row-"]')).toHaveLength(4)
  })

  it('marks and unmarks rows, and submits the marked ids', async () => {
    const w = mount(FrameCheckScreen, { props })
    await w.find('[data-testid="row-r2"]').trigger('click')
    await w.find('[data-testid="row-r3"]').trigger('click')
    await w.find('[data-testid="row-r4"]').trigger('click')
    await w.find('[data-testid="row-r4"]').trigger('click')       // unmark
    expect(w.find('[data-testid="row-r2"]').classes()).toContain('on')
    expect(w.find('[data-testid="row-r4"]').classes()).not.toContain('on')
    await w.find('[data-testid="frames-submit"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([['r2', 'r3']])
  })

  it('will not submit nothing', () => {
    const w = mount(FrameCheckScreen, { props })
    expect(w.find('[data-testid="frames-submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows the feedback, and can be given up on', async () => {
    const w = mount(FrameCheckScreen, { props: { ...props, feedback: '还有 2 处破绽没找到' } })
    expect(w.text()).toContain('还有 2 处破绽没找到')
    await w.find('[data-testid="frames-skip"]').trigger('click')
    expect(w.emitted('skip')).toHaveLength(1)
  })

  it('the rows scroll in their own box', () => {
    expect(mount(FrameCheckScreen, { props }).find('[data-testid="scroll"]').exists()).toBe(true)
  })
})
