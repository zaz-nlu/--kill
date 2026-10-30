目标：给游戏加"章节"这一层（案一=章节 c1，后面还有 c2/c3/c4），并且**案一的行为完全不变**（现有测试全绿、构建通过）。
设计稿在 D:/kill/game/design/docs/superpowers/specs/2026-10-30-章节化设计.md，先读第二、三、四、五、七节，照着做。

本轮只做"引擎与数据层"，不做界面（章节选择页、提示卡、前情提要播放界面由下一轮做）。

1. src/engine/types.ts：新增 `ChapterDef`（字段：id、title、sub、order、calendar、prologue、trial、lastDay、startState、startKit、endings、mechanics、recap，见设计稿第二节与第十节）；`GameState` 增加 `chapter: string`（必填）；`IntelId` 改成 `string`（每章自己的情报集合），原来的五个值作为 c1 的 `startState.intel`。`EndingDef` 加 `clears: boolean`。
2. src/data/chapters/c1.json：新建，把现在写死的东西搬进来——calendar 5 天（日期文案 "9 月 15 日" 到 "9 月 19 日"；第 1 天 startHour 13、第 5 天 lastHour 11、其余 8 点到 21 点）、prologue "prologue"、trial {scene:"finale_intro", firstExam:"finale_act1"}、lastDay 5、startState（hour 9、money 150、hp 3、danger 0、trust 20、affinity 用现在 state.ts 的 INITIAL_AFFINITY、intel 五个 id 都为 unknown）、endings（把 endings.ts 里 8 个结局原文搬进来，hp/bad2/bad3 的 clears=false，其余 true）、mechanics {danger:true, shop:true, gifts:true}、recap 为空数组。
   src/data/chapters/c2.json：新建占位章，只有 id/title("案二·苏闻")/sub/order 2/calendar 3 天（11 月 19 日到 21 日）/lastDay 3/startState（hour 8、money 150、hp 3、danger 0、trust 50、affinity 沿用 c1 的表、intel 空对象）/prologue "c2_prologue"/trial {scene:"c2_trial", firstExam:"c2_act1"}/endings 空对象/recap 先放 6 张前情提要卡（内容见设计稿第十节表格，字段 title/text/image，image 填背景 id）。c2 暂无场景数据，所以 c2 在界面里先标为"敬请期待"，引擎不要尝试运行它。
3. src/engine/data.ts：`loadData` 增加 `chapters: Record<string, ChapterDef>`（用 import.meta.glob 读 ../data/chapters/*.json，按 id 建表）；scenes/exams 合并时检测**跨文件重复 id，直接 throw**（现在是静默覆盖）；证物等其他数据不动。
4. src/engine/state.ts：`createInitialState(chapter: ChapterDef)` 读 `chapter.startState`；`version` 改 2；`state.chapter = chapter.id`。保留 `INITIAL_AFFINITY` 导出（别的地方在用），值不变。所有调用 `createInitialState()` 的地方（含测试夹具）按需传 c1。为了少改测试，可以让参数可选，缺省用 c1。
5. src/engine/calendar.ts：`slotsLeft`、`DAY_START`、`LAST_HOUR`、`endDay` 里写死的 `day === 1 ? 13`、`day === 5 ? 11`、`day >= 6` 全部改成读当前章节的 calendar/lastDay；保留旧的导出常量作为 c1 默认值，避免大面积改测试。
6. src/engine/store.ts：
   - 写死的 `'prologue'`（新游戏）、`'finale_intro'`、`'demo_exam_intro'`、`'finale_act1'`、`day >= 6`、`state.day === 6`、`state.day = 5; hour = 14`（跳到终章）全部改成读 `chapter.prologue / chapter.trial / chapter.lastDay`；demo 仍用 c1。
   - `TIMELINE_KEY` 变成按章节：`jiudian-timeline:<chapterId>`；启动时若发现旧 key `jiudian-timeline` 且没有 `jiudian-timeline:c1`，把它迁移成 c1 的 key 后删除旧 key。
   - 结局：`ENDINGS` 的查表改成读 `chapter.endings`；`endings.ts` 保留导出（EndScreen 等仍引用），内容改为从 c1.json 派生，避免两份。
   - 新增 store 方法：`startChapter(id)`（新建初始状态、清空该章回溯树、播序章）、`continueChapter(id)`（载入该章自动存档）；本轮先实现引擎层，界面调用留给下一轮。
7. src/engine/saves.ts + src/engine/save.ts：
   - 存档 key：`jiudian-auto:<chapter>`、`jiudian-save:<chapter>:<N>`；写入 `version: 2`、`meta.chapter`；`slotKey` 增加 chapter 参数。
   - 读档：`state.chapter` 与槽位章节不一致 → 返回失败并提示，不静默覆盖。
   - 迁移：版本 1 的存档（旧 key `jiudian-auto`、`jiudian-save`、`jiudian-save-N`）首次启动时复制为 c1 的新 key（不删旧的，只做一次，用一个 `jiudian-migrated-v2` 标记）。
   - `save.ts` 的 `NPC_IDS` 补上缺失的 `laoliu`；`INTEL_IDS` 校验改为接受任意字符串键。
8. 新增 src/engine/profile.ts：玩家档案（跨章只读记录），存 `localStorage['jiudian-profile']`：`{ cleared: Record<chapterId, { ending: string; at: number }>, seenRecap: Record<chapterId, boolean>, seenChapterNote: boolean }`；函数：`loadProfile / markCleared(chapter, endingId) / isUnlocked(chapter, all) / markRecapSeen`。`isUnlocked`：order 1 永远解锁；其余看上一章 `cleared` 有记录且该结局 `clears===true`。读写都包 try/catch。
9. tools/validate_data.py：增加对 src/data/chapters/*.json 的基本校验（必需字段、lastDay 与 calendar 长度一致、c1 的 prologue/trial.scene 在场景表里存在）；同时检查 scenes/exams 跨文件重复 id。
10. 测试：现有测试全部保持通过（必要时只改夹具传参）。新增 tests/chapters.test.ts：
   - c1 定义可加载、字段完整；slotsLeft 在 c1 第 1/5 天与改动前结果一致；
   - 存档 key 按章节、版本 2、读取章节不匹配被拒绝；
   - 旧版本存档迁移为 c1；
   - 旧回溯 key 迁移为 `jiudian-timeline:c1`；
   - profile：BAD 结局不解锁 c2，true/a/b/c/hidden 解锁；
   - loadData 在 scenes 出现重复 id 时 throw（可对合并函数做单元测试）。

验收标准：`npm test` 全绿、`npm run build` 通过、`py -3 tools/validate_data.py src/data` 通过；案一的流程、文案、结局完全不变。
禁止：改动任何 src/data/scenes、exams、evidence*.json 的内容（只允许新增 chapters/ 目录）；改动 src/ui 下的界面文件（本轮只做引擎与数据，除非为通过类型检查必须最小改动，并在汇报里列出）；改动 design/ 目录。
参照：回溯与存档的现有写法见 src/engine/timeline.ts、saves.ts、store.ts（recordNode、persistTimeline、writeSlot）。
