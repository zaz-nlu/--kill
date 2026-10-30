import npcs from '../data/npcs.json'
import items from '../data/items.json'
import evidence from '../data/evidence.json'
import testimony from '../data/testimony.json'
import recordMeta from '../data/evidence_meta.json'
import actions from '../data/actions.json'
import debugKit from '../data/debug_kit.json'
import rooms from '../data/rooms.json'
import events from '../data/events.json'
import deductions from '../data/deductions.json'
import conclusions from '../data/conclusions.json'
import frames from '../data/frames.json'
import type { FrameDef } from './frames'
import type { DeductionDef } from './deduction'
import type { EventDef } from './events'
import type { RoomDef } from './rooms'
import type { ChapterDef, ExamDef, Item, Line, Npc } from './types'
import type { Scenes } from './script'
import type { ActionDef } from './calendar'

export interface RecordDef { id: string; name: string; desc: string }

// How an item of evidence or testimony is filed in the cross-examination's evidence window.
export const RECORD_TYPES = ['物证', '记录', '影像', '文书', '证言'] as const
export type RecordType = (typeof RECORD_TYPES)[number]
export interface RecordMeta { type: RecordType; who: string[]; where?: string; when?: string }
// What the evidence window shows for one item the player holds. A conclusion card is filed with its own type.
export interface RecordInfo {
  id: string
  name: string
  desc: string
  type: RecordType | '结论'
  who: string[]
  where?: string
  when?: string
  image: string | null
}

// A conclusion card: folded clues from one deduction, presentable in place of any of them.
export interface ConclusionDef { id: string; via: string; name: string; desc: string; fold: string[] }

export interface GameData {
  npcs: Npc[]
  items: Item[]
  evidence: RecordDef[]
  testimony: RecordDef[]
  recordMeta: Record<string, RecordMeta>
  scenes: Scenes
  actions: ActionDef[]
  rooms: RoomDef[]
  events: EventDef[]
  deductions: Record<string, DeductionDef>
  conclusions: ConclusionDef[]
  frames: Record<string, FrameDef>
  exams: Record<string, ExamDef>
  chapters: Record<string, ChapterDef>
  debugKit: { evidence: string[]; testimony: string[]; backlog: Line[] }
}

// Scene files each hold a bag of scenes. Two files may not disagree about a scene: a clash means one case is quietly
// eating another's, so it is an error rather than a silent overwrite. A byte-identical copy carries no such risk (case 1
// has two of them), so it is simply kept once.
export function mergeScenes(files: Record<string, Scenes>): Scenes {
  const scenes: Scenes = {}
  const from: Record<string, string> = {}
  for (const [file, chunk] of Object.entries(files)) {
    for (const [id, nodes] of Object.entries(chunk)) {
      if (id in scenes) {
        if (JSON.stringify(scenes[id]) !== JSON.stringify(nodes)) {
          throw new Error(`duplicate scene id "${id}" (${file} and ${from[id]})`)
        }
        continue
      }
      scenes[id] = nodes
      from[id] = file
    }
  }
  return scenes
}

// One exam per file, keyed by its own id, with the same rule against duplicates.
export function mergeExams(files: Record<string, ExamDef>): Record<string, ExamDef> {
  const exams: Record<string, ExamDef> = {}
  const from: Record<string, string> = {}
  for (const [file, ex] of Object.entries(files)) {
    if (exams[ex.id]) {
      if (JSON.stringify(exams[ex.id]) !== JSON.stringify(ex)) {
        throw new Error(`duplicate exam id "${ex.id}" (${file} and ${from[ex.id]})`)
      }
      continue
    }
    exams[ex.id] = ex
    from[ex.id] = file
  }
  return exams
}

export function loadData(): GameData {
  const sceneFiles = import.meta.glob('../data/scenes/*.json', { eager: true, import: 'default' }) as Record<string, Scenes>
  const examFiles = import.meta.glob('../data/exams/*.json', { eager: true, import: 'default' }) as Record<string, ExamDef>
  const chapterFiles = import.meta.glob('../data/chapters/*.json', { eager: true, import: 'default' }) as Record<string, ChapterDef>
  const scenes = mergeScenes(sceneFiles)
  const exams = mergeExams(examFiles)
  const chapters: Record<string, ChapterDef> = {}
  for (const [file, chapter] of Object.entries(chapterFiles)) {
    if (chapters[chapter.id]) throw new Error(`duplicate chapter id "${chapter.id}" (${file})`)
    chapters[chapter.id] = chapter
  }
  return {
    npcs: npcs as Npc[],
    items,
    evidence,
    testimony,
    recordMeta: recordMeta as Record<string, RecordMeta>,
    scenes,
    actions: actions as ActionDef[],
    rooms: rooms as RoomDef[],
    events: events as EventDef[],
    frames: Object.fromEntries((frames as FrameDef[]).map(f => [f.id, f])),
    deductions: Object.fromEntries((deductions as DeductionDef[]).map(d => [d.id, d])),
    conclusions: conclusions as ConclusionDef[],
    exams,
    chapters,
    debugKit: debugKit as GameData['debugKit'],
  }
}
