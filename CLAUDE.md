# 雨落无声（原名《九点熄灯》，其中第一章仍叫《熄灯》）

## 命令（本机 Node 18 跑不动 vitest 5 / vite 8，一律用 Electron 当 Node）
- 测试 + 类型检查：`node scripts/check.cjs`（已排除 `tests/package_config.test.ts`，它和 package.json 的输出目录不一致，未决）
- 数据校验：`py -3 tools/validate_data.py src/data`（本机 `python` 是 2.7，必须 `py -3`）
- 图片转 webp：`ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe tools/build_assets.mjs`
- 网页构建：`ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe node_modules/vite/bin/vite.js build`（输出 `dist/`）

## 结构与约定
- 章节制：`src/data/chapters/<id>.json` 定义章节；案二的证物/证词/行动/事件/房间放 `src/data/chapters/c2/`，行动与事件按 `chapter` 过滤；场景、考核仍在全局 `src/data/scenes|exams`，id 必须带章节前缀（`c2_…`）。
- 图片原稿统一在 `design/`（`background/game-backgrounds`、`evidence`、`evidence2`、`posters`、`role_images`），构建脚本只读这里。
- 案二设定以 `design/新剧本/02f_案二v4_咖啡匿名下单.md` 和 `02e_案二v3_设定拍板.md` 为准；案二必须靠推理破案，不能有明显指向陆诚的提示。案一不再改动。
- 用 DeepSeek 做耗 token 的活：`node D:/deepseek/ds-worker/ds.mjs do|find "..." --check "node scripts/check.cjs"`；它不能运行命令（构建、Java 校验由 Claude 自己跑）。
- 提交信息末尾加 Co-Authored-By 行；仓库是公开的，**不要把服务器地址、密码写进任何会提交的文件**。

## 部署
服务器信息在 `CLAUDE.local.md`（已加入 .gitignore，不进 git）。
