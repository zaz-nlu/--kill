import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import { ENDINGS } from '../src/engine/endings'
import type { GameState } from '../src/engine/types'

const data = loadData()

function play(state: GameState, sceneId: string, choices: number[] = []): void {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 800) throw new Error('scene did not terminate')
    const node = runner.current()!
    if (node.type === 'choice') {
      if (queue.length === 0) throw new Error(`no scripted choice for ${sceneId}`)
      runner.advance(queue.shift())
    } else {
      runner.advance()
    }
  }
}

describe('case 1 rework: 邵晓阳 is the 外包对接人, unmarried, no arbitration plot', () => {
  const banned = ['仲裁', '装修', '老婆', '刚结婚', '带过我', '家里那位', '我组里']

  it('none of his lines carries the old setting', () => {
    const bad: string[] = []
    for (const [id, nodes] of Object.entries(data.scenes)) {
      const walk = (ns: any[]) => {
        for (const n of ns) {
          if (n.type === 'say' && n.speaker === 'shaoxy' && banned.some(w => n.text.includes(w))) bad.push(`${id}: ${n.text}`)
          if (n.type === 'branch') { walk(n.then ?? []); walk(n.else ?? []) }
          if (n.type === 'choice') for (const o of n.options) { if (banned.some(w => (o.text ?? '').includes(w))) bad.push(`${id}: option ${o.text}`) }
        }
      }
      walk(nodes as any[])
    }
    expect(bad).toEqual([])
  })

  it('evidence and testimony about him do not carry it either', () => {
    const items = [...data.evidence, ...data.testimony].filter((x: any) => /邵晓阳/.test(x.desc))
    for (const it of items as any[]) for (const w of banned) expect(it.desc, it.id).not.toContain(w)
  })
})

describe('case 1 rework: new scenes, clues and hooks', () => {
  const newEvidence = ['E45', 'E46', 'E47', 'E48', 'E49']
  const newTestimony = ['T34', 'T35', 'T36', 'T37', 'T38', 'T39', 'T40']

  it('every new clue is defined and handed out by some scene', () => {
    const given = new Set<string>()
    const walk = (ns: any[]) => {
      for (const n of ns) {
        if (n.type === 'effect') for (const e of n.effects) if (e.kind === 'evidence' || e.kind === 'testimony') given.add(e.id)
        if (n.type === 'branch') { walk(n.then ?? []); walk(n.else ?? []) }
        if (n.type === 'choice') for (const o of n.options) for (const e of o.effects ?? []) if (e.kind === 'evidence' || e.kind === 'testimony') given.add(e.id)
      }
    }
    for (const nodes of Object.values(data.scenes)) walk(nodes as any[])
    for (const id of newEvidence) {
      expect(data.evidence.some((e: any) => e.id === id), id).toBe(true)
      expect(given.has(id), `${id} is never granted`).toBe(true)
    }
    for (const id of newTestimony) {
      expect(data.testimony.some((t: any) => t.id === id), id).toBe(true)
      expect(given.has(id), `${id} is never granted`).toBe(true)
    }
  })

  it('S1: the old go set is a hotspot in the outsource room and gives E45 + T34', () => {
    const room = data.rooms.find((r: any) => r.id === 'outsource')!
    const hs = room.hotspots.find((h: any) => h.id === 'os_chess')!
    expect(hs.scene).toBe('inspect_os_chess')
    const s = createInitialState()
    play(s, hs.scene)
    expect(s.evidence).toContain('E45')
    expect(s.testimony).toContain('T34')
  })

  it('S2: the video is optional; the comment screenshot only comes if you look', () => {
    const look = createInitialState()
    play(look, 'act_2_3', [0])
    expect(look.testimony).toContain('T35')
    expect(look.evidence).toContain('E46')
    expect(look.affinity.shaoxy).toBe(60)
    const skip = createInitialState()
    play(skip, 'act_2_3', [1])
    expect(skip.testimony).toContain('T35')
    expect(skip.evidence).not.toContain('E46')
    expect(skip.affinity.shaoxy).toBe(60)
  })

  it('S3: the pantry scene runs on into the slip of the tongue, whichever way you comfort her', () => {
    for (const pick of [0, 1, 2]) {
      const s = createInitialState()
      play(s, 'act_2_20', [pick])
      expect(s.testimony, `choice ${pick}`).toContain('T36')
      expect(s.evidence, `choice ${pick}`).toContain('E47')
    }
  })

  it('S4-A: action 2-26 needs 1-2 and 2-24 done, takes two hours in the afternoon', () => {
    const a = data.actions.find((x: any) => x.id === '2-26')!
    expect(a.scene).toBe('act_2_26')
    expect(a.costHours).toBe(2)
    expect(a.minHour).toBe(14)
    const s = createInitialState()
    play(s, 'act_2_26')
    expect(s.evidence).toContain('E48')
    expect(s.testimony).toContain('T37')
  })

  it('the old man never mentions his old job in case 1', () => {
    const texts: string[] = []
    const walk = (ns: any[]) => { for (const n of ns) { if (n.type === 'say' && n.speaker === 'laowang') texts.push(n.text); if (n.type === 'branch') { walk(n.then ?? []); walk(n.else ?? []) } } }
    walk(data.scenes['act_2_26'] as any[])
    for (const t of texts) { expect(t).not.toContain('看守所'); expect(t).not.toContain('调班') }
  })

  it('S5: 邵 speaks in the first act of the finale, then Limo confesses', () => {
    const nodes = data.scenes['finale_act1_end'] as any[]
    const iShao = nodes.findIndex(n => n.type === 'say' && n.speaker === 'shaoxy' && n.text.startsWith('我叫邵晓阳'))
    const iT38 = nodes.findIndex(n => n.type === 'effect' && n.effects.some((e: any) => e.id === 'T38'))
    const iConfess = nodes.findIndex(n => n.type === 'say' && n.speaker === 'limo' && n.expr === 'guilty')
    expect(iShao).toBeGreaterThan(0)
    expect(iT38).toBeGreaterThan(iShao)
    expect(iConfess).toBeGreaterThan(iT38)
    // he does not jump up shocked any more: he already spoke, and he knew
    expect(nodes.some(n => n.type === 'say' && n.speaker === 'shaoxy' && n.text.startsWith('你说什么'))).toBe(false)
  })

  it('S6: three fixed events', () => {
    for (const [id, day, hour] of [['day3_s6a', 3, 12], ['day3_s6b', 3, 15], ['day4_s6c', 4, 10]] as const) {
      const ev = data.events.find((e: any) => e.id === id)!
      expect([ev.day, ev.hour]).toEqual([day, hour])
      expect(data.scenes[ev.scene]).toBeTruthy()
    }
    const b = createInitialState(); play(b, 'day3_s6b')
    expect(b.evidence).toContain('E49')
  })

  it('S7 and the ending texts follow the new settings', () => {
    for (const k of ['true', 'a', 'b', 'c']) expect(ENDINGS[k].text, k).toContain('数了一遍白子，少一颗')
    expect(ENDINGS.true.text).toContain('行政处罚')
    expect(ENDINGS.true.text).not.toContain('郑岑因回扣被立案')
  })
})

