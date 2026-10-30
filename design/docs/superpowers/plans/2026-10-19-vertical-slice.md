# 《九点熄灯》垂直切片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一个双击即可打开的 Windows 桌面软件，包含序章、第一天咖啡馆、第二天（说漏嘴 T26/T27、礼物与超商）和终章第一幕（黎默的"洗手间"与"21:08"堵路），用来验证核心玩法是否好玩。

**Architecture:** 游戏规则全部写成 `game/src/engine/` 下的纯 TypeScript 函数，直接修改传入的 `GameState`，不依赖 Vue，可以单独测试。Vue 3 + Pinia 只负责把状态和界面接起来。内容（证物、证言、场景、对质）是 `game/src/data/` 下的 JSON，Python 3 脚本在开发时校验这些 JSON 的引用关系。用 Electron 打包成免安装的单个 exe，不需要开任何服务。

**Tech Stack:** Vue 3、Pinia、TypeScript（strict）、Vite、Vitest + @vue/test-utils + jsdom、Electron + electron-builder（portable exe）、Python 3（`py -3`）做数据校验。依赖版本以安装时的最新稳定版为准，安装后在 `package.json` 里固定。

**Spec:** `d:\kill\剧本_九点熄灯.md`（v4）。本计划引用其中的章节：6.2b 礼物、6.5 对质规则、6.9 知情之差、第 7 节证物证言、第 8 节序章、第 9 节第一天 1-11 与第二天、第 10.0 / 10.1 终章规则与第一幕。

## Global Constraints

- 平台：Windows 11，目标产物是双击就能打开的 exe，不需要服务器、不需要联网。
- 这台电脑上 `python` 命令是 2.7，**必须用 `py -3`（或 `python3`）**，不能用 `python`。Node 22 和 npm 10 已安装，git 已安装。
- 项目放在 `d:\kill\game\`（新建，独立 git 仓库）。不要修改 `d:\kill\剧本_九点熄灯.md` 和备份文件。
- 语言：界面和对话全部是简体中文；代码标识符用英文。
- 人名一律用"黎默"（不是"犁墨"）；宋砚是女性，指她时用"她"；林一程指代用"他"或直接用名字。
- 对话文本必须逐字取自 spec，不要自己编台词；spec 里没有的过渡文字用旁白，并保持简短。
- 数值（来自 spec）：说服力起始 5、上限 7、选错 −1；起步现金 ¥150；商品价格和最爱见 6.2b；礼物效果：最爱 +15、一般 +5、雷区 −10（老韩用信任度：最爱 +5、雷区 −10、一般 0）；好感范围 0～100；危险值范围 0～100；HP 范围 0～3；每晚结算危险值 −15，回家休息再 −10 且 HP +1。
- spec 没给初始好感的 NPC（老王、小许）我定为 50，唐经理 0；这是本计划的决定，不是 spec 的。
- 出于"线索不加高亮"原则（6.9 ③）：日志界面**绝不显示**说漏嘴的内部标签（`tag`），不加颜色、不加图标。
- 美术先用占位：纯色块和文字，不做立绘。窗口默认 1280×720，最小 960×600。
- 每次 git 提交的信息末尾加一行：`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

按最可能出问题的顺序。每一条都在对应任务里有测试。

1. 存档文件损坏、被手改、或版本号不认识：应该回到标题画面并提示"存档无法读取"，不能白屏崩溃。（Task 14）
2. 对质时出示了一件玩家并没有的东西（界面竞态或手改）：应当被忽略，不扣说服力。（Task 8）
3. 说服力扣到 0：对质立刻失败，之后任何输入都被忽略，说服力不会变成负数。（Task 8）
4. 买东西/送礼的边界：钱不够、同一件东西送同一个人两次、给唐经理（不可送礼）送、同一个人一天收第二件：钱、库存、好感都不能变化。（Task 7）
5. 情报先被泄露、之后才"学到"（或对还没学到的情报触发泄露）：状态不能被洗回"干净"。（Task 3）

---

## 文件结构

```
game/
  package.json  tsconfig.json  vite.config.ts  index.html  .gitignore
  electron/main.cjs
  src/
    main.ts  App.vue
    engine/
      types.ts      共享类型：NpcId、GameState、Effect、Condition、LeakTrigger、Line、Item、Npc
      state.ts      INITIAL_AFFINITY、createInitialState
      effects.ts    applyEffect
      calendar.ts   advanceHour、endDay、ActionDef、availableActions
      flow.ts       情报流向：learnIntel、leakIntel、triggerLeak、isSlipAvailable
      log.ts        对话日志：addLog、logLines、toggleNote、visibleLog、presentableIds、noticedSlip
      script.ts     场景节点与 SceneRunner、evalCondition
      gifts.ts      openShop、buyItem、giveGift
      crossexam.ts  对质引擎：startExam、present、press、chooseOption、computePersuasion
      save.ts       serializeState、loadSave
      data.ts       loadData：把 data/*.json 装成 GameData
      store.ts      Pinia store：useGameStore
    data/
      npcs.json  items.json  evidence.json  testimony.json  actions.json  debug_kit.json
      scenes/*.json   exams/finale_act1.json
    ui/
      TitleScreen.vue  HudBar.vue  DialogueBox.vue  ChoiceList.vue  BacklogPanel.vue
      HubScreen.vue  ShopPanel.vue  GiftPicker.vue
      ExamScreen.vue  CourtRecord.vue  EndScreen.vue
  tests/            与 engine、ui 一一对应的 *.test.ts
tools/
  validate_data.py  test_validate_data.py
```

---

### Task 1: 项目骨架

**Files:**
- Create: `game/package.json`、`game/tsconfig.json`、`game/vite.config.ts`、`game/index.html`、`game/.gitignore`、`game/src/main.ts`、`game/src/App.vue`、`game/tests/smoke.test.ts`
- 在 `d:\kill\game` 执行 `git init`

**Interfaces:**
- Produces: npm 脚本 `dev`（`vite`）、`build`（`vue-tsc --noEmit && vite build`）、`test`（`vitest run`）；`vite.config.ts` 设置 `base: './'`（打包后用 `file://` 打开也能找到资源）、Vitest 环境 `jsdom`、`test.include: ['tests/**/*.test.ts']`；`tsconfig.json` 开启 `strict` 和 `resolveJsonModule`。
- Produces: `App.vue` 默认导出一个根组件，目前只渲染标题"九点熄灯"。

- [ ] **Step 1: 初始化并安装依赖**

在 `d:\kill\game` 下运行 `npm init -y`，然后 `npm i vue pinia`，`npm i -D vite @vitejs/plugin-vue typescript vue-tsc vitest jsdom @vue/test-utils`。写好上面的配置文件，`.gitignore` 包含 `node_modules`、`dist`、`release`。

- [ ] **Step 2: 写失败的冒烟测试**

```ts
// tests/smoke.test.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import App from '../src/App.vue'

describe('smoke', () => {
  it('renders the game title', () => {
    expect(mount(App).text()).toContain('九点熄灯')
  })
})
```

- [ ] **Step 3: 运行，确认失败**

Run: `cd d:\kill\game; npm test`
Expected: FAIL（App.vue 还不存在或没有标题）

- [ ] **Step 4: 写 `App.vue` 和 `main.ts`**

`main.ts` 创建 Vue 应用并挂载 Pinia 到 `#app`；`App.vue` 渲染一个包含"九点熄灯"的 `<h1>`。

- [ ] **Step 5: 运行测试和类型检查**

Run: `npm test; npm run build`
Expected: 测试 PASS，构建成功并生成 `dist/index.html`。

- [ ] **Step 6: 提交**

```bash
cd d:\kill\game
git init
git add -A
git commit -m "chore: scaffold Vue + TS + Vite + Vitest project"
```

---

### Task 2: 游戏状态、效果与日历

**Files:**
- Create: `game/src/engine/types.ts`、`state.ts`、`effects.ts`、`calendar.ts`
- Test: `game/tests/state.test.ts`

**Interfaces:**
- Produces（`types.ts`）：

