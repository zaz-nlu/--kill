import npcs from '../data/npcs.json'
import items from '../data/items.json'
import evidence from '../data/evidence.json'
import testimony from '../data/testimony.json'
import actions from '../data/actions.json'
import debugKit from '../data/debug_kit.json'
import rooms from '../data/rooms.json'
import type { RoomDef } from './rooms'
import type { ExamDef, Item, Line, Npc } from './types'
import type { Scenes } from './script'
import type { ActionDef } from './calendar'

export interface RecordDef { id: string; name: string; desc: string }

export interface GameData {
  npcs: Npc[]
  items: Item[]
  evidence: RecordDef[]
  testimony: RecordDef[]
  scenes: Scenes
  actions: ActionDef[]
  rooms: RoomDef[]
  exams: Record<string, ExamDef>
  debugKit: { evidence: string[]; testimony: string[]; backlog: Line[] }
}

export function loadData(): GameData {
  const sceneFiles = import.meta.glob('../data/scenes/*.json', { eager: true, import: 'default' }) as Record<string, Scenes>
  const examFiles = import.meta.glob('../data/exams/*.json', { eager: true, import: 'default' }) as Record<string, ExamDef>
  const scenes: Scenes = {}
  for (const chunk of Object.values(sceneFiles)) Object.assign(scenes, chunk)
  const exams: Record<string, ExamDef> = {}
  for (const ex of Object.values(examFiles)) exams[ex.id] = ex
  return {
    npcs: npcs as Npc[],
    items,
    evidence,
    testimony,
    scenes,
    actions: actions as ActionDef[],
    rooms: rooms as RoomDef[],
    exams,
    debugKit: debugKit as GameData['debugKit'],
  }
}
