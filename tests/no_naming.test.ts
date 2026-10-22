import { describe, it, expect } from 'vitest'
import { loadData } from '../src/engine/data'

// Before the finale, nobody (neither the narration, nor Lin Yicheng's thoughts, nor a colleague) may say outright that
// Limo is the culprit. Facts are fine; the player has to connect them. These are the scenes that used to do it.
const data = loadData()

function lines(sceneId: string): string[] {
  const out: string[] = []
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') {
      const n = o as Record<string, unknown>
      if (n.type === 'say' && typeof n.text === 'string' && n.speaker !== 'limo') out.push(n.text)
      Object.values(n).forEach(walk)
    }
  }
  walk(data.scenes[sceneId])
  return out
}

describe('the script does not hand over the culprit', () => {
  it('the nightly conclusions name nobody', () => {
    for (const id of ['day3_night', 'day4_night']) {
      const text = lines(id).join('\n')
      expect(text, id).not.toContain('黎默')
      expect(text, id).not.toContain('会议室 B 里的')
      expect(text, id).not.toContain('一点一点推着')
    }
  })

  it('the deduction prompt of night 4 does not name him', () => {
    const night4 = data.deductions.night4
    expect(night4.prompt).not.toContain('黎默')
    for (const h of night4.hints) expect(h).not.toContain('黎默')
  })

  it("Meng Yao's confession and her outburst never say who the card went to", () => {
    for (const id of ['mengyao_confession', 'day4_noon']) {
      const text = lines(id).join('\n')
      expect(text, id).not.toContain('黎默')
      expect(text, id).not.toContain('未婚夫')
    }
    expect(data.testimony.find(t => t.id === 'T13')!.desc).not.toContain('黎默')
  })

  it('4-10, 4-12 and 4-6 present facts without the verdict', () => {
    const a = lines('act_4_10').join('\n')
    expect(a).not.toContain('只剩')
    const b = lines('act_4_12').join('\n')
    expect(b).not.toContain('是他')
    expect(b).not.toContain('未婚夫')
    expect(b).not.toContain('壁纸')
    expect(lines('act_4_6').join('\n')).not.toContain('铃铛。酒精。左手腕')
  })

  it('the day-4 announcement does not tell you he has been steering you', () => {
    expect(lines('day4_announce').join('\n')).not.toContain('同一个方向')
  })

  it('the evidence list does not put his name on the slips of the tongue', () => {
    for (const id of ['T22', 'T26', 'T27', 'T28', 'T29']) {
      expect(data.testimony.find(t => t.id === id)!.name, id).not.toContain('黎默')
    }
  })

  it("Shao Xiaoyang's day-2 testimony is only the early report; the cable comes later", () => {
    expect(data.testimony.find(t => t.id === 'T07a')!.desc).not.toContain('收')
    expect(data.testimony.find(t => t.id === 'T07')!.desc).toContain('收')
  })

  it('the witnesses hedge: none of them names him, in the log or on the evidence card', () => {
    for (const id of ['T07a', 'T07', 'T08b', 'T09']) {
      expect(data.testimony.find(t => t.id === id)!.desc, id).not.toContain('黎默')
    }
    for (const id of ['act_2_4', 'act_3_7', 'act_4_8', 'act_4_9', 'act_2_9_after']) {
      expect(lines(id).join('\n'), id).not.toContain('黎默')
    }
  })
})