```ts
export type NpcId = 'boss'|'mengyao'|'suwen'|'zhengcen'|'shaoxy'|'lucheng'|'limo'|'laohan'|'xiaoxu'|'laowang'|'tang'
export type Speaker = NpcId | 'lyc' | 'songyan' | 'narration'
export type IntelId = 'phone'|'draft'|'trophy'|'card'|'attack'
export type IntelStatus = 'unknown'|'clean'|'leaked'
export interface Line { speaker: Speaker; text: string; tag?: string }
export interface LogLine extends Line { id: string; day: number; hour: number }
export type LeakTrigger =
  | 'lunchTellAll' | 'groupPost' | 'coffeeTellAll' | 'tellAllToLimo'
  | { toNpc: NpcId; intel: IntelId[] }
export type Condition =
  | { kind: 'intelClean'; intel: IntelId }
  | { kind: 'affinityAtLeast'; npc: NpcId; value: number }
  | { kind: 'hasEvidence'; id: string }
  | { kind: 'hasTestimony'; id: string }
  | { kind: 'not'; cond: Condition }
export type Effect =
  | { kind: 'affinity'; npc: NpcId; delta: number }
  | { kind: 'trust' | 'money' | 'danger' | 'hp'; delta: number }
  | { kind: 'evidence' | 'testimony'; id: string }
  | { kind: 'learnIntel'; intel: IntelId }
  | { kind: 'flag'; key: string; value: boolean }
export interface Item { id: string; name: string; price: number }
export interface Npc { id: NpcId; name: string; giftable: boolean; favorite?: string; minefield?: string[] }
export interface GameState {
  version: 1
  day: number; hour: number
  money: number; hp: number; danger: number; trust: number
  affinity: Record<NpcId, number>
  evidence: string[]; testimony: string[]
  flags: Record<string, boolean>
  intel: Record<IntelId, IntelStatus>
  backlog: LogLine[]; notes: string[]          // notes 存的是 LogLine.id
  inventory: Record<string, number>            // 物品 id → 数量
  shopItemsLeft: number                        // 本次逛超商还能买几件
  giftsGiven: Record<string, string[]>         // NpcId → 已送过的物品 id
  giftedToday: NpcId[]
}
```

- Produces（`state.ts`）：`INITIAL_AFFINITY: Record<NpcId, number>`（boss 25、mengyao 50、suwen 60、zhengcen 40、shaoxy 45、lucheng 50、limo 70、laohan 0、xiaoxu 50、laowang 50、tang 0）；`createInitialState(): GameState`（day 1、hour 9、money 150、hp 3、danger 0、trust 20、intel 全为 `'unknown'`，其余为空）。
- Produces（`effects.ts`）：`applyEffect(state: GameState, e: Effect): void`；好感夹在 0～100，危险夹在 0～100，HP 夹在 0～3，金钱不会低于 0，证物/证言去重。
- Produces（`calendar.ts`）：`advanceHour(state: GameState, n?: number): void`（默认 1）；`endDay(state: GameState, opts: { rested: boolean }): void`（危险 −15；`rested` 为真时再危险 −10、HP +1；然后 day+1、hour=9、清空 `giftedToday`）；

```ts
export interface ActionDef {
  id: string; label: string; location: string
  days: number[]                     // 哪几天可选
  minHour?: number; maxHour?: number
  requiresEvidence?: string[]
  scene: string                      // 触发的场景 id
  costHours: number
}
export function availableActions(state: GameState, all: ActionDef[]): ActionDef[]
```

- [ ] **Step 1: 写失败的测试 `tests/state.test.ts`**

用 `createInitialState()` 断言：`money === 150`、`hp === 3`、`trust === 20`、`affinity.limo === 70`、`affinity.boss === 25`、`intel.phone === 'unknown'`。
`applyEffect`：好感 +50 加到 limo 上得 100（夹住）；money −999 得 0；evidence 加两次同一个 id 只出现一次；`{kind:'learnIntel'}` 在本任务只需要类型存在，行为见 Task 3。
`endDay`：danger 40 → 25（不休息）；danger 40 且 rested → 15，hp 2 → 3；`giftedToday` 被清空；day 加 1，hour 回到 9。
`availableActions`：`days` 不含当前天的不返回；`requiresEvidence` 没满足的不返回；`hour` 超出 `minHour/maxHour` 的不返回。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- state`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 按上面的签名实现四个文件**

`effects.ts` 里 `learnIntel` 的分支此时是空操作（什么都不做，不加注释），Task 3 再接上 `learnIntel` 函数。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- state`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: game state, effects, calendar"`

---

### Task 3: 情报流向（知情之差）

**Files:**
- Create: `game/src/engine/flow.ts`
- Modify: `game/src/engine/effects.ts`（`learnIntel` 分支调用 `learnIntel`）
- Test: `game/tests/flow.test.ts`

**Interfaces:**
- Consumes: `GameState`、`IntelId`、`LeakTrigger`、`NpcId`（Task 2）。
- Produces:

```ts
export const SLIP_FOR_INTEL: Record<IntelId, string>   // phone→'T26' draft→'T27' trophy→'T28' card→'T29' attack→'T22'
export function learnIntel(state: GameState, intel: IntelId): void       // unknown→clean；已是 leaked 则保持 leaked
export function leakIntel(state: GameState, intel: IntelId[]): IntelId[] // clean→leaked；unknown 保持 unknown；返回本次新泄露的
export function isSlipAvailable(state: GameState, intel: IntelId): boolean // intel === 'clean'
export function triggerLeak(state: GameState, t: LeakTrigger): IntelId[]
```

触发规则（spec 6.9 ①）：`lunchTellAll` → phone、draft、trophy；`groupPost` 和 `coffeeTellAll` → phone、draft；`tellAllToLimo` → 所有当前已知的（非 unknown）情报；`{toNpc}`：对 `shaoxy`、`lucheng` 说视为泄露给黎默（泄露其 `intel`）；对 `laohan`、`suwen`、`mengyao`、`zhengcen`、`boss` 说不泄露；**例外**：`intel` 含 `attack` 时，对除 `laohan` 以外的任何人说都泄露 `attack`。

- [ ] **Step 1: 写失败的测试 `tests/flow.test.ts`**

- `learnIntel` 把 unknown 变成 clean。
- `lunchTellAll` 之后，已 clean 的 phone/draft/trophy 变成 leaked，返回这三个；`isSlipAvailable(state,'phone')` 为假。
- `triggerLeak(state, {toNpc:'zhengcen', intel:['phone']})` 不泄露；`{toNpc:'shaoxy', intel:['phone']}` 泄露 phone；`{toNpc:'suwen', intel:['attack']}` 泄露 attack；`{toNpc:'laohan', intel:['attack']}` 不泄露。
- **Review Focus 5**：先 `leakIntel` 再 `learnIntel` 同一条情报，状态仍是 `leaked`；对 `unknown` 的情报触发 `tellAllToLimo`，状态仍是 `unknown`；同一触发连续两次，第二次返回空数组。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- flow`
Expected: FAIL

- [ ] **Step 3: 实现 `flow.ts`**，并把 `effects.ts` 的 `learnIntel` 分支接上。

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: PASS（含 Task 2 的测试）

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: intel flow tracking"`

---

### Task 4: 对话日志与「记下」

**Files:**
- Create: `game/src/engine/log.ts`
- Test: `game/tests/log.test.ts`

**Interfaces:**
- Consumes: `GameState`、`Line`、`LogLine`（Task 2）、`SLIP_FOR_INTEL`（Task 3）。
- Produces:

```ts
export function addLog(state: GameState, line: Line): LogLine        // id 形如 'L1'、'L2'，day/hour 取自 state
export function logLines(state: GameState, lines: Line[]): void      // 依次 addLog
export interface NoteResult { noted: boolean; reaction: string | null }
export function toggleNote(state: GameState, lineId: string): NoteResult
  // 切换笔记；若这条日志的 tag 属于说漏嘴（T22、T26～T29）且是被记下（不是取消）→ reaction 为 '……？'，否则为 null
export interface VisibleLogLine { id: string; speaker: Speaker; text: string; noted: boolean }
export function visibleLog(state: GameState): VisibleLogLine[]       // 不含 tag
export function presentableIds(state: GameState): string[]           // evidence ∪ testimony ∪ 日志里所有 tag（去重）
export function noticedSlip(state: GameState): boolean               // 笔记里是否有带说漏嘴 tag 的日志
```

