import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../src/engine/store'
import EndScreen from '../src/ui/EndScreen.vue'
import { playOut } from './helpers'

describe('endings reached through a story flag', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function start(store: ReturnType<typeof useGameStore>, id: string) {
    store.screen = 'scene'
    store.playScene(id)
  }

  it('a scene that sets an ending flag finishes on the end screen with that ending', () => {
    const store = useGameStore()
    store.data.scenes.__ending = [
      { type: 'say', speaker: 'narration', text: '你签了字。' },
      { type: 'effect', effects: [{ kind: 'flag', key: 'ending:bad3', value: true }] },
    ]
    start(store, '__ending')
    playOut(store)
    expect(store.gameOver).toBe('bad3')
    expect(store.screen).toBe('end')
  })

  it('does not return to the hub afterwards', () => {
    const store = useGameStore()
    store.data.scenes.__ending = [{ type: 'effect', effects: [{ kind: 'flag', key: 'ending:bad3', value: true }] }, { type: 'say', speaker: 'narration', text: 'x' }]
    store.screen = 'scene'
    store.playScene('__ending', () => { store.screen = 'hub' })
    playOut(store)
    expect(store.screen).toBe('end')
  })

  it('a new game forgets it', () => {
    const store = useGameStore()
    store.gameOver = 'bad3'
    store.newGame()
    expect(store.gameOver).toBeNull()
  })
})

describe('EndScreen wording', () => {
  it('names each ending', () => {
    expect(mount(EndScreen, { props: { failed: false, reason: 'hp' } }).text()).toContain('BAD END 1')
    const w = mount(EndScreen, { props: { failed: false, reason: 'bad3' } })
    expect(w.text()).toContain('BAD END 3')
    expect(w.text()).toContain('沉默的离职')
  })
})