describe('two routes: nothing the finale needs is locked behind affinity alone', () => {
  it('E20 also comes from the manager who was sent the photos, with no affinity at all', () => {
    const s = createInitialState()
    s.evidence.push('E19')
    s.affinity.shaoxy = 0
    play(s, 'act_4_2')
    expect(s.evidence).toContain('E20')
  })
})

describe('foreshadowing for the case 1 truth: the debt, and the lights-out notice nobody forwarded', () => {
  it('the ledger: his fixed monthly payment marked only “还” is seen in the reimbursement scene, and E49 carries it', () => {
    const s = createInitialState()
    play(s, 'day3_s6b')
    expect(s.evidence).toContain('E49')
    expect(s.backlog.map(l => l.text).join('\n')).toContain('备注只有一个字')
    const e49 = data.evidence.find((e: any) => e.id === 'E49')!
    expect(e49.desc).toContain('“还”')
    // it must not name whom he owes: that is what the confession is for
    expect(e49.desc).not.toContain('周屿')
  })

  it('the lights-out mail copies one person, the liaison; he says he did not pass it on, with no affinity needed', () => {
    const e09 = data.evidence.find((e: any) => e.id === 'E09')!
    expect(e09.desc).toContain('抄送')
    const s = createInitialState()
    s.evidence.push('E09')
    s.affinity.shaoxy = 0
    play(s, 'act_2_4')
    expect(s.testimony).toContain('T41')
    const t41 = data.testimony.find((t: any) => t.id === 'T41')!
    expect(t41.desc).toContain('没往外包群里转')
    expect(t41.desc).not.toContain('黎默')
  })

  it('without the mail the question never comes up, and asking twice does not hand out the clue twice', () => {
    const cold = createInitialState()
    cold.affinity.shaoxy = 0
    play(cold, 'act_2_4')
    expect(cold.testimony).not.toContain('T41')
    const s = createInitialState()
    s.evidence.push('E09'); s.testimony.push('T41')
    play(s, 'act_2_4')
    expect(s.testimony.filter(x => x === 'T41')).toHaveLength(1)
  })
})
