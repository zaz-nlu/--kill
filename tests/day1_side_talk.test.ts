import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { availableActions } from '../src/engine/calendar'
import type { GameState } from '../src/engine/types'

const data = loadData()

// Walks a scene; `pick` chooses an option for every choice node (default: the first one).
function walk(state: GameState, sceneId: string, pick: (options: string[], n: number) => number = () => 0): string[] {
  const runner = new SceneRunner(state, data.scenes)
  const seen: string[] = []
  let guard = 0
  let nChoices = 0
  runner.start(sceneId)
  while (runner.current()) {
    if (guard++ > 800) throw new Error(`scene ${sceneId} did not terminate`)
    const node = runner.current()!
    if (node.type === 'choice') {
      const i = pick(node.options.map(o => o.text), nChoices++)
      seen.push(`> ${node.options[i].text}`)
      runner.advance(i)
    } else {
      if (node.type === 'say') seen.push(node.text)
      runner.advance()
    }
  }
  return seen
}

const MENUS: Record<string, number> = {
  tk_wang: 4, tk_tong: 3, tk_meng: 3, tk_su: 3, tk_lu: 3, tk_han: 3, tk_limo: 3, tk_law: 3, tk_xu: 3, tk_jb: 3,
}

describe('"anything else?" menus inside the day-1 conversations', () => {
  for (const [prefix, topics] of Object.entries(MENUS)) {
    it(`${prefix}: ${topics} topics, each can be asked once, then the talk ends by itself`, () => {
      const s = createInitialState()
      const menus: string[][] = []
      // always take the first topic (index 1; index 0 is "nothing else")
      const lines = walk(s, `${prefix}_menu`, options => {
        menus.push(options)
        return options.length > 1 ? 1 : 0
      })
      expect(menus.length).toBe(topics)
      menus.forEach((m, i) => expect(m.length, `menu ${i}`).toBe(topics - i + 1))
      for (let i = 0; i < topics; i++) expect(s.flags[`asked:${prefix}:${i}`], `topic ${i}`).toBe(true)
      expect(lines.length).toBeGreaterThan(topics * 3)
    })

    it(`${prefix}: walking away at once asks nothing`, () => {
      const s = createInitialState()
      const menus: string[][] = []
      walk(s, `${prefix}_menu`, options => { menus.push(options); return 0 })
      expect(menus.length).toBe(1)
      expect(Object.keys(s.flags).filter(k => k.startsWith(`asked:${prefix}:`))).toEqual([])
    })
  }

  it('the first option is always the way out, so a bare "continue" never starts a side talk', () => {
    for (const prefix of Object.keys(MENUS)) {
      const first = data.scenes[`${prefix}_m0`].find(n => n.type === 'choice')
      expect(first && first.type === 'choice' && first.options.length, prefix).toBe(MENUS[prefix] + 1)
    }
  })

  it('the old tails still run after the menu: monitor room, coffee shop, call with Lu Cheng', () => {
    const wang = walk(createInitialState(), 'act_1_2', () => 0)
    expect(wang.join('')).toContain('电梯门缓缓合上')
    const limo = walk(createInitialState(), 'day1_coffee', () => 0)
    expect(limo.join('')).toContain('别一个人走夜路')
    const lu = walk(createInitialState(), 'act_1_9', () => 0)
    expect(lu.join('')).toContain('自己小心点')
  })

  it("the physical hint about Su Wen's leg and the stairwell door are now found in conversation, with no evidence attached", () => {
    const s = createInitialState()
    const before = [...s.evidence]
    const text = walk(s, 'tk_su_t0').join('') + walk(s, 'tk_wang_t2').join('')
    expect(text).toContain('不爬楼梯')
    expect(text).toContain('一回都没响过')
    expect(s.evidence).toEqual(before)
  })
})

describe('new day-1 things to do', () => {
  const NEW = ['1-14', '1-15', '1-16', '1-17', '1-18', '1-19', '1-20', '1-21', '1-22', '1-23']

  it('ten new actions, every one a real scene on day 1 only', () => {
    for (const id of NEW) {
      const a = data.actions.find(x => x.id === id)
      expect(a, id).toBeDefined()
      expect(a!.days).toEqual([1])
      expect(data.scenes[a!.scene!], id).toBeDefined()
    }
  })

  it('every one of them plays through to the end whichever way you lean', () => {
    for (const id of NEW) {
      const scene = data.actions.find(x => x.id === id)!.scene!
      for (const lean of [0, 1]) {
        expect(() => walk(createInitialState(), scene, options => Math.min(lean, options.length - 1)), `${id} lean ${lean}`).not.toThrow()
      }
    }
  })

  it('the pool is much bigger than the seven hours of day 1, and most hours still offer plenty', () => {
    const s = createInitialState()
    s.day = 1
    for (const h of [13, 14, 15, 16, 17, 19, 20]) {
      s.hour = h
      expect(availableActions(s, data.actions).length, `hour ${h}`).toBeGreaterThanOrEqual(12)
    }
  })

  it('daytime-only things close with the day: police steps and reporters at 17, the stall at 16', () => {
    const s = createInitialState()
    s.hour = 19
    const ids = availableActions(s, data.actions).map(a => a.id)
    expect(ids).not.toContain('1-18')
    expect(ids).not.toContain('1-19')
    expect(ids).not.toContain('1-22')
    expect(ids).toContain('1-14')
  })

  it('the convenience store scene stays a key action, so the bigger pool cannot hide the red-shirt clue', () => {
    expect(data.actions.find(a => a.id === '1-3')?.kind).toBe('key')
  })

  it('shouting to the reporters costs trust and the boss, walking past only costs the hour', () => {
    const loud = createInitialState()
    const trust = loud.trust
    const boss = loud.affinity.boss
    walk(loud, 'act_1_22', () => 0)
    expect(loud.trust).toBe(trust - 10)
    expect(loud.affinity.boss).toBe(boss - 10)
    const quiet = createInitialState()
    walk(quiet, 'act_1_22', () => 1)
    expect(quiet.trust).toBe(trust)
    expect(quiet.affinity.boss).toBe(boss)
  })

  it('texting Shao Xiaoyang: telling him the case leaks it to the outsourcing group, chatting about his flat does not', () => {
    const tell = createInitialState()
    tell.intel.phone = 'clean'
    tell.intel.draft = 'clean'
    walk(tell, 'act_1_23', () => 0)
    expect(tell.intel).toMatchObject({ phone: 'leaked', draft: 'leaked' })
    expect(tell.affinity.shaoxy).toBe(50)
    const chat = createInitialState()
    chat.intel.phone = 'clean'
    chat.intel.draft = 'clean'
    walk(chat, 'act_1_23', () => 1)
    expect(chat.intel).toMatchObject({ phone: 'clean', draft: 'clean' })
    expect(chat.affinity.shaoxy).toBe(50)
  })

  it("scrolling through colleagues' moments shows Song Yan's own 亲爱的, and hands out no evidence", () => {
    const s = createInitialState()
    const text = walk(s, 'act_1_15').join('')
    expect(text).toContain('亲爱的们')
    expect(s.evidence).toEqual([])
    expect(s.testimony).toEqual([])
  })

  it('the lawyer can be asked everything in one hour, and the call leaves a note', () => {
    const s = createInitialState()
    walk(s, 'act_1_17', options => (options.length > 1 ? 1 : 0))
    expect(s.flags.consulted_lawyer).toBe(true)
  })
})
