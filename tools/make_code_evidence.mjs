// Renders the case 2 code exhibits (Java original, diff, writing samples, build record) as screenshots.
// Output: design/evidence2/案二代码证物/C2E-3x_*.png  (build_assets.mjs turns them into webp).
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const codeDir = join(root, 'design', '新剧本', '02g_案二v5_后端技术稿', 'code')
const outDir = join(root, 'design', 'evidence2', '案二代码证物')
mkdirSync(outDir, { recursive: true })

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const FONT = "Consolas, 'Microsoft YaHei', 'SimHei', monospace"
const LH = 22
const C = { bg: '#1e1f24', bar: '#2b2d33', fg: '#d4d4d4', dim: '#7d8590', add: '#2ea04355', del: '#f8514955', addFg: '#7ee787', delFg: '#ff7b72', title: '#9cdcfe' }

// lines: [{ t: text, kind?: 'add'|'del'|'dim'|'hl', n?: line number }]
function panel(lines, x, y, w, titleText, opts = {}) {
  const pad = 10
  const top = 34
  const h = top + lines.length * LH + pad
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.bg}" stroke="#3a3d45"/>`
  s += `<rect x="${x}" y="${y}" width="${w}" height="26" rx="6" fill="${C.bar}"/>`
  s += `<text x="${x + 12}" y="${y + 18}" font-family="${FONT}" font-size="14" fill="${C.title}">${esc(titleText)}</text>`
  lines.forEach((l, i) => {
    const ly = y + top + i * LH
    if (l.kind === 'add' || l.kind === 'del') s += `<rect x="${x + 1}" y="${ly - 16}" width="${w - 2}" height="${LH}" fill="${C[l.kind]}"/>`
    if (l.kind === 'hl') s += `<rect x="${x + 1}" y="${ly - 16}" width="${w - 2}" height="${LH}" fill="#d2992244"/>`
    const fill = l.kind === 'add' ? C.addFg : l.kind === 'del' ? C.delFg : l.kind === 'dim' ? C.dim : C.fg
    if (!opts.noNum) {
      const num = l.n !== undefined ? String(l.n).padStart(3, ' ') : '   '
      s += `<text x="${x + 8}" y="${ly}" font-family="${FONT}" font-size="13" fill="${C.dim}" xml:space="preserve">${num}</text>`
    }
    s += `<text x="${x + (opts.noNum ? 12 : 44)}" y="${ly}" font-family="${FONT}" font-size="14" fill="${fill}" xml:space="preserve">${esc(l.t)}</text>`
  })
  return { svg: s, h }
}

async function render(name, width, parts) {
  let y = 14
  let body = ''
  for (const p of parts) {
    const r = panel(p.lines, 14, y, width - 28, p.title, p.opts)
    body += r.svg
    y += r.h + 12
  }
  const height = y + 4
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#14151a"/>${body}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, name))
  console.log('wrote', name, width, height)
}

const readLines = f => readFileSync(join(codeDir, f), 'utf8').replace(/\r/g, '').split('\n')
const numbered = (arr, from = 1) => arr.map((t, i) => ({ t, n: from + i }))

// ---- C2E-37: the original, as committed on 2026-10-21 ----
const orig = readLines('original/com/beta/sched/WindowScheduler.java')
await render('C2E-37_调度模块原版代码.png', 1040, [
  { title: 'git show HEAD:src/main/java/com/beta/sched/WindowScheduler.java   (last commit 2026-10-21)', lines: numbered(orig.slice(0, 74)) },
])