- [ ] **Step 1: 写失败的测试 `tests/log.test.ts`**

- `addLog` 连续两次得到 id `L1`、`L2`。
- **不提示原则**：`visibleLog(state)` 返回的对象，`Object.keys` 里没有 `tag`，`JSON.stringify` 结果里不含 `'T26'`。
- `toggleNote` 记下一条带 `tag: 'T26'` 的日志 → `{noted:true, reaction:'……？'}`；记下一条无 tag 的日志 → `reaction === null`；再点一次取消 → `{noted:false, reaction:null}`。
- `presentableIds`：state 有 evidence `E06`、testimony `T02`，日志里有 tag `T26` 的一行 → 结果包含这三个；日志里没有该行时不包含 `T26`（"无害版本"没有 tag，因此不可出示）。
- `noticedSlip`：只在记下带说漏嘴 tag 的日志后为真。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- log`
Expected: FAIL

- [ ] **Step 3: 实现 `log.ts`**

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- log`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: dialogue log and note-taking"`

---

### Task 5: 场景运行器

**Files:**
- Create: `game/src/engine/script.ts`
- Test: `game/tests/script.test.ts`

**Interfaces:**
- Consumes: `GameState`、`Effect`、`Condition`、`LeakTrigger`、`Line`（Task 2）、`applyEffect`（Task 2）、`triggerLeak`、`isSlipAvailable`（Task 3）、`addLog`（Task 4）。
- Produces:

```ts
export type SceneNode =
  | ({ type: 'say' } & Line)
  | { type: 'choice'; options: { text: string; effects?: Effect[]; leak?: LeakTrigger; goto?: string }[] }
  | { type: 'branch'; when: Condition; then: SceneNode[]; else: SceneNode[] }
  | { type: 'effect'; effects?: Effect[]; leak?: LeakTrigger }
  | { type: 'goto'; scene: string }
  | { type: 'end' }
export type Scenes = Record<string, SceneNode[]>
export function evalCondition(state: GameState, c: Condition): boolean
export class SceneRunner {
  constructor(state: GameState, scenes: Scenes)
  start(sceneId: string): void
  current(): SceneNode | null          // 停在需要界面处理的 say 或 choice；场景结束返回 null
  advance(choice?: number): void       // say 节点：前进；choice 节点：必须传 choice 下标，没传或越界则忽略
}
```

行为：`say` 节点到达时（成为 current 时）立刻写入日志（带 `tag`）；`effect`、`branch`、`goto` 自动处理，不会停下；`choice` 选项的 `effects` 和 `leak` 在选中时执行，若有 `goto` 则跳转，否则继续往下。`branch` 按 `evalCondition` 选 `then` 或 `else`，把对应节点插入当前位置。

- [ ] **Step 1: 写失败的测试 `tests/script.test.ts`**

用一个内联的小场景集合测试：
- `start('a')` 后 `current()` 是第一个 say，日志里已有这行；`advance()` 后前进到下一个；全部走完 `current()` 为 `null`。
- say 带 `tag: 'T26'` 时，`state.backlog` 里那行的 `tag` 是 `'T26'`。
- `choice`：选 `1` 触发该选项的 `effects`（比如 `affinity limo +5`）和 `leak: 'lunchTellAll'`（先 `learnIntel` 三条使其为 clean，选后全部变 leaked）。
- **无害版本**：`branch` 的 `when` 为 `{kind:'intelClean',intel:'phone'}`，`then` 里有一行 tag `T26`，`else` 里一行无 tag：phone 为 clean 时日志有 tag 行；phone 为 leaked 时日志是无 tag 行。
- `goto` 能跳到另一个场景。
- `current()` 停在 choice 时，`advance()`（不带参数）和 `advance(99)` 都不改变 `current()`。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- script`
Expected: FAIL

- [ ] **Step 3: 实现 `script.ts`**

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- script`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: scene runner with branch and leak effects"`

---

### Task 6: 数据文件、加载器与 Python 校验脚本

**Files:**
- Create: `game/src/data/npcs.json`、`items.json`、`evidence.json`、`testimony.json`、`game/src/engine/data.ts`
- Create: `tools/validate_data.py`
- Test: `tools/test_validate_data.py`、`game/tests/data.test.ts`

**Interfaces:**
- Consumes: `Npc`、`Item`（Task 2）、`Scenes`（Task 5）、`ActionDef`（Task 2）。
- Produces（`data.ts`）：

```ts
export interface RecordDef { id: string; name: string; desc: string }
export interface GameData {
  npcs: Npc[]; items: Item[]
  evidence: RecordDef[]; testimony: RecordDef[]
  scenes: Scenes; actions: ActionDef[]
  exams: Record<string, unknown>            // 本任务为空对象；Task 10 把类型收紧为 Record<string, ExamDef>
  debugKit: { evidence: string[]; testimony: string[] }
}
export function loadData(): GameData        // 用 Vite 的 import.meta.glob('../data/scenes/*.json', {eager:true}) 合并全部场景
```

- Produces（`validate_data.py`）：命令 `py -3 tools/validate_data.py game/src/data`，全部通过退出码 0，有错误打印每条并退出码 1。检查项：
  1. `items.json` 的价格总和等于 190（spec 6.2b 的"全送一遍要 ¥190"）；
  2. 每个 NPC 的 `favorite` 和 `minefield` 引用的物品 id 都存在，且 `giftable: false` 的 NPC 没有 `favorite`；
  3. 场景和对质里出现的证物/证言 id（`effects` 的 `evidence`/`testimony`、`accepts`、`hasEvidence` 等）都在 `evidence.json`/`testimony.json` 里，或是日志 tag（`T22`、`T26`～`T29`、`G1`～`G9`、以及 `Q-` 开头的原话 tag）；
  4. 每个 `goto` 和 `onClear` 指向的场景存在；
  5. 对质里每个 step 的 `after` 引用的 id 在同一陈述内存在；
  6. `testimony.json` 里带 `"slice": true` 的说漏嘴条目（本切片是 T26、T27），其 id 必须作为 `tag` 出现在某个 `branch.then` 里至少一次；T22、T28、T29 的条目不带 `slice`，暂不检查。

- 数据内容：
  - `npcs.json`：按 spec 6.2b ⑤ 的表，11 个 NPC（含 `tang` 且 `giftable:false`）；老韩的 `favorite` 是茉莉花茶；`minefield` 按表填物品 id（陆诚：奶茶；邵晓阳：烟（红塔山）；苏闻：红牛；孟遥：红塔山；郑岑：红塔山；老板：奶茶；老韩：红塔山、软中华；黎默：奶茶、红牛、冰美式）。表里写"—"的没有雷区。
  - `items.json`：10 件商品，id 用英文（`jianbing`、`hongtashan`、`ruanzhonghua`、`iced_americano`、`cat_stick`、`fruit_box`、`redbull`、`jasmine_tea`、`milk_tea`、`fish_cookie`），名称与价格取自 6.2b ②。
  - `evidence.json` / `testimony.json`：本切片用到的条目，名称和描述取自第 7 节：E01、E02、E03、E04、E06、E07、E12、E13、E14、E15、E30；T01、T02、T03、T05、T06、T06a。T22、T26～T29 的条目也要有（名称取自第 7 节，描述写"黎默说过的话"）。

- [ ] **Step 1: 写失败的 Python 测试 `tools/test_validate_data.py`**

用 `tempfile.TemporaryDirectory` 构造最小数据目录，断言：价格总和不是 190 → 返回非 0；NPC 引用不存在的物品 → 非 0；场景里 `goto` 指向不存在的场景 → 非 0；正常数据 → 0。通过 `subprocess.run(['py','-3', ...])` 或直接 `import` 模块调用 `main(path) -> int` 均可，选 `main(path: str) -> int`。

- [ ] **Step 2: 运行，确认失败**

Run: `py -3 -m unittest discover -s tools -p "test_*.py"`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `validate_data.py`**，并写好四个 JSON 数据文件。

