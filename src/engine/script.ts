import type { Condition, Effect, GameState, LeakTrigger, Line } from './types'
import { applyEffect } from './effects'
import { addLog } from './log'
import { isSlipAvailable, triggerLeak } from './flow'
import type { TimeOfDay } from './backgrounds'
import type { MoodId } from '../audio/moods'
import { affinityTier } from './affinity'

export interface SceneHooks {
  onBackground?: (id: string, time?: TimeOfDay) => void
  onSfx?: (id: string) => void
  onShow?: (id: string) => void
  onMemory?: (on: boolean) => void
  onMusic?: (m: { mood?: MoodId; tension?: number }) => void
  onExam?: (id: string) => void
}

export type SceneNode =
  | ({ type: 'say' } & Line)
  | { type: 'choice'; important?: boolean; options: { text: string; effects?: Effect[]; leak?: LeakTrigger; goto?: string }[] }
  | { type: 'branch'; when: Condition; then: SceneNode[]; else: SceneNode[] }
  | { type: 'effect'; effects?: Effect[]; leak?: LeakTrigger }
  | { type: 'goto'; scene: string }
  | { type: 'bg'; id: string; time?: TimeOfDay }
  | { type: 'exam'; id: string }          // the scene ends here and the named cross-examination begins
  | { type: 'music'; mood?: MoodId; tension?: number }   // ask for a mood by name and/or set how tense the night sounds (0..1)
  | { type: 'memory'; on: boolean }       // into / out of a flashback: the picture goes grey
  | { type: 'frames'; id: string }        // the frame-by-frame check of a recording; waits for the player
  | { type: 'deduce'; id: string }        // the nightly reasoning; waits until the player has finished it
  | { type: 'show'; id: string }          // put an evidence card in the middle of the screen without handing it over
  | { type: 'sfx'; id: string }           // a sound cue; the story does not wait for it
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
    case 'gaveGift':
      return (state.giftsGiven[c.npc] ?? []).includes(c.item)
    case 'trustAtLeast':
      return state.trust >= c.value
    case 'dangerAtLeast':
      return state.danger >= c.value
    case 'affinityTier':
      return affinityTier(state.affinity[c.npc]) === c.tier
    case 'any':
      return c.conds.some(x => evalCondition(state, x))
    case 'not':
      return !evalCondition(state, c.cond)
  }
}

interface Frame { nodes: SceneNode[]; idx: number }

export class SceneRunner {
  private stack: Frame[] = []
  private cur: SceneNode | null = null
  // the scene the runner is in right now (it changes on a goto), for deciding what a choice is worth
  currentScene = ''

  constructor(private state: GameState, private scenes: Scenes, private hooks: SceneHooks = {}) {}

  start(sceneId: string): void {
    const nodes = this.scenes[sceneId]
    if (!nodes) throw new Error(`Unknown scene: ${sceneId}`)
    this.stack = [{ nodes, idx: 0 }]
    this.currentScene = sceneId
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
          this.currentScene = node.scene
          break
        }
        case 'bg':
          this.hooks.onBackground?.(node.id, node.time)
          frame.idx += 1
          break
        case 'deduce':
          this.cur = node
          return
        case 'frames':
          this.cur = node
          return
        case 'show':
          this.hooks.onShow?.(node.id)
          frame.idx += 1
          break
        case 'sfx':
          this.hooks.onSfx?.(node.id)
          frame.idx += 1
          break
        case 'memory':
          this.hooks.onMemory?.(node.on)
          frame.idx += 1
          break
        case 'music':
          this.hooks.onMusic?.({ mood: node.mood, tension: node.tension })
          frame.idx += 1
          break
        case 'exam':
          this.hooks.onExam?.(node.id)
          this.stack = []
          return
        case 'end':
          this.stack = []
          return
        default: {
          // an unknown node would otherwise spin here forever
          throw new Error(`Unknown scene node type: ${(node as { type: string }).type}`)
        }
      }
    }
  }
}
