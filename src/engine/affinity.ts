export type AffinityTier = 'open' | 'guarded' | 'closed'

// Spec 6.2: ≥60 speaks plainly and gives the key detail, 30–59 stays vague, <30 refuses or bites back.
export function affinityTier(value: number): AffinityTier {
  if (value >= 60) return 'open'
  if (value >= 30) return 'guarded'
  return 'closed'
}

export const TIER_LABEL: Record<AffinityTier, string> = { open: '信任', guarded: '一般', closed: '疏远' }

// Laohan runs on trust, not affinity (spec 6.3): 40 opens the C2 footage, 50 the warrant, 60 the SD card.
export function trustLabel(trust: number): string {
  if (trust >= 60) return '信任'
  if (trust >= 50) return '可以合作'
  if (trust >= 40) return '愿意听'
  return '戒备'
}
