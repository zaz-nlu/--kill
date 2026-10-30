// How each run ends: the name on the end screen and the last few lines (spec 11).
// The endings themselves are chapter data now (case 1's are in data/chapters/c1.json); this is what the end screen reads.
import type { EndingDef } from './types'
import c1 from '../data/chapters/c1.json'

export type { EndingDef }

export const ENDINGS: Record<string, EndingDef> = c1.endings

