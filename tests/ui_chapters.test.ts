import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChapterSelect from '../src/ui/ChapterSelect.vue'
import SavePanel from '../src/ui/SavePanel.vue'
import TimelinePanel from '../src/ui/TimelinePanel.vue'
import RecapScreen from '../src/ui/RecapScreen.vue'
import EndScreen from '../src/ui/EndScreen.vue'
import { useGameStore } from '../src/engine/store'
import App from '../src/App.vue'
import { isUnlocked, loadProfile, markCleared } from '../src/engine/profile'
import { loadData } from '../src/engine/data'
import { createInitialState } from '../src/engine/state'
import { slotInfo, writeSlot, type SlotMeta } from '../src/engine/saves'
import type { TimelineRow } from '../src/engine/timeline'
import type { SceneNode } from '../src/engine/script'
import { playOut, skipEvents } from './helpers'

const data = loadData()

const row = (r: Partial<TimelineRow> & Pick<TimelineRow, 'id' | 'day' | 'hour' | 'kind' | 'label'>): TimelineRow => ({
  depth: 0, onPath: true, isHead: false, forks: false, parent: null, ...r,
})

const c1Meta: SlotMeta = { chapter: 'c1', day: 2, hour: 14, evidence: 3, testimony: 1, at: 1760000000000 }

describe('chapter select', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('shows case 1 as playable and case 2 as coming soon, which cannot be entered', () => {
    const w = mount(ChapterSelect)
    expect(w.find('[data-testid="chapter-status-c1"]').text()).toBe('可玩')
    expect(w.find('[data-testid="chapter-status-c2"]').text()).toBe('敬请期待')
    expect(w.find('[data-testid="chapter-play-c1"]').exists()).toBe(true)
    expect(w.find('[data-testid="chapter-play-c2"]').exists()).toBe(false)
    // recap belongs to case 2 only: case 1 opens cold
    expect(w.find('[data-testid="chapter-recap-c2"]').exists()).toBe(true)
    expect(w.find('[data-testid="chapter-recap-c1"]').exists()).toBe(false)
  })

  it('an unfinished case 2 stays "coming soon" even after case 1 is cleared', () => {
    markCleared('c1', 'true')
    setActivePinia(createPinia())
    const w = mount(ChapterSelect)
    expect(w.find('[data-testid="chapter-status-c1"]').text()).toContain('已通关')
    expect(w.find('[data-testid="chapter-status-c2"]').text()).toBe('敬请期待')
    expect(w.find('[data-testid="chapter-play-c2"]').exists()).toBe(false)
  })
})

describe('the ending card', () => {
  beforeEach(() => localStorage.clear())

  it('a BAD ending is not recorded and leaves case 2 locked', () => {
    const w = mount(EndScreen, { props: { failed: false, reason: 'bad3', nextTitle: data.chapters.c2.title } })
    expect(w.find('[data-testid="next-chapter"]').exists()).toBe(false)
    expect(w.find('[data-testid="restart"]').text()).toBe('回到上一个检查点')
    expect(w.find('[data-testid="to-chapters"]').exists()).toBe(true)
    expect(loadProfile().cleared.c1).toBeUndefined()
    expect(isUnlocked(data.chapters.c2, data.chapters)).toBe(false)
  })

  it('a TRUE ending is recorded, says case 2 is open, and unlocks it', () => {
    const w = mount(EndScreen, { props: { failed: false, reason: 'true', nextTitle: data.chapters.c2.title } })
    expect(w.find('[data-testid="next-chapter"]').text()).toContain('下一章已解锁：案二·苏闻')
    expect(loadProfile().cleared.c1?.ending).toBe('true')
    expect(isUnlocked(data.chapters.c2, data.chapters)).toBe(true)
  })
})

describe('retrying from a bad ending', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  for (const reason of ['hp', 'bad2'] as const) {
    it(`the ending card returns to the last checkpoint after ${reason}, not the title`, async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const store = useGameStore()
      store.newGame()
      playOut(store)
      expect(store.screen).toBe('hub')
      const day = store.state.day
      const hour = store.state.hour

      store.gameOver = reason
      store.screen = 'end'

      const w = mount(App, { global: { plugins: [pinia] } })
      await w.find('[data-testid="restart"]').trigger('click')
      expect(store.screen).toBe('hub')
      expect(store.state.day).toBe(day)
      expect(store.state.hour).toBe(hour)
    })
  }
})

describe('save panel: chapters', () => {
  it('names the chapter being played, folds other chapters away, and asks before switching', async () => {
    const w = mount(SavePanel, {
      props: {
        mode: 'load',
        slots: [],
        auto: null,
        chapterName: '案二·苏闻',
        chapterId: 'c2',
        others: [{ chapter: 'c1', title: '案一·熄灯', slots: [{ slot: 'auto' as const, meta: c1Meta }] }],
      },
    })
    const line = w.find('[data-testid="save-chapter"]')
    expect(line.text()).toContain('当前章节：案二·苏闻')
    expect(line.text()).toContain('存档只在本章内有效')

    expect(w.find('[data-testid="other-list"]').exists()).toBe(false)
    await w.find('[data-testid="other-saves"]').trigger('click')
    await w.find('[data-testid="other-c1-auto"]').trigger('click')

    const confirm = w.find('[data-testid="other-confirm"]')
    expect(confirm.text()).toContain('这是【案一·熄灯】的存档')
    expect(confirm.text()).toContain('读取后将离开当前的【案二·苏闻】')
    expect(confirm.text()).toContain('当前进度会自动保存')
    await w.find('[data-testid="other-read"]').trigger('click')
    expect(w.emitted('pickOther')).toEqual([['c1', 'auto']])
  })

  it('asks with the chapter name and the progress before deleting a save', async () => {
    const w = mount(SavePanel, {
      props: { mode: 'load', slots: [{ slot: 1, meta: c1Meta }], auto: null, chapterName: '案一·熄灯', chapterId: 'c1' },
    })
    await w.find('[data-testid="remove-1"]').trigger('click')
    const text = w.find('[data-testid="slot-1"]').text()
    expect(text).toContain('删除（案一·熄灯）存档 1')
    expect(text).toContain('第 2 天 14:00')
  })
})