- [ ] **Step 4: 写 `game/tests/data.test.ts`**：`loadData()` 返回 11 个 NPC、10 件商品，所有商品价格之和为 190；每个有 `favorite` 的 NPC 的 favorite 在商品里。

- [ ] **Step 5: 实现 `data.ts`，运行全部测试和校验脚本**

Run: `npm test; py -3 tools/validate_data.py game/src/data`
Expected: 测试 PASS；校验脚本输出 OK，退出码 0。

- [ ] **Step 6: 提交** `git add -A && git commit -m "feat: data files, loader and python validator"`

---

### Task 7: 超商与礼物

**Files:**
- Create: `game/src/engine/gifts.ts`
- Test: `game/tests/gifts.test.ts`

**Interfaces:**
- Consumes: `GameState`、`Npc`、`Item`、`NpcId`（Task 2）、`applyEffect`（Task 2）。
- Produces:

```ts
export function openShop(state: GameState): void       // shopItemsLeft = 2
export type BuyResult = { ok: true } | { ok: false; reason: 'noMoney' | 'visitLimit' | 'unknownItem' }
export function buyItem(state: GameState, items: Item[], itemId: string): BuyResult
export type GiftResult =
  | { ok: true; tier: 'favorite' | 'ok' | 'minefield'; affinityDelta: number; trustDelta: number }
  | { ok: false; reason: 'noItem' | 'notGiftable' | 'alreadyGiven' | 'dailyLimit' | 'unknownNpc' }
export function giveGift(state: GameState, npcs: Npc[], npcId: NpcId, itemId: string): GiftResult
```

规则（spec 6.2b）：`buyItem` 扣钱、库存 +1、`shopItemsLeft` −1；`giveGift` 先检查（顺序：NPC 存在、可送礼、库存、该 NPC 今天没收过、这件东西没送过该 NPC），任何一项不满足都不改变状态；成功后库存 −1、记录 `giftsGiven`、`giftedToday` 加入。好感变化：最爱 +15、一般 +5、雷区 −10；`laohan` 改用信任度：最爱 +5、雷区 −10、一般 0，好感不变。

- [ ] **Step 1: 写失败的测试 `tests/gifts.test.ts`**

用 Task 6 的 `loadData()` 取真实 NPC 和商品。
- 起步现金 150，`openShop` 后买软中华（65）+ 煎饼（10）→ 余额 75，`shopItemsLeft === 0`，再买一件 → `{ok:false, reason:'visitLimit'}`。
- 送陆诚红塔山 → 好感 +15（50→65），库存 −1。
- 送陆诚奶茶（雷区）→ 好感 −10；送邵晓阳煎饼（一般）→ +5。
- 送老韩茉莉花茶 → `trust` +5、好感不变。
- **Review Focus 4**（每条都断言钱、库存、好感、`giftedToday` 均未改变）：钱不够（把 money 设为 5 后买软中华 → `noMoney`）；同一件东西送同一个人两次 → `alreadyGiven`；给唐经理送 → `notGiftable`；同一个 NPC 当天第二件 → `dailyLimit`；没有这件库存 → `noItem`。
- `endDay` 之后 `giftedToday` 清空，可以再送别的东西。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- gifts`
Expected: FAIL

- [ ] **Step 3: 实现 `gifts.ts`**

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- gifts`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: shop and gift system"`

---

### Task 8: 对质引擎

**Files:**
- Create: `game/src/engine/crossexam.ts`
- Test: `game/tests/crossexam.test.ts`

**Interfaces:**
- Consumes: `Line`、`GameState`（Task 2）、`noticedSlip`（Task 4）。
- Produces: `Step`、`Statement`、`ExamDef` 三个类型声明在 `engine/types.ts`（本任务加进去），`crossexam.ts` 从那里导入；其余在 `crossexam.ts`：

```ts
export type Step =
  | { kind: 'present'; id: string; accepts: string[]; after?: string[]; required?: boolean; reply: Line[];
      replyFor?: Record<string, Line[]> }          // 出示的 id 在 replyFor 里有对应时，用它代替 reply
  | { kind: 'press'; id: string; after?: string[]; required?: boolean; reply: Line[] }
  | { kind: 'argument'; id: string; after?: string[]; required?: boolean; prompt: string;
      options: { text: string; correct: boolean; reply: Line[] }[] }
export interface Statement { id: string; text: string; steps: Step[] }
export interface ExamDef {
  id: string; title: string; startPersuasion: number
  statements: Statement[]; wrongReply: Line[]; intro?: string; onClear?: string
}
export interface ExamState {
  def: ExamDef; persuasion: number
  done: Record<string, string[]>              // statementId → 已完成的 stepId
  failed: boolean; cleared: boolean
}
export type Outcome = 'correct' | 'wrong' | 'premature' | 'ignored'
export interface ExamResult {
  outcome: Outcome; stepId?: string; lines: Line[]
  persuasion: number; statementCleared: boolean; examCleared: boolean; failed: boolean
}
export function computePersuasion(state: GameState): number        // 5 + (flags.challengeAllCorrect ? 1 : 0) + (noticedSlip ? 1 : 0)，上限 7
export function startExam(def: ExamDef, persuasion: number): ExamState
export function availableSteps(exam: ExamState, statementId: string): Step[]   // 未完成且 after 已全部完成
export function present(exam: ExamState, statementId: string, itemId: string, owned: string[]): ExamResult
export function press(exam: ExamState, statementId: string): ExamResult
export function chooseOption(exam: ExamState, statementId: string, stepId: string, optionIndex: number): ExamResult
```

语义（spec 10.0）：`required` 默认——`present`/`argument` 为真，`press` 为假。陈述清空 = 它所有 required 步骤完成（没有 required 步骤则天然清空）；对质清空 = 所有陈述清空，`cleared` 置真。
`present`：`itemId` 不在 `owned` → `ignored`，不扣分；对质已失败或已清空 → `ignored`；在**可用**的 present 步骤里有 `accepts` 包含该 id 的 → `correct`，标记完成，返回其 `reply`；该 id 被本陈述里某个**尚未解锁**（`after` 未满足）的步骤接受 → `premature`，不扣分，`lines` 为空（界面显示"现在还不是出示它的时候"）；其他情况 → `wrong`，说服力 −1，返回 `def.wrongReply`，说服力到 0 则 `failed` 置真（说服力不会为负）。
`press`：有可用的 press 步骤 → `correct` 并返回其 `reply`；没有 → `ignored`。追问永远不扣分。
`chooseOption`：选的 `correct` 选项 → `correct`；错的 → `wrong`，−1，返回该选项自己的 `reply`；`stepId` 不是可用的 argument 步骤 → `ignored`。

- [ ] **Step 1: 写失败的测试 `tests/crossexam.test.ts`**

用测试里内联的一个小 `ExamDef`（一条陈述，步骤 a: present `E06`；b: press，after a；c: present `E13`，after b；d: present `T06`，after c；另有一个 argument 步骤 e，after d，选项 0 错、1 对）：
- 按 a→b→c→d→e(选 1) 顺序走，每步 `outcome === 'correct'`，最后 `examCleared === true`、说服力保持 5。
- 出示一个 `owned` 里有但没有任何步骤接受的 id → `wrong`，说服力 4，`lines` 等于 `wrongReply`。
- 在 b 之前出示 `E13` → `premature`，说服力不变，`lines` 为空。
- **Review Focus 2**：出示 `owned` 里没有的 id → `ignored`，说服力不变。
- **Review Focus 3**：连续 5 次出示错误证据 → 第 5 次后 `failed === true`、`persuasion === 0`；之后再出示正确证据 → `ignored`、`persuasion` 仍是 0；再 `press` → `ignored`。
- `chooseOption` 选错 → `wrong`、−1；选对 → `correct`。
- `replyFor`：一个 present 步骤 `accepts: ['T06','T06a']` 且 `replyFor: { T06a: [某行] }`，出示 `T06a` 时 `lines` 是 `replyFor.T06a`，出示 `T06` 时 `lines` 是 `reply`，两种都 `correct`。
- `computePersuasion`：基础 5；记下一条说漏嘴日志 → 6；再设 `flags.challengeAllCorrect` → 7；不会超过 7。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- crossexam`
Expected: FAIL

- [ ] **Step 3: 实现 `crossexam.ts`**

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- crossexam`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: cross-examination engine"`

