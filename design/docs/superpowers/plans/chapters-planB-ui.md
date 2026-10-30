目标：在上一轮已经做好的"章节层"（引擎与数据，见 src/engine/types.ts 的 ChapterDef、src/data/chapters/*.json、src/engine/profile.ts、store 的 chapter/endings/startChapter/continueChapter、saves.ts 按章节的存档）之上，做**界面**：章节选择、标题卡/结局卡、前情提要、存档与回溯面板的章节提示。设计依据：design/docs/superpowers/specs/2026-10-30-章节化设计.md 的第三点五、四、五、五点五、六、九、十节，先读。
案一的游戏体验保持不变；c2 目前只有占位数据，界面上显示为"敬请期待"，不能进入。

1. src/App.vue：`screen` 增加 'chapters'（章节选择）、'card'（标题卡/结局卡）、'recap'（前情提要）；沿用现有 screen 切换写法。第 197 行的 `store.state.day === 5` 改成 `store.state.day === store.chapter.lastDay`。进入章节的流程：章节选择 → 标题卡（章节名+副标题，点击继续）→ 若该章 recap 非空且（第一次进入或玩家点了"前情提要"）则播前情提要 → 序章。案一 recap 为空，直接标题卡后进序章。
2. 新建 src/ui/ChapterSelect.vue（参照 TitleScreen.vue 的视觉与 testid 习惯）：列出所有章节卡片，每张显示：章节名、副标题、状态（未解锁 / 可玩 / 已通关·最佳结局名 / 敬请期待）、该章自动存档的进度与时间（读 store 提供的 slotInfo('auto', chapterId)；没有就显示"尚未开始"）；按钮：[开始] 或 [继续]、[重新开始]（有存档时才有；点击弹确认文案"重新开始会清空本章的自动存档与回溯记录，手动存档槽不受影响。"）、[前情提要]（recap 非空才显示）。解锁用 profile.ts 的 isUnlocked；c2 因为没有场景数据标"敬请期待"（用一个章节字段或判断 `data.scenes[chapter.prologue]` 不存在）。
3. src/ui/TitleScreen.vue：加"章节选择"按钮；"继续"改成继续**全部章节里最近一次的自动存档**（比较各章 auto 存档的 at）。
4. 新建 src/ui/ChapterCard.vue：全屏卡，两种用法——标题卡（章名+副标题+一行日期）与结局卡（结局名+文字+[继续]）。样式参照 EndScreen.vue。
5. 新建 src/ui/RecapScreen.vue：播放 chapter.recap（每张 title/text，image 是背景 id，用现有背景资源解析方式，找不到就纯色底）；点击或空格翻页，淡入淡出；右上角 [跳过]；最后一张之后触发完成回调；完成或跳过时调用 profile.markRecapSeen。不进入回溯树，不进日志。
6. src/ui/EndScreen.vue：结局文案与标题改读 store.endings（章节自己的表）；若结局 `clears` 为 true，调用 profile.markCleared(chapterId, endingId)，并显示"下一章已解锁：xxx"与按钮 [章节选择]；BAD 结局（clears=false）显示 [回到上一个检查点]（沿用现有逻辑）和 [章节选择]。
7. src/ui/SavePanel.vue（参照现有写法）：顶部固定一行"当前章节：{章节名}　存档只在本章内有效"；每个槽位显示章节标签与"第 N 天 HH:00"，空槽写"本章空槽"；其他章节的存档折叠成灰色的"其他章节的存档"，展开后只读展示，点读取时弹确认："这是【{章节名}】的存档，读取后将离开当前的【{当前章节名}】。当前进度会自动保存。"确认后：先 writeSlot('auto')，再 loadGame(slot, 该章)。删除存档前显示章节名和进度的确认。
8. 一次性提示：玩家第一次进入第二章及以后任一章时（profile.seenChapterNote 为 false）弹提示卡"从本章起，存档与回溯按章节分开保存。随时可以在章节选择里回到之前的章节，它们的存档不会被覆盖。"，确认后置 true。旧存档迁移提示：首次启动若 localStorage 里检测到旧 key 且迁移标记刚被写入，弹一次"已把你之前的存档归入【案一·熄灯】。"（让 saves.ts 的 migrateLegacySaves 返回是否真的迁移过，store 暴露一个 notice）。
9. 自动存档提示：store 在写自动存档（recordHub 里）后，用现有 FeedToasts/notice 机制弹一条"已自动保存（{章节名}·第 {day} 天）"；同一小时内重复保存不要刷屏（简单节流即可）。
10. src/ui/TimelinePanel.vue：标题改为"回溯 · {章节名}"，下方一行"这里只显示本章的选择，其他章节请在章节选择里回溯。"；分组标题读 `store.chapter.calendar`：`第 N 天`、副标题用该天的 date（取代写死的 `9 月 ${14 + key} 日`）；序章分组名保持"序章"。HudBar.vue 的"第 N 天"保持不变。
11. 游戏内菜单（HubScreen/工具栏，沿用现有按钮写法）加 [前情提要]（仅当本章 recap 非空时显示），点击重播本章前情提要后回到原界面。
12. 测试（参照 tests/ui_save_panels.test.ts、tests/ui_timeline_tree.test.ts、tests/ui_hub.test.ts 的挂载写法）：新增 tests/ui_chapters.test.ts，覆盖：章节选择的状态（c1 可玩、c2 敬请期待/未解锁）、BAD 结局不解锁 c2 而 true 解锁、存档面板的章节提示与跨章确认、回溯面板标题与日期来自章节、前情提要可跳过且标记已看、第一次提示卡只出现一次、案一"继续"仍然进入原来的流程。

验收标准：`node scripts/check.cjs` 通过（它会跑全部单元测试和类型检查）；`npm run build` 若本机 node 太旧无法运行可以跳过，类型检查通过即可；案一的原有 UI 测试一律保持通过；所有新文案是中文且与设计稿一致。
禁止：改 src/data/scenes、exams、evidence*.json、conclusions.json 的内容；改 design/；改 src/engine 里与章节无关的逻辑（本轮引擎只允许为界面提供必要的小接口，并在汇报里列出）。
参照：src/ui/TitleScreen.vue、SavePanel.vue、TimelinePanel.vue、EndScreen.vue 的现有写法与样式变量；背景资源的解析方式参考 src/ui/Stage.vue。
