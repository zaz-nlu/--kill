import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { loadData } from '../src/engine/data'
import { resolveEvidenceImage } from '../src/engine/evidenceArt'
import { useGameStore } from '../src/engine/store'

const data = loadData()
const case2Evidence = data.evidence.filter(e => e.id.startsWith('2E'))

// Scene photos filed before their art exists. Drop an id here once its image lands in src/assets/evidence/.
const PENDING_ART = new Set(['2E34', '2E35', '2E36'])

describe('case 2 evidence', () => {
  it('has an image for every case 2 evidence id', () => {
    expect(case2Evidence.length).toBeGreaterThan(0)
    for (const e of case2Evidence) {
      if (PENDING_ART.has(e.id)) continue
      expect(resolveEvidenceImage(e.id), e.id).not.toBeNull()
    }
  })

  it('does not reuse a case 1 id', () => {
    const case1 = new Set(data.evidence.filter(e => /^E\d/.test(e.id)).map(e => e.id))
    for (const e of case2Evidence) expect(case1.has(e.id), e.id).toBe(false)
  })

  it('is filed under c2 in the record meta', () => {
    for (const e of case2Evidence) expect(data.recordMeta[e.id]?.case, e.id).toBe('c2')
  })
})

describe('the evidence panel follows the chapter', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not show case 2 evidence while the chapter is c1', () => {
    const store = useGameStore()
    store.state.chapter = 'c1'
    store.state.evidence.push('E01', '2E01')
    const ids = store.collected.evidence.map(e => e.id)
    expect(ids).toContain('E01')
    expect(ids).not.toContain('2E01')
  })
})

describe('record merging', () => {
  it('throws when two files use the same evidence id', () => {
    expect(() => loadData({
      evidenceFiles: {
        'a.json': [{ id: 'X01', name: '甲', desc: '' }],
        'b.json': [{ id: 'X01', name: '乙', desc: '' }],
      },
    })).toThrow(/duplicate record id "X01"/)
  })
})
