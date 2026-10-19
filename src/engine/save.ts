import type { GameState, IntelId, NpcId } from './types'

const SAVE_VERSION = 1
const NPC_IDS: NpcId[] = [
  'boss', 'mengyao', 'suwen', 'zhengcen', 'shaoxy', 'lucheng', 'limo', 'laohan', 'xiaoxu', 'laowang', 'tang',
]
const INTEL_IDS: IntelId[] = ['phone', 'draft', 'trophy', 'card', 'attack']
const INTEL_STATUSES = ['unknown', 'clean', 'leaked']

export type LoadResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'empty' | 'corrupt' | 'version' }

export function serializeState(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, state })
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isRecordOf = (v: unknown, pred: (x: unknown) => boolean): boolean =>
  isObject(v) && Object.values(v).every(pred)

function isLogLine(v: unknown): boolean {
  return (
    isObject(v) && isStr(v.id) && isStr(v.speaker) && isStr(v.text) && isNum(v.day) && isNum(v.hour) &&
    (v.tag === undefined || isStr(v.tag))
  )
}

function isValidState(s: unknown): s is GameState {
  if (!isObject(s)) return false
  if (s.version !== SAVE_VERSION) return false
  for (const k of ['day', 'hour', 'money', 'hp', 'danger', 'trust', 'shopItemsLeft']) {
    if (!isNum(s[k])) return false
  }
  if (!isObject(s.affinity) || !NPC_IDS.every(id => isNum((s.affinity as Record<string, unknown>)[id]))) return false
  if (!isObject(s.intel) || !INTEL_IDS.every(id => INTEL_STATUSES.includes((s.intel as Record<string, unknown>)[id] as string))) return false
  if (!isStrArray(s.evidence) || !isStrArray(s.testimony) || !isStrArray(s.notes) || !isStrArray(s.giftedToday)) return false
  if (!isRecordOf(s.flags, v => typeof v === 'boolean')) return false
  if (!Array.isArray(s.backlog) || !s.backlog.every(isLogLine)) return false
  if (!isRecordOf(s.inventory, isNum)) return false
  if (!isRecordOf(s.giftsGiven, isStrArray)) return false
  return true
}

export function loadSave(raw: string | null): LoadResult {
  if (raw === null) return { ok: false, reason: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (!isObject(parsed) || !('version' in parsed)) return { ok: false, reason: 'corrupt' }
  if (parsed.version !== SAVE_VERSION) return { ok: false, reason: 'version' }
  if (!isValidState(parsed.state)) return { ok: false, reason: 'corrupt' }
  return { ok: true, state: parsed.state }
}
