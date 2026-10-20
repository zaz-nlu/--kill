import type { Condition, Effect, GameState, LeakTrigger, Line } from './types'
import { applyEffect } from './effects'
import { addLog } from './log'
import { isSlipAvailable, triggerLeak } from './flow'
import type { TimeOfDay } from './backgrounds'

export interface SceneHooks { onBackground?: (id: string, time?: TimeOfDay) => void }

export type SceneNode =
  | ({ type: 'say' } & Line)
  | { type: 'choice'; options: { text: string; effects?: Effect[]; leak?: LeakTrigger; goto?: string }[] }
  | { type: 'branch'; when: Condition; then: SceneNode[]; else: SceneNode[] }
  | { type: 'effect'; effects?: Effect[]; leak?: LeakTrigger }
  | { type: 'goto'; scene: string }
  | { type: 'bg'; id: string; time?: TimeOfDay }
  | { type: 'end' }

export type Scenes = Record<string, SceneNode[]>

export function evalCondition(state: GameState, c: Condition): boolean {
  switch (c.kind) {
    case 'intelClean':
      return isSlipAvailable(state, c.intel)
    case 'affinityAtLeast':
      return state.affinity[c.npc] >= c.value
    case 'hasEvidence':
      return state.evidence.includes(c.id)
    case 'hasTestimony':
      return state.testimony.includes(c.id)
    case 'flag':
      return state.flags[c.key] === true
    case 'trustAtLeast':
      return state.trust >= c.value
    case 'not':
      return !evalCondition(state, c.cond)
  }
}

interface Frame { nodes: SceneNode[]; idx: number }

export class SceneRunner {
  private stack: Frame[] = []
  private cur: SceneNode | null = null

  constructor(private state: GameState, private scenes: Scenes, private hooks: SceneHooks = {}) {}

  start(sceneId: string): void {
    const nodes = this.scenes[sceneId]
    if (!nodes) throw new Error(`Unknown scene: ${sceneId}`)
    this.stack = [{ nodes, idx: 0 }]
    this.cur = null
    this.settle()
  }

  current(): SceneNode | null {
    return this.cur
  }

  advance(choice?: number): void {
    const node = this.cur
    if (!node) return
    if (node.type === 'choice') {
      if (choice === undefined || !Number.isInteger(choice) || choice < 0 || choice >= node.options.length) return
      const opt = node.options[choice]
      for (const e of opt.effects ?? []) applyEffect(this.state, e)
      if (opt.leak) triggerLeak(this.state, opt.leak)
      if (opt.goto) {
        this.start(opt.goto)
        return
      }
    }
    this.settle()
  }

  // Runs forward until a node needs the UI (say / choice) or the scene ends.
  // `cur` (if any) has already been consumed by the caller, so step past it first.
  private settle(): void {
    if (this.cur) {
      const top = this.stack[this.stack.length - 1]
      if (top) top.idx += 1
      this.cur = null
    }
    for (;;) {
      const frame = this.stack[this.stack.length - 1]
      if (!frame) return
      if (frame.idx >= frame.nodes.length) {
        this.stack.pop()
        const parent = this.stack[this.stack.length - 1]
        if (parent) parent.idx += 1
        continue
      }
      const node = frame.nodes[frame.idx]
      switch (node.type) {
        case 'say': {
          addLog(this.state, { speaker: node.speaker, text: node.text, tag: node.tag })
          this.cur = node
          return
        }
        case 'choice':
          this.cur = node
          return
        case 'effect':
          for (const e of node.effects ?? []) applyEffect(this.state, e)
          if (node.leak) triggerLeak(this.state, node.leak)
          frame.idx += 1
          break
        case 'branch': {
          const picked = evalCondition(this.state, node.when) ? node.then : node.else
          this.stack.push({ nodes: picked, idx: 0 })
          break
        }
        case 'goto': {
          const nodes = this.scenes[node.scene]
          if (!nodes) throw new Error(`Unknown scene: ${node.scene}`)
          this.stack = [{ nodes, idx: 0 }]
          break
        }
        case 'bg':
          this.hooks.onBackground?.(node.id, node.time)
          frame.idx += 1
          break
        case 'end':
          this.stack = []
          return
      }
    }
  }
}