describe('timeline panel: chapter title and calendar', () => {
  const rows: TimelineRow[] = [
    row({ id: 1, kind: 'start', day: 1, hour: 8, label: '故事开始' }),
    row({ id: 2, kind: 'hub', day: 1, hour: 9, parent: 1, label: '行动菜单' }),
    row({ id: 3, kind: 'hub', day: 2, hour: 10, parent: 2, label: '行动菜单', isHead: true }),
  ]

  it('titles itself with the chapter and takes day names and dates from its calendar', () => {
    const w = mount(TimelinePanel, {
      props: { rows, chapterTitle: '案二·苏闻', calendar: data.chapters.c2.calendar },
    })
    expect(w.find('h3').text()).toBe('回溯 · 案二·苏闻')
    expect(w.find('[data-testid="timeline-scope"]').text()).toBe('这里只显示本章的选择，其他章节请在章节选择里回溯。')
    expect(w.find('[data-testid="chapter-0"]').text()).toContain('序章')
    expect(w.find('[data-testid="chapter-1"]').text()).toContain('第 1 天')
    expect(w.find('[data-testid="chapter-1"]').text()).toContain('11 月 19 日')
    expect(w.find('[data-testid="chapter-2"]').text()).toContain('11 月 20 日')
    expect(w.text()).not.toContain('9 月 15 日')
  })
})

describe('recap screen', () => {
  beforeEach(() => localStorage.clear())

  it('can be skipped, and skipping counts as having seen it', async () => {
    const w = mount(RecapScreen, { props: { chapter: 'c2', cards: data.chapters.c2.recap } })
    expect(w.find('[data-testid="recap-card"]').text()).toContain('九月十四日，雨夜')
    await w.find('[data-testid="recap-skip"]').trigger('click')
    expect(w.emitted('done')).toHaveLength(1)
    expect(loadProfile().seenRecap.c2).toBe(true)
  })
})

describe('store: chapter notes, auto-save and continuing', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('shows the per-chapter note the first time a later chapter is entered, never again', () => {
    const store = useGameStore()
    const prologue: SceneNode[] = [{ type: 'say', speaker: 'narration', text: '开场' }]
    store.data.scenes.c2_prologue = prologue

    store.startChapter('c2')
    expect(store.tip?.text).toContain('从本章起，存档与回溯按章节分开保存')
    store.dismissTip()
    expect(loadProfile().seenChapterNote).toBe(true)

    store.startChapter('c2')
    expect(store.tip).toBeNull()
  })

  it('tells the player once that their old saves now belong to case 1', () => {
    const legacyState: Record<string, unknown> = { ...createInitialState(data.chapters.c1), chapter: undefined, version: 1 }
    localStorage.setItem('jiudian-auto', JSON.stringify({ version: 1, state: legacyState }))
    setActivePinia(createPinia())
    const store = useGameStore()
    expect(store.migrationNotice).toBe('已把你之前的存档归入【案一·熄灯】。')
    store.dismissLegacyNotice()
    expect(store.migrationNotice).toBe('')
  })

  it('notes each automatic save in the current chapter, once for the same hour', () => {
    const store = useGameStore()
    store.state.day = 1
    store.state.hour = 13
    skipEvents(store, 1)

    store.waitAnHour()
    expect(store.saveNote).toContain('已自动保存（案一·熄灯·第 1 天）')

    // walking into the shop and back in the same hour does not stack another note
    store.goShop()
    store.leaveShop()
    expect(store.saveNote).toContain('已自动保存（案一·熄灯·第 1 天）')
  })

  it('continue on the title screen opens the most recent automatic save across chapters', () => {
    const c1 = createInitialState(data.chapters.c1)
    c1.day = 2
    c1.hour = 14
    const c2 = createInitialState(data.chapters.c2)
    writeSlot('auto', c1, undefined, 1000)
    writeSlot('auto', c2, undefined, 2000)

    const store = useGameStore()
    expect(store.continueLatest()).toBe(true)
    expect(store.state.chapter).toBe('c2')
    expect(store.screen).toBe('hub')
  })

  it('playing case 1 and pressing continue comes back to that chapter in the original flow', () => {
    const first = useGameStore()
    first.newGame()
    playOut(first)
    expect(first.screen).toBe('hub')
    expect(first.state.chapter).toBe('c1')
    const day = first.state.day
    const hour = first.state.hour

    setActivePinia(createPinia()) // the page is reloaded
    const again = useGameStore()
    expect(again.continueLatest()).toBe(true)
    expect(again.state.chapter).toBe('c1')
    expect(again.screen).toBe('hub')
    expect(again.state.day).toBe(day)
    expect(again.state.hour).toBe(hour)
  })

  it('reading another chapter save first writes an automatic save of the chapter being left', () => {
    const store = useGameStore()
    store.state.day = 2
    store.state.hour = 15
    const c2 = createInitialState(store.data.chapters.c2)
    writeSlot('auto', c2, undefined, 2000)

    store.loadOther('auto', 'c2')
    expect(store.state.chapter).toBe('c2')

    const left = slotInfo('auto', 'c1')
    expect(left?.day).toBe(2)
    expect(left?.hour).toBe(15)
  })
})