// ---- C2E-38: decompiled class on PC-OS-03 vs HEAD ----
function diffOf(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { ops.push(['=', a[i]]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', a[i]]); i++ } else { ops.push(['+', b[j]]); j++ }
  }
  while (i < m) { ops.push(['-', a[i]]); i++ }
  while (j < n) { ops.push(['+', b[j]]); j++ }
  return ops
}
const diffLines = []
for (const f of ['WindowScheduler.java', 'DispatchGuard.java']) {
  const ops = diffOf(readLines('original/com/beta/sched/' + f), readLines('patched/com/beta/sched/' + f))
  const show = new Set()
  ops.forEach((o, k) => { if (o[0] !== '=') for (let d = -2; d <= 2; d++) if (ops[k + d]) show.add(k + d) })
  diffLines.push({ t: `--- ${f}   (HEAD)`, kind: 'dim' }, { t: `+++ ${f}   (jad of sched-core-1.4.2.jar on PC-OS-03)`, kind: 'dim' })
  let prev = -2
  for (const k of [...show].sort((x, y) => x - y)) {
    if (k !== prev + 1) diffLines.push({ t: '@@ ...', kind: 'dim' })
    const o = ops[k]
    diffLines.push({ t: (o[0] === '=' ? '  ' : o[0] + ' ') + o[1], kind: o[0] === '+' ? 'add' : o[0] === '-' ? 'del' : undefined })
    prev = k
  }
  diffLines.push({ t: '', kind: 'dim' })
}
await render('C2E-38_线上反编译与仓库差异.png', 1040, [{ title: 'jad sched-core-1.4.2.jar  vs  git HEAD     (2 files changed)', lines: diffLines, opts: { noNum: true } }])

// ---- C2E-39: four writing samples, authors hidden ----
const clip = arr => arr.map(l => (l.length > 52 ? l.slice(0, 51) + '…' : l))
const sampleA = orig.slice(30, 54)
const sampleB = readLines('samples/com/beta/iface/FireGatewayClient.java').slice(10, 34)
const sampleC = readLines('samples/com/beta/model/ModelEvaluator.java').slice(0, 24)
const sampleD = readLines('samples/com/beta/core/CoreService.java').slice(0, 24)
const W = 1040
const colW = (W - 14 * 3) / 2
const panels = [['样本 A', sampleA], ['样本 B', sampleB], ['样本 C', sampleC], ['样本 D', sampleD]].map(([title, arr]) => ({ title, lines: numbered(clip(arr)) }))
let gy = 14
let gbody = ''
for (let r = 0; r < 2; r++) {
  let rowH = 0
  for (let c = 0; c < 2; c++) {
    const p = panels[r * 2 + c]
    const res = panel(p.lines, 14 + c * (colW + 14), gy, colW, p.title, {})
    gbody += res.svg
    rowH = Math.max(rowH, res.h)
  }
  gy += rowH + 12
}
const gsvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${gy}" viewBox="0 0 ${W} ${gy}"><rect width="100%" height="100%" fill="#14151a"/>${gbody}</svg>`
await sharp(Buffer.from(gsvg)).png().toFile(join(outDir, 'C2E-39_四份写法样本.png'))
console.log('wrote samples', W, gy)

// ---- C2E-40: build and release record ----
const rec = [
  { t: '$ unzip -p sched-core-1.4.2.jar META-INF/MANIFEST.MF', kind: 'dim' },
  { t: 'Manifest-Version: 1.0' }, { t: 'Archiver-Version: Plexus Archiver' }, { t: 'Created-By: Apache Maven 3.6.3' },
  { t: 'Built-By: admin', kind: 'hl' }, { t: 'Build-Jdk: 1.8.0_202' }, { t: '' },
  { t: '$ ls -l --full-time /opt/sched/deploy /opt/sched/ci', kind: 'dim' },
  { t: '-rw-r--r-- 1 wb_ext sched-deploy 184320 2026-11-17 23:48:12.418 +08:00 deploy/sched-core-1.4.2.jar', kind: 'hl' },
  { t: '-rw-r--r-- 1 ci     ci           183904 2026-10-21 18:12:40.006 +08:00 ci/sched-core-1.4.2.jar' }, { t: '' },
  { t: '$ sha256sum deploy/sched-core-1.4.2.jar ci/sched-core-1.4.2.jar', kind: 'dim' },
  { t: '3f9c1d...a07e  deploy/sched-core-1.4.2.jar', kind: 'del' },
  { t: '8b42e6...51c9  ci/sched-core-1.4.2.jar', kind: 'add' }, { t: '' },
  { t: '$ grep wb_ext /var/log/auth.log', kind: 'dim' },
  { t: 'Nov 17 23:47:55 PC-OS-03 sshd[2291]: Accepted password for wb_ext from 10.20.3.1 port 51044' }, { t: '' },
  { t: '$ journalctl -u sched-svc --since "2026-11-17 23:48"', kind: 'dim' },
  { t: 'Nov 17 23:48:30 PC-OS-03 systemd[1]: Stopping sched-svc ...' },
  { t: 'Nov 17 23:48:30 PC-OS-03 systemd[1]: Started sched-svc.' }, { t: '' },
  { t: '$ git log -1 --format="%h %ad %s" -- src/main/java/com/beta/sched/WindowScheduler.java', kind: 'dim' },
  { t: 'c41a9e2 Wed Oct 21 18:09:02 2026 +0800 window scheduler: boundary alignment, exactly-once' },
  { t: '$ git status --short', kind: 'dim' }, { t: '(clean)' },
]
await render('C2E-40_构建与发布记录.png', 1040, [{ title: 'PC-OS-03  /opt/sched   build and release record', lines: rec, opts: { noNum: true } }])