---

### Task 9: 序章、第一天咖啡馆与第二天的内容

**Files:**
- Create: `game/src/data/scenes/prologue.json`、`day1.json`、`day2.json`、`game/src/data/actions.json`
- Modify: `game/src/data/evidence.json`、`testimony.json`（补上场景里新授予的条目）
- Test: `game/tests/slice_day2.test.ts`

**Interfaces:**
- Consumes: `SceneRunner`、`Scenes`（Task 5）、`loadData`（Task 6）、`presentableIds`（Task 4）。
- Produces: 场景 id（供 Task 12、14 使用）：`prologue`、`day1_wechat`、`day1_coffee`、`day2_desk`、`day2_pantry`、`day2_lunch`、`act_2_3`、`act_2_6`、`act_2_9`、`day2_end`；`actions.json` 里第二天的行动：`2-3`（帮邵晓阳修 bug，场景 `act_2_3`）、`2-6`（去 1 楼吸烟区找陆诚，`act_2_6`）、`2-9`（找孟遥聊，`act_2_9`），每个 `costHours: 1`、`days: [2]`、`maxHour: 17`；"回家休息"和"去超商"由界面处理，不放进 `actions.json`。

场景内容（对话逐字取自 spec，不要编）：

- `prologue`：第 8 节全部内容。获得证言 T01（宋砚说"最重要的东西都放在荣誉底下"之后）、T02（21:12 之后，伞架和黑屋）。20:20 的"去找宋砚理论 / 再忍忍"两个选项是教学选择，选哪个剧情都一样。结尾 `goto day1_wechat`。台词里宋砚的口癖"亲爱的"以 spec 第 8 节为准（已加入）。
- `day1_wechat`：spec 第 9 节第一天 14:30 的黎默微信（G1）。那一行 say 带 `tag: 'G1'`，语气是刀子嘴的关心，不加任何提示。结尾 `goto day1_coffee`。
- `day1_coffee`：第 9 节 1-11 的咖啡馆。黎默的口吻见 6.9 ③ 和人物表（刀子嘴）。黎默先含糊地暗示（T06a，spec 第 7 节）："走廊上有人影晃，郑岑那天走得挺急的。"**这行 say 带 `tag: 'T06a'`**。随后一个选项：「追问：你看见他往哪走了？」→ 黎默才具体化为 T06："我 8 点 50 去洗手间，看见郑岑没坐电梯，往西楼梯那边走了。"**这行 say 带 `tag: 'T06'`**，并授予证言 T06；「不追问」→ 只有 T06a，不授予 T06。然后才是下一个选项：「把自己掌握的情况说出来」→ `leak: 'coffeeTellAll'`、danger +10；「不多说」→ 无效果。黎默好感 +5。**进入本场景前先对 phone、draft 执行 `learnIntel`**（用一个开头的 `effect` 节点，因为切片从第一天晚上开始，玩家已见过 E07）。同样用 `effect` 授予 E07、E01、E02、E03、E04、E30，并对 trophy 执行 `learnIntel`（第一晚推理会的结论，本切片省略推理会，直接在这里授予）。场景里不处理"结束这一天"，由界面在场景结束后调用 `endDay`（见 Task 12）。
- `day2_desk`（09:20 工位闲聊）：spec 第 9 节第二天的 G2（"听说两年前出事的时候，也是这样封了好几天"，被他自己岔开），那一行带 `tag: 'G2'`。结尾 `goto day2_pantry`。
- `day2_pantry`（09:40 茶水间）：T27。用 `branch`（条件 `intelClean`，`intel: 'draft'`）：干净版是 T27 的说漏嘴台词（带 `tag:'T27'`），泄露版取自 T27 行的"泄露版"。说话前后各一句日常闲聊（递咖啡、问加不加糖），说漏嘴放在中段。
- `day2_lunch`（12:00 午饭）：选项 A「全说了」→ `leak:'lunchTellAll'`、danger +10、黎默好感 +5；B「还没什么头绪。」→ 黎默好感 −3；C 反问需要 T07，本切片不做。**B 之后**用 `branch`（`intelClean` phone）放 T26：干净版带 `tag:'T26'`，夹在两句关心中间，紧接转到"你黑眼圈好重，今晚早点睡"；泄露版取自 T26 行。A 之后走泄露版。**无论选 A 还是 B，午饭快结束时黎默都补一句 G3**（"有些公司死人不稀奇……"，带 `tag: 'G3'`），G3 不受情报流向影响。描写要点：手机壁纸是海岛、背包有银鱼铃铛、**餐盘边一包小鱼饼干，有人伸手他会拍开**（喜好线索）。
- `act_2_3`：邵晓阳好感 +15，对话含"手机锁屏是一只橘猫""家里那位又在抓沙发"（猫条线索）。
- `act_2_6`：陆诚（好感 ≥60 给 T08 的完整版，否则给"九点灯一下全灭了，我们还以为跳闸了"）；含"烟瘾上来了，早上那包早抽完了"（红塔山线索）。授予 T08 的做法本切片只给对话，不单独建 T08 条目。
- `act_2_9`：孟遥好感 ≥40 → 授予 T05；含"我妈吃不下饭，就想吃点水果"（水果盒线索）。
- `day2_end`：一小段旁白"这一天结束了。"，结尾无后续（界面据此进入结束/切换到终章入口）。

- [ ] **Step 1: 写失败的集成测试 `tests/slice_day2.test.ts`**

用 `loadData()` 和 `SceneRunner` 驱动整段流程（测试里写一个小辅助函数 `playUntilChoice` / `playAll`，遇到 choice 时用传入的选择序列）：
- 从 `prologue` 开始一路走完（教学选择选任一项）→ 日志里有 T01 的那句话和 T02 的那几句，`state.testimony` 含 `T01`、`T02`；走完后 `current()` 落在 `day1_coffee` 的第一句或已进入（`goto` 自动跳转）。
- `day1_coffee` 先选「追问」再选「不多说」→ `state.testimony` 含 `T06`，日志里有 `tag === 'T06a'` 和 `tag === 'T06'` 两行，`presentableIds(state)` 含这两个；先选「不追问」→ 只有 `T06a`，`state.testimony` 不含 `T06`，`presentableIds` 不含 `'T06'`；`state.intel.phone === 'clean'`、`state.intel.draft === 'clean'`、`state.intel.trophy === 'clean'`。
- **干净路线**：咖啡「不多说」→ `day2_desk` → `day2_pantry` → `day2_lunch` 选 B：日志里依次出现 tag `G1`（来自 `day1_wechat`）、`G2`、`T27`、`T26`、`G3`，且 `presentableIds` 含这五个。
- **引导不受泄露影响**：泄露路线下，`G1`、`G2`、`G3` 仍然出现在日志里，且仍可出示。
- **泄露路线**：咖啡「把自己掌握的情况说出来」→ `intel.phone/draft` 为 `leaked`；`day2_pantry` 和 `day2_lunch` 里**没有**任何带 `T26`/`T27` tag 的日志行，但仍然有对应的泄露版台词（日志文本里分别含"你说"字样，如"你说手机不见了"）。
- 午饭选 A → `leak: lunchTellAll` 使 trophy 也变 `leaked`。
- 第二天三个行动场景：`act_2_3` 结束后 `affinity.shaoxy` 为 60；`act_2_9` 在孟遥好感 50 时授予 `T05`，把好感设为 30 后不授予。
- `actions.json` 的三个行动在 `day === 2` 且 `hour` 为 9 时 `availableActions` 全部返回，在 `day === 3` 时都不返回。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- slice_day2`
Expected: FAIL

- [ ] **Step 3: 写场景 JSON、行动 JSON，并补齐证物证言条目**

- [ ] **Step 4: 运行测试和数据校验**

Run: `npm test; py -3 tools/validate_data.py game/src/data`
Expected: 全部 PASS，校验 OK。T26、T27 在 `testimony.json` 里标 `"slice": true`，T22、T28、T29 不标。

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: prologue, day 1 coffee and day 2 content"`

---

