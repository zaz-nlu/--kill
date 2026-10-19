# 九点熄灯（垂直切片）

剧本在 `../剧本_九点熄灯.md`，实施计划在 `../docs/superpowers/plans/2026-10-19-vertical-slice.md`。

## 常用命令（在本目录下运行）

| 命令 | 作用 |
|---|---|
| `npm run dev` | 浏览器里开发预览 |
| `npm test` | 跑全部测试（vitest） |
| `npm run build` | 类型检查 + 构建网页到 `dist/` |
| `py -3 tools/validate_data.py src/data` | 校验数据文件的引用关系 |
| `py -3 -m unittest discover -s tools -p "test_*.py"` | 跑校验脚本自己的测试 |
| `npm run electron:dev` | 构建后用桌面窗口打开 |
| `npm run dist` | 打包成免安装 exe，输出在 `release/` |

> 这台电脑上 `python` 是 2.7，必须用 `py -3`。

## 打包注意

这台电脑的 npm 全局配置里有一个已经失效的 Electron 镜像（`npm.taobao.org`），直接打包会 TLS 报错。已在 `package.json` 里用 `build.electronDist` 指向本地已下载的 Electron，绕开了这次下载；但打包 portable 还要下载 nsis 等组件，需要在当前终端先设置：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist
```

如果 `node_modules/electron/dist` 不存在（重新装过依赖），先设置 `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"`，再运行 `node node_modules/electron/install.js`。

VS Code 的终端里 `ELECTRON_RUN_AS_NODE=1` 会让 electron 当成普通 node，窗口打不开。`npm run electron:dev` 已经通过 `scripts/run-electron.cjs` 清掉了这个变量。

## 目录

- `src/engine/`：游戏规则，全是不依赖 Vue 的纯函数，状态是一个可序列化的 `GameState`
- `src/data/`：证物、证言、场景、对质（JSON）
- `src/ui/`：Vue 组件
- `tools/`：Python 数据校验
- `electron/`：桌面外壳
