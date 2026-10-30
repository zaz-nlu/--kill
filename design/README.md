# design/ — 剧本、插图、设计稿（从 D:\kill 复制进仓库，方便换电脑继续做）

| 目录 / 文件 | 内容 |
|---|---|
| `新剧本/` | 四案新剧本（总纲、案一改动、案二 v3 全套、案三、案四、01d 黎默动机 v7） |
| `docs/superpowers/` | 设计稿与决议（章节化设计、修订决议、证物分类等） |
| `剧本_九点熄灯*.md` | 旧主剧本（v5.0 及备份） |
| `*提示词.md` | 给 ChatGPT 画图用的提示词（案一补图、案二补图、背景、立绘） |
| `role_images/` | 角色立绘原图 PNG（`tools/build_assets.mjs` 的输入） |
| `evidence/` | 案一证物原图 PNG（E01–E49） |
| `evidence2/` | 案二证物原图 PNG（C2E-01…32，共 35 张） |
| `background/` | 背景原图 PNG |
| `audio_preview/` | 音频试听 |

## 注意
- `tools/build_assets.mjs` 目前从 **`../role_images`、`../evidence`** 读原图（即 `D:\kill\` 下与 `game` 同级）。换电脑后，要么把 `design/` 下对应文件夹放到 `game` 的上一级，要么先改脚本里的路径。
- 游戏实际使用的是转换后的 `src/assets/**.webp`，已经在仓库里。