### Task 10: 终章第一幕的内容

**Files:**
- Create: `game/src/data/exams/finale_act1.json`、`game/src/data/scenes/finale.json`
- Modify: `game/src/engine/data.ts`（`loadData` 读取 `exams/*.json`）、`game/src/data/debug_kit.json`、`evidence.json`、`testimony.json`
- Test: `game/tests/slice_finale.test.ts`

**Interfaces:**
- Consumes: `ExamDef`、`startExam`、`present`、`press`、`chooseOption`、`computePersuasion`（Task 8）、`SceneRunner`（Task 5）。
- Produces: 对质 id `finale_act1`；场景 id `finale_intro`（序幕）、`finale_act1_end`（第一幕结束）；`ExamDef.onClear = 'finale_act1_end'`；`debug_kit.json` 内容：evidence `E03 E06 E12 E13 E14 E15`，testimony `T02 T05`，另有 `backlog` 种子：一行带 `tag: 'T06'` 的黎默原话（"我 8 点 50 去洗手间……"），供"调试入口直接进终章"时有 T06 可以出示。`jumpToFinale()`（Task 14）要把这个种子写进日志。

对质数据（逐字取自 spec 10.1，`startPersuasion` 由调用方用 `computePersuasion` 传入，数据里写 5）：

- 陈述 1、3、5 的 `text` 取自"我看到的那一夜"证词 1、3、5。**陈述 3** 有一个 press 步骤：追问"灯灭了以后你做了什么？"→ 黎默："继续开会啊。反正有屏幕的光。"这行 reply **带 `tag: 'Q-light'`**（这是追问得来的原话，之后第三幕要用）。**陈述 5** 有一个 press 步骤，回答取自 spec"我只是……不想你被冤枉。"。陈述 1 没有步骤。
- **陈述 2**（洗手间），步骤：
  - `s2-1` present `E06`，free
  - `s2-2` press，`after: ['s2-1']`，required `true`（追问"你从哪条路去的洗手间？"）
  - `s2-3` present `E13`，`after: ['s2-2']`
  - `s2-4` present `E15`，`after: ['s2-2']`
  - `s2-5` present，`accepts: ['T06','T06a']`，`after: ['s2-1','s2-3','s2-4']`；`reply` 是 T06 的压轴台词，`replyFor.T06a` 是 spec 10.1 步骤 5 里给 T06a 的那一句（"第一天你只说郑岑走得急。今天你连时间、方向都有了。故事越编越细。"）
  - 每步的 reply 取自 spec 10.1"陈述 2 · 堵路"的步骤 1～5，含"也许我看错了人……""从转角出去，过电梯厅……""我记错了，我是从东边消防门出去的……""……可能是我记错了时间。"以及压轴的林一程台词和黎默的"……我可能是记错了。"
- **陈述 4**（21:08），步骤：`s4-1` present `E14`；`s4-2` present `E03`，`after: ['s4-1']`；`s4-3` press，`after: ['s4-2']`（追问"会议室 B 里除了你，还有谁？"），required `true`。reply 取自 spec"陈述 4 · 堵路"。**本切片不实现"替代组合 E12+T05+T02"**（需要多件证物同时出示，列入后续工作）。
- `wrongReply`：黎默一句不耐烦的话，如"你拿这个出来，是想说明什么？"（旁白式的过渡，属于 spec 没有的内容，保持一句）。
- 场景 `finale_intro`：10.1 开场的老韩质询和黎默站起来作证的几句；`finale_act1_end`：第一幕结束，黎默沉默后说出"……我撒了谎。……我是周屿的未婚夫。"全场哗然，之后一句旁白"（切片到此结束。）"，结尾 `end`。

- [ ] **Step 1: 写失败的测试 `tests/slice_finale.test.ts`**

- `loadData().exams.finale_act1` 存在，含 5 条陈述；`debugKit` 的 evidence 含 `E14`。
- 用 `owned = [...debugKit.evidence, ...debugKit.testimony, 'T06']`、`startExam(def, 5)`：
  - 陈述 2 按 `s2-1`（E06）→ press → `E13` → `E15` → `T06` 全部 `correct`，`statementCleared === true`；
  - 先出示 `T06` → `premature`，说服力不变；
  - 先出示 `E13`（未 press）→ `premature`；
  - 出示 `E12`（owned 里有，但陈述 2 没有步骤接受）→ `wrong`，说服力 4。
- 陈述 4 按 `E14` → `E03` → press 走完 → `statementCleared`；陈述 1、3、5 无 required 步骤，天然清空；陈述 2 和 4 都清空后 `examCleared === true`。
- 陈述 3 的 press 返回的 `lines[0].tag === 'Q-light'`。
- 跑 `finale_intro` 和 `finale_act1_end` 场景到结束不抛错，日志里能找到"我是周屿的未婚夫"。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- slice_finale`
Expected: FAIL

- [ ] **Step 3: 写 `finale_act1.json`、`finale.json`、`debug_kit.json`，并让 `loadData` 读取 `exams`**

- [ ] **Step 4: 运行全部测试和数据校验**

Run: `npm test; py -3 tools/validate_data.py game/src/data`
Expected: PASS，校验 OK（包括"陈述内 `after` 引用存在""`onClear` 场景存在""证物 id 存在"）。

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: finale act 1 cross-examination content"`

---

### Task 11: Pinia store 与场景界面（对话框、选项、日志面板）

**Files:**
- Create: `game/src/engine/store.ts`、`game/src/ui/HudBar.vue`、`DialogueBox.vue`、`ChoiceList.vue`、`BacklogPanel.vue`、`TitleScreen.vue`
- Modify: `game/src/App.vue`
- Test: `game/tests/ui_scene.test.ts`

**Interfaces:**
- Consumes: `SceneRunner`、`GameState`、`createInitialState`、`toggleNote`、`visibleLog`、`loadData`。
- Produces（`store.ts`）：

```ts
export type Screen = 'title' | 'scene' | 'hub' | 'shop' | 'exam' | 'end'
export const useGameStore: () => {
  state: GameState; data: GameData; screen: Ref<Screen>
  currentNode: ComputedRef<SceneNode | null>
  newGame(): void                        // 重置状态，screen='scene'，start('prologue')
  advance(choice?: number): void         // 转发给 runner；场景结束时由后续任务决定去向（本任务：screen 保持 'scene'，currentNode 为 null）
  note(lineId: string): NoteResult
}
```

组件 props/emits：
- `HudBar`：props `{ day: number; hour: number; money: number; danger: number }`，显示"第 N 天 HH:00""¥金额"；危险值 ≥30 时显示心跳图标，不显示数字（spec 6.8 ②）。
- `DialogueBox`：props `{ speaker: string; text: string }`，点击发出 `advance`。
- `ChoiceList`：props `{ options: string[] }`，点击第 i 项发出 `choose`（payload 为 i）。
- `BacklogPanel`：props `{ lines: VisibleLogLine[]; noteIds: string[] }`，每行有一个"记下"按钮，发出 `note`（payload 为行 id）；有一个"笔记"标签页只显示 `noted` 的行。**不渲染任何 tag，不加任何高亮样式。**
- `TitleScreen`：一个"开始游戏"按钮，发出 `start`。
- `App.vue`：按 `screen` 显示标题或场景界面；场景界面包含 HudBar、DialogueBox 或 ChoiceList（取决于 `currentNode.type`）、一个"日志"按钮展开 BacklogPanel。说话人 id 到显示名的映射用 `data.npcs`，另加 `lyc`→"林一程"、`songyan`→"宋砚"、`narration`→不显示名字。

- [ ] **Step 1: 写失败的组件测试 `tests/ui_scene.test.ts`**（`@vue/test-utils`）

