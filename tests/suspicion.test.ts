import { describe, it, expect } from 'vitest'
import { createInitialState } from '../src/engine/state'
import { loadData } from '../src/engine/data'
import { SceneRunner } from '../src/engine/script'
import type { GameState } from '../src/engine/types'

const data = loadData()

function play(state: GameState, sceneId: string, choices: number[] = []): string {
  const runner = new SceneRunner(state, data.scenes)
  const queue = [...choices]
  runner.start(sceneId)
  let guard = 0
  while (runner.current()) {
    if (guard++ > 500) throw new Error('scene did not terminate')
    const node = runner.current()!
    runner.advance(node.type === 'choice' ? queue.shift() ?? 0 : undefined)
  }
  return state.backlog.map(l => l.text).join('\n')
}

// Every suspect should give the player at least one moment in a scene where something feels off,
// each with an innocent explanation and no hint that it matters (script 12, "嫌疑矩阵").
describe('everyone looks a little guilty at some point', () => {
  it('Zheng Cen: the clerk saw him writing in his little notebook after the call', () => {
    expect(play(createInitialState(), 'act_1_3')).toContain('小本本')
  })

  it('the boss: standing at the police seal at dawn', () => {
    expect(play(createInitialState(), 'act_1_2', [1, 1])).toContain('封条前站了老半天')
  })

  it('Meng Yao: asks whether the police mentioned the door log', () => {
    expect(play(createInitialState(), 'act_1_4', [0])).toContain('人事办公室门禁')
  })

  it('Meng Yao: bolts when Limo walks by', () => {
    const s = createInitialState()
    s.affinity.mengyao = 70
    expect(play(s, 'act_2_9')).toContain('我去趟洗手间')
  })

  it('Su Wen: claims to be at his desk, but you hear server fans', () => {
    const text = play(createInitialState(), 'act_1_8', [1])
    expect(text).toContain('一直在工位')
    expect(text).toContain('风扇声')
  })

  it('Shao Xiaoyang: scratches on his right hand and a tab about arbitration closed in a hurry', () => {
    const text = play(createInitialState(), 'act_2_3')
    expect(text).toContain('右手背')
    expect(text).toContain('仲裁')
  })

  it('Lu Cheng: stepped out at nine for a "private" call', () => {
    const text = play(createInitialState(), 'act_1_9')
    expect(text).toContain('九点那会儿接了个电话')
    expect(text).toContain('私事')
  })

  it('Lu Cheng: plays dumb about the magnet if you are not close enough and have seen it', () => {
    const s = createInitialState()
    s.evidence.push('E10')
    s.affinity.lucheng = 40
    expect(play(s, 'act_2_6')).toContain('什么磁铁')
  })

  it('Lu Cheng: owns up to the magnet if you are close, and does not play dumb', () => {
    const s = createInitialState()
    s.evidence.push('E10')
    s.affinity.lucheng = 70
    const text = play(s, 'act_2_6')
    expect(text).toContain('磁铁是我贴的')
    expect(text).not.toContain('什么磁铁')
  })

  it('none of it is flagged as a clue: no suspicion line carries a tag', () => {
    const lines = ['act_1_3', 'act_1_4_a', 'act_1_4_door', 'act_1_8', 'act_1_9', 'act_2_3', 'act_2_9']
      .flatMap(id => data.scenes[id])
      .filter(n => n.type === 'say' && /小本本|门禁|风扇|私事|右手背|仲裁|洗手间/.test(n.text))
    expect(lines.length).toBeGreaterThanOrEqual(6)
    for (const n of lines) expect(n.type === 'say' && n.tag, JSON.stringify(n)).toBeUndefined()
  })
})
