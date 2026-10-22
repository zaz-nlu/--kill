import type { GameState, LogLine } from './types'

// The rewind tree. Every point the game records (each hour's menu, each consequential choice) is a node that knows its
// parent. Going back to a node and choosing differently grows a new branch; the old branch stays where it is.
//
// A node keeps the whole state except the backlog, which only ever grows along a path: so a node stores just the lines
// added since its parent, and the full log is rebuilt by walking up the tree. Many nodes stay small.

export type NodeKind = 'start' | 'hub' | 'choice'

// What started the scene a choice sits in. Replaying the trigger from the node's state plays the same scene again.
export type Trigger = { kind: 'action'; id: string; gift?: string } | { kind: 'event'; id: string }

export interface TreeNode {
  id: number
  parent: number | null
  kind: NodeKind
  label: string
  day: number
  hour: number
  at: number
  state: Omit<GameState, 'backlog'>
  logDelta: LogLine[]
  logLen: number
  // choice nodes: the state above is the one *before* the trigger; replay it and answer `choices` to arrive at the choice
  resume?: { trigger: Trigger; choices: number[] }
}

export interface Timeline {
  version: 1
  uid: string
  nodes: TreeNode[]   // nodes[i].id === i + 1
  head: number | null
}

export interface RecordMeta {
  kind: NodeKind
  label: string
  resume?: TreeNode['resume']
  // a hub entered again in the same hour (after the shop) refreshes the node instead of adding a second one
  refreshSameHub?: boolean
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function newTimeline(uid: string = randomId()): Timeline {
  return { version: 1, uid, nodes: [], head: null }
}

export function getNode(tl: Timeline, id: number | null): TreeNode | undefined {
  return id === null ? undefined : tl.nodes[id - 1]
}

export function childrenOf(tl: Timeline, id: number | null): TreeNode[] {
  return tl.nodes.filter(n => n.parent === id)
}

// The whole log at a node: the deltas of everything from the root down to it.
export function fullBacklog(tl: Timeline, id: number): LogLine[] {
  const chain: TreeNode[] = []
  for (let n = getNode(tl, id); n; n = getNode(tl, n.parent)) chain.push(n)
  const out: LogLine[] = []
  for (const n of chain.reverse()) out.push(...n.logDelta)
  return out
}

export function restoreState(tl: Timeline, id: number): GameState {
  const node = getNode(tl, id)
  if (!node) throw new Error(`No such node: ${id}`)
  return { ...clone(node.state), backlog: clone(fullBacklog(tl, id)) } as GameState
}

// Adds a node under the current head (or refreshes the head, see RecordMeta) and makes it the new head.
export function record(tl: Timeline, state: GameState, meta: RecordMeta, now: number = Date.now()): TreeNode {
  const snap = clone(state)
  const { backlog, ...rest } = snap
  const head = getNode(tl, tl.head)
  if (meta.refreshSameHub && head && head.kind === 'hub' && head.day === state.day && head.hour === state.hour
      && childrenOf(tl, head.id).length === 0) {
    const parentLen = getNode(tl, head.parent)?.logLen ?? 0
    head.state = rest
    head.logDelta = backlog.slice(parentLen)
    head.logLen = backlog.length
    head.at = now
    return head
  }
  const parentLen = head ? head.logLen : 0
  const node: TreeNode = {
    id: tl.nodes.length + 1,
    parent: tl.head,
    kind: meta.kind,
    label: meta.label,
    day: state.day,
    hour: state.hour,
    at: now,
    state: rest,
    logDelta: backlog.slice(parentLen),
    logLen: backlog.length,
    resume: meta.resume,
  }
  tl.nodes.push(node)
  tl.head = node.id
  return node
}

export function pathTo(tl: Timeline, id: number | null): number[] {
  const out: number[] = []
  for (let n = getNode(tl, id); n; n = getNode(tl, n.parent)) out.push(n.id)
  return out.reverse()
}

export interface TimelineRow {
  id: number
  label: string
  kind: NodeKind
  day: number
  hour: number
  depth: number     // how many forks deep: the first child continues the line, later children branch off
  onPath: boolean   // on the line from the start to where you are now
  isHead: boolean
  forks: boolean    // this node has more than one child
}

export function flatten(tl: Timeline): TimelineRow[] {
  const onPath = new Set(pathTo(tl, tl.head))
  const kids = new Map<number | null, TreeNode[]>()
  for (const n of tl.nodes) {
    const list = kids.get(n.parent) ?? []
    list.push(n)
    kids.set(n.parent, list)
  }
  const rows: TimelineRow[] = []
  const stack: { node: TreeNode; depth: number }[] = []
  const push = (parent: number | null, depth: number) => {
    const list = kids.get(parent) ?? []
    // later siblings are pushed first so that the oldest branch is read first
    for (let i = list.length - 1; i >= 0; i--) stack.push({ node: list[i], depth: i === 0 ? depth : depth + 1 })
  }
  push(null, 0)
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    rows.push({
      id: node.id, label: node.label, kind: node.kind, day: node.day, hour: node.hour, depth,
      onPath: onPath.has(node.id), isHead: node.id === tl.head, forks: (kids.get(node.id) ?? []).length > 1,
    })
    push(node.id, depth)
  }
  return rows
}

// Which choices are worth a rewind point. Topic menus ("anything else?") and the stamina stairs are not; a choice that
// carries effects or a leak always is. A scene can force either with `important`.
export function isImportantChoice(
  node: { options: { text?: string; goto?: string; effects?: unknown[]; leak?: unknown }[]; important?: boolean },
  sceneId: string,
): boolean {
  if (node.important !== undefined) return node.important
  if (node.options.length < 2) return false
  if (node.options.some(o => (o.effects?.length ?? 0) > 0 || o.leak)) return true
  return !/^(tk_|stm_)/.test(sceneId)
}

export function serializeTimeline(tl: Timeline): string {
  return JSON.stringify(tl)
}

export function parseTimeline(raw: string | null): Timeline | null {
  if (raw === null) return null
  try {
    const t = JSON.parse(raw) as Timeline
    if (!t || t.version !== 1 || typeof t.uid !== 'string' || !Array.isArray(t.nodes)) return null
    if (!t.nodes.every((n, i) => n && n.id === i + 1 && typeof n.label === 'string' && Array.isArray(n.logDelta))) return null
    if (t.head !== null && !t.nodes[t.head - 1]) return null
    return t
  } catch {
    return null
  }
}