- `DialogueBox` 渲染说话人和文本，点击后 `emitted('advance')` 长度为 1。
- `ChoiceList` 渲染 3 个选项，点第 2 个后 `emitted('choose')[0]` 是 `[1]`。
- `BacklogPanel`：渲染传入的行；点击某行的"记下"发出 `note` 和该行 id；**`wrapper.html()` 不包含 `'T26'`，也不包含 `'tag'`**（用一条内部带 `tag: 'T26'` 的日志，经 `visibleLog` 转换后传入）；"笔记"标签页只显示 `noted: true` 的行。
- `HudBar`：danger 为 20 时没有心跳元素，为 40 时有；文本里不出现危险值的数字。
- Store 集成：`newGame()` 后 `currentNode` 非空，`advance()` 若干次后日志里有序章的第一句。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- ui_scene`
Expected: FAIL

- [ ] **Step 3: 实现 store 和五个组件，更新 `App.vue`**；记下后若 `reaction` 非空，在屏幕底部短暂显示该文字（"……？"）约 2 秒。

- [ ] **Step 4: 运行全部测试和构建**

Run: `npm test; npm run build`
Expected: PASS，构建成功。

- [ ] **Step 5: 手动验证**

Run: `npm run dev`，浏览器打开本地地址，点"开始游戏"，能一句句读完序章，打开日志能看到对话，点"记下"后笔记标签页出现该行。

- [ ] **Step 6: 提交** `git add -A && git commit -m "feat: store and scene UI with backlog"`

---

### Task 12: 第二天行动界面、超商和送礼

**Files:**
- Create: `game/src/ui/HubScreen.vue`、`ShopPanel.vue`、`GiftPicker.vue`
- Modify: `game/src/engine/store.ts`、`game/src/App.vue`
- Test: `game/tests/ui_hub.test.ts`

**Interfaces:**
- Consumes: `availableActions`、`endDay`、`advanceHour`（Task 2）、`openShop`、`buyItem`、`giveGift`（Task 7）。
- Produces（`store.ts` 新增）：

```ts
startAction(actionId: string): void      // 启动该行动的场景，场景结束后 advanceHour(costHours) 并回到 'hub'
goShop(): void                           // 仅当 hour 为 12 或 18 时可用；openShop 并 screen='shop'
leaveShop(): void                        // screen='hub'
buy(itemId: string): BuyResult
gift(npcId: NpcId, itemId: string): GiftResult
restAtHome(): void                       // endDay({rested:true})；若新的一天没有内容，screen='end'
```

组件：
- `HubScreen`：props `{ actions: ActionDef[]; canShop: boolean }`；列出行动按钮（发出 `action`，payload 是行动 id）、"去超商"（仅 `canShop`，发出 `shop`）、"回家休息"（发出 `rest`）。每个行动按钮旁有一个"送礼"入口：打开 `GiftPicker`。
- `ShopPanel`：props `{ items: Item[]; money: number; itemsLeft: number }`，点击商品发出 `buy`（payload 是物品 id）；钱不够或 `itemsLeft` 为 0 时该按钮禁用。
- `GiftPicker`：props `{ inventory: Record<string, number>; items: Item[] }`，选一件库存物品发出 `pick`（payload 物品 id）；库存为 0 时显示"背包是空的"。
- 流程：第一天咖啡馆场景结束后，界面调用 `endDay({rested:false})` 进入第二天，依次播放 `day2_desk`、`day2_pantry`、`day2_lunch`，然后进入 `hub`（`hour` 设为 13）；`hour` 超过 17 时只剩"回家休息"；`restAtHome` 之后进入 `end` 屏幕（切片到第二天为止，终章入口见 Task 14）。

- [ ] **Step 1: 写失败的测试 `tests/ui_hub.test.ts`**

- `HubScreen` 渲染传入的行动；`canShop` 为假时没有"去超商"按钮；点击行动、去超商、回家休息分别发出 `action`/`shop`/`rest`。
- `ShopPanel`：money 为 5 时软中华按钮禁用（`disabled` 属性）；`itemsLeft` 为 0 时所有按钮禁用；点击可买的商品发出 `buy` 和物品 id。
- `GiftPicker`：库存为空时显示"背包是空的"；有库存时点击发出 `pick`。
- Store 集成：把状态设到第二天、13:00，`startAction('2-3')` 并跑完场景后 `hour === 14`、`screen === 'hub'`；`hour` 为 12 时 `goShop()` 成功，为 13 时 `goShop()` 不改变 `screen`；`buy('ruanzhonghua')` 后钱 85；`gift('lucheng','hongtashan')`（先买红塔山）后好感 +15；`restAtHome()` 后 `day === 3`。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- ui_hub`
Expected: FAIL

- [ ] **Step 3: 实现三个组件并扩展 store 与 `App.vue`**

- [ ] **Step 4: 运行全部测试和构建**

Run: `npm test; npm run build`
Expected: PASS

- [ ] **Step 5: 手动验证**

Run: `npm run dev`，从头玩到第二天下午：能在 12:00 逛超商买东西，进入"找陆诚聊聊"后送红塔山，好感提示出现，回家休息进入结束画面。

- [ ] **Step 6: 提交** `git add -A && git commit -m "feat: hub, shop and gift UI"`

---

### Task 13: 对质界面

**Files:**
- Create: `game/src/ui/ExamScreen.vue`、`CourtRecord.vue`、`EndScreen.vue`
- Modify: `game/src/engine/store.ts`、`game/src/App.vue`
- Test: `game/tests/ui_exam.test.ts`

**Interfaces:**
- Consumes: `startExam`、`present`、`press`、`chooseOption`、`computePersuasion`（Task 8）、`presentableIds`（Task 4）、`logLines`（Task 4）。
- Produces（`store.ts` 新增）：

```ts
startExamById(id: string): void          // 用 computePersuasion 开始对质，screen='exam'
exam: Ref<ExamState | null>
examStatementIndex: Ref<number>
examPresent(itemId: string): ExamResult
examPress(): ExamResult
examChoose(stepId: string, optionIndex: number): ExamResult
```
store 在每次得到 `ExamResult` 后，把 `lines` 写进日志（`logLines`），**其中带 `tag` 的行会带着 tag 进入日志**；对质清空后运行 `def.onClear` 场景，场景结束后 `screen='end'`；失败则 `screen='end'` 并显示"说服力归零"。

组件：
- `CourtRecord`：props `{ ids: string[]; names: Record<string,string> }`，列出可出示的东西，点击某项发出 `pick`（payload 是 id）。名字用 `evidence.json`/`testimony.json` 里的 `name`，日志原话（tag 以 `Q-`、`T22`、`T26`～`T29` 开头）显示为"原话："+该行文本前 12 个字。
- `ExamScreen`：props `{ statement: Statement; index: number; total: number; persuasion: number; lastLines: Line[]; recordIds: string[] }`；显示当前陈述文本、说服力（用 5～7 个小方块表示，不显示数字）、"上一句 / 下一句""追问""出示"（打开 `CourtRecord`）；发出 `prev`、`next`、`press`、`present`（payload 是 id）。若当前陈述有可用的 argument 步骤，显示其 `prompt` 和选项按钮，发出 `choose`（payload 是 `{stepId, optionIndex}`）。`lastLines` 以对话形式显示。
- `EndScreen`：显示"切片到此结束"和"重新开始"按钮（发出 `restart`）；若对质失败，显示"说服力归零"。

- [ ] **Step 1: 写失败的测试 `tests/ui_exam.test.ts`**

