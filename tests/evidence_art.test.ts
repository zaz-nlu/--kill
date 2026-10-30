import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { resolveEvidenceImage } from '../src/engine/evidenceArt'
import EvidencePicker from '../src/ui/EvidencePicker.vue'

describe('evidence art', () => {
  it('has an image for every evidence id E01–E44 except E40', () => {
    for (let n = 1; n <= 44; n++) {
      const id = 'E' + String(n).padStart(2, '0')
      if (id === 'E40') expect(resolveEvidenceImage(id), id).toBeNull()
      else expect(resolveEvidenceImage(id), id).not.toBeNull()
    }
  })

  it('has no image for testimony or quotes', () => {
    expect(resolveEvidenceImage('T06')).toBeNull()
    expect(resolveEvidenceImage('Q-light')).toBeNull()
  })
})

describe('evidence window thumbnails', () => {
  const info = {
    E01: { id: 'E01', name: '数据线 LYC-03', desc: '', type: '物证' as const, who: [], image: resolveEvidenceImage('E01') },
    T06: { id: 'T06', name: '黎默的证词', desc: '', type: '证言' as const, who: [], image: null },
  }

  it('shows a thumbnail for evidence but not for testimony', () => {
    const w = mount(EvidencePicker, { props: { ids: ['E01', 'T06'], info, quotes: [] } })
    expect(w.find('[data-testid="record-E01"] img').exists()).toBe(true)
    expect(w.find('[data-testid="record-T06"] img').exists()).toBe(false)
    expect(w.find('[data-testid="record-E01"]').text()).toContain('数据线 LYC-03')
  })
})