- `ExamScreen`：渲染陈述文本和 `persuasion` 个小方块（用 `data-testid="pip"`）；点"追问"发出 `press`；点"下一句"发出 `next`；提供 argument 时渲染选项，点击发出 `choose` 与 payload。
- `CourtRecord`：点击一项发出 `pick` 和 id。
- Store 集成（真数据）：给状态加上 `debugKit` 和 `T06`（日志里放一行 tag 为 `T06` 的原话），`startExamById('finale_act1')`，陈述 2 依次 `examPresent('E06')`、`examPress()`、`examPresent('E13')`、`examPresent('E15')`、`examPresent('T06')`；陈述 4 同理；最后 `exam.value.cleared === true`，日志里有 `'Q-light'` tag 的行（若玩家按过陈述 3 的追问）。
- 失败路径：连续 5 次 `examPresent('E12')`（陈述 2 里不接受）后 `exam.value.failed === true`，`screen === 'end'`。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- ui_exam`
Expected: FAIL

- [ ] **Step 3: 实现三个组件并扩展 store 与 `App.vue`**

- [ ] **Step 4: 运行全部测试和构建**

Run: `npm test; npm run build`
Expected: PASS

- [ ] **Step 5: 提交** `git add -A && git commit -m "feat: cross-examination UI"`

---

### Task 14: 存档、调试入口与整体串联

**Files:**
- Create: `game/src/engine/save.ts`
- Modify: `game/src/engine/store.ts`、`game/src/ui/TitleScreen.vue`、`game/src/ui/HubScreen.vue`、`game/src/App.vue`
- Test: `game/tests/save.test.ts`

**Interfaces:**
- Consumes: `GameState`（Task 2）、`debugKit`（Task 10）。
- Produces:

```ts
export function serializeState(state: GameState): string
export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: 'empty' | 'corrupt' | 'version' }
export function loadSave(raw: string | null): LoadResult
```
存档 JSON 外层是 `{ version: 1, state: {...} }`；`loadSave` 在 `raw` 为 `null` → `empty`；`JSON.parse` 失败、缺少必需字段或字段类型不对（如 `money` 不是数字、`affinity` 缺少某个 NpcId、`intel` 的值不是三种状态之一）→ `corrupt`；`version` 不是 1 → `version`。**任何情况下都不抛异常。**

store 新增：`saveGame()`（写 `localStorage['jiudian-save']`）、`loadGame()`（读取并 `loadSave`，失败时 `screen` 保持 `title` 并设置 `loadError: string` 提示"存档无法读取"）、`jumpToFinale()`（把 `debugKit` 的证物、证言加入状态，`startExamById('finale_act1')`，在 `finale_intro` 之后进入对质）。`TitleScreen` 增加"继续游戏"（发出 `continue`）和一个小字"【开发】直接进入终章第一幕"（发出 `debugFinale`）；`HubScreen` 增加"存档"按钮。第二天结束后（`restAtHome`）除了 `end` 屏幕外，再给一个按钮"进入终章第一幕（切片）"调用 `jumpToFinale()`。

- [ ] **Step 1: 写失败的测试 `tests/save.test.ts`**

- 往返：给状态设置 evidence、日志、笔记、inventory，`loadSave(serializeState(state))` 得到 `ok:true`，且深度相等。
- **Review Focus 1**（每条断言返回 `ok:false` 和对应 reason，且不抛异常）：`loadSave(null)` → `empty`；`loadSave('not json')` → `corrupt`；`loadSave('{}')` → `corrupt`；有效存档里把 `money` 改成字符串 → `corrupt`；把 `affinity.limo` 删掉 → `corrupt`；`version` 改成 2 → `version`。
- Store：`loadGame()` 在 `localStorage` 里放了损坏内容时，`screen === 'title'` 且 `loadError` 非空；放有效存档时 `screen === 'hub'`（存档只能在 Hub 里存，所以读档一律回到 Hub）。
- `jumpToFinale()` 之后 `state.evidence` 含 `E14`、`exam.value` 非空，且 `presentableIds(state)` 含 `'T06'`（来自 `debug_kit.json` 的 backlog 种子）。

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- save`
Expected: FAIL

- [ ] **Step 3: 实现 `save.ts`，扩展 store、标题画面和 Hub**

- [ ] **Step 4: 运行全部测试和构建**

Run: `npm test; npm run build; py -3 tools/validate_data.py game/src/data`
Expected: 全部通过。

- [ ] **Step 5: 手动完整通关一遍切片**

Run: `npm run dev`，从标题开始：序章 → 咖啡馆 → 第二天（茶水间、午饭选 B、超商送礼、三个行动）→ 回家休息 → 进入终章第一幕 → 清空陈述 2 和 4 → 看到"我是周屿的未婚夫" → 结束画面。再来一遍，咖啡馆选"把自己掌握的情况说出来"，确认午饭里没有 T26 的说漏嘴。

- [ ] **Step 6: 提交** `git add -A && git commit -m "feat: save/load, debug entry and full slice wiring"`

---

### Task 15: Electron 打包成双击可用的 exe

**Files:**
- Create: `game/electron/main.cjs`
- Modify: `game/package.json`（`main`、脚本、`build` 配置）

**Interfaces:**
- Produces: npm 脚本 `electron:dev`（先 `vite build` 再 `electron .`，用于本地试跑）、`dist`（`vite build && electron-builder --win portable`）；产物 `game/release/` 下的免安装单文件 exe。
- `main.cjs`：创建 `BrowserWindow`（1280×720，`minWidth: 960`，`minHeight: 600`，`title: '九点熄灯'`，`autoHideMenuBar: true`，`webPreferences` 里 `contextIsolation: true`、`nodeIntegration: false`），`loadFile(path.join(__dirname, '../dist/index.html'))`；所有窗口关闭时退出应用；不开启远程调试。
- `package.json`：`"main": "electron/main.cjs"`；`build` 字段：`appId: "local.jiudian.game"`、`productName: "九点熄灯"`、`files: ["dist/**", "electron/**"]`、`directories.output: "release"`、`win.target: "portable"`、`win.signAndEditExecutable: false`（避免 Windows 无管理员权限时因符号链接失败）。

- [ ] **Step 1: 安装依赖**

Run: `npm i -D electron electron-builder`。如果下载 Electron 或 electron-builder 的二进制失败（网络问题），在当前 shell 设置 `$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'` 和 `$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'` 后重试。

- [ ] **Step 2: 写 `main.cjs` 并配置 `package.json`**

- [ ] **Step 3: 本地试跑**

Run: `npm run electron:dev`
Expected: 弹出一个标题为"九点熄灯"的桌面窗口，显示标题画面，点"开始游戏"能进入序章。

- [ ] **Step 4: 打包**

Run: `$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'; npm run dist`
Expected: `game/release/` 下出现 `九点熄灯 *.exe`（portable）。

- [ ] **Step 5: 双击验证**

把 exe 复制到桌面（或另一个没有 node_modules 的文件夹），**双击**打开：窗口正常显示，能完整玩到终章第一幕；存档后关闭再打开，点"继续游戏"能读回。

- [ ] **Step 6: 提交** `git add -A && git commit -m "feat: package as portable Windows exe with Electron"`

---

## Self-Review

**1. Spec 覆盖（切片范围内）：**
- 6.2b 礼物与超商 → Task 7、12；6.5 / 10.0 对质规则 → Task 8；6.9 情报流向、日志、「记下」、不提示原则 → Task 3、4、11；说漏嘴 T26、T27 → Task 9（T28、T29 的场景留给后续，数据结构已就绪）；第 8 节序章、1-11、第二天事件与行动 → Task 9；10.1 第一幕 → Task 10；双击即用的 exe → Task 15。
- **有意不做（切片之外）**：第一天其余行动、第三～五天、危险值与袭击 QTE、推理会、谎言突破（6.6）、第二幕以后的对质（"他怎么知道的"、三件套）、多件证物同时出示的"替代组合"、老韩信任度的系统（除礼物对 `trust` 的改动外）、隐藏结局。

**2. Step 扫描：** 每个步骤都给出了文件、签名或断言；有一处我在 Task 2 里写得绕——`learnIntel` 的 Effect 分支在 Task 2 里先留空，Task 3 补齐；实现者应当在 Task 2 里让该分支暂时什么都不做，而不是加占位注释。

**3. 类型一致：** 对质相关统一用 `ExamDef / ExamState / ExamResult / Step / Statement`（Task 8 定义，Task 6 的 `GameData.exams`、Task 10、13 使用）；`Line` 在 Task 2 定义，Task 4、5、8 使用；`LeakTrigger` 在 Task 2 的 `types.ts` 定义，Task 3、5 使用；说漏嘴 tag 与情报对应表 `SLIP_FOR_INTEL` 只在 Task 3 定义，Task 4 引用；`ActionDef` 在 Task 2 定义，Task 6、9、12 使用。
`ExamDef` 要到 Task 8 才定义，所以 Task 6 的 `GameData.exams` 先用 `Record<string, unknown>`，Task 10 收紧（已在两处任务里写明）。

**4. Review Focus：** 五条分别在 Task 14、8、8、7、3 里有测试。

**5. 比例：** 计划长度是 spec 相关章节的 1/3 左右，代码块以签名和断言为主，没有函数体。
