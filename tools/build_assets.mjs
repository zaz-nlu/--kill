// Converts ../role_images (full-size PNGs) into small WebP files under src/assets/characters,
// and writes src/data/characters.json (npc id -> expression key -> asset path).
// Run: node tools/build_assets.mjs
import { mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// All source art lives under design/ (role_images, background, evidence, evidence2, posters); nothing outside the repo is read.
const src = join(root, 'design', 'role_images')
const outDir = join(root, 'src', 'assets', 'characters')
const propsDir = join(root, 'src', 'assets', 'props')

// folder in role_images -> npc id used by the game; file stem -> expression key.
// sw is drawn in two versions; the 成熟版 matches the 40-year-old in the script.
const CHARACTERS = {
  lyc: { id: 'lyc', dir: 'lyc', files: { '平常-憨笑': 'normal', '慌张-冒汗': 'panic', '生气-皱眉': 'angry', '难过-红眼': 'sad', '坚定-对质': 'determined' } },
  sy: { id: 'songyan', dir: 'sy', files: { 冷淡: 'normal', 冷笑: 'sneer', 不耐烦: 'impatient', '回忆-柔化版': 'memory' } },
  hc: { id: 'boss', dir: 'hc', files: { 假笑画饼: 'normal', 刻薄冷笑: 'sneer', 暴怒: 'angry', 心虚: 'guilty' } },
  sw: { id: 'suwen', dir: 'sw/成熟版', suffix: '-成熟版', files: { 正常微笑: 'normal', 生气: 'angry', 紧张: 'nervous', 心虚: 'guilty' } },
  zc: { id: 'zhengcen', dir: 'zc', files: { '正常-笑脸合本': 'normal', '紧张-记录': 'nervous', '生气-撕本': 'angry', '害怕心虚-遮脸': 'guilty' } },
  // the artist's transparent cut-outs: the file names carry a "_透明" tag (and "_v2" on two of them)
  sxy: { id: 'shaoxy', dir: 'sxy', files: { '正常_透明': 'normal', '生气_透明': 'angry', '紧张_透明_v2': 'nervous', '心虚_透明': 'guilty', '红眼强笑_透明_v2': 'teary' } },
  lc: { id: 'lucheng', dir: 'lc', files: { 正常: 'normal', 生气: 'angry', 紧张: 'nervous', 心虚: 'guilty' } },
  my: { id: 'mengyao', dir: 'my', files: { 正常: 'normal', 紧张: 'nervous', 害怕: 'panic', 生气: 'angry' } },
  lh: { id: 'laohan', dir: 'lh', suffix: '', nameInfix: '老韩_', files: { 严肃: 'normal', 怀疑: 'suspicious', 惊讶: 'surprised', 缓和: 'soft' } },
  lw: { id: 'laowang', dir: 'lw', nameInfix: '老王_', files: { 憨厚: 'normal', 打哈欠: 'yawn', 惊讶: 'surprised' } },
  xx: { id: 'xiaoxu', dir: 'xx', nameInfix: '小许_', files: { 精神: 'normal', 紧张: 'nervous', 开心: 'happy' } },
  ll: { id: 'laoliu', dir: 'll', nameInfix: '老刘_', files: { 凶狠: 'angry', 慌张: 'nervous', 讨好: 'happy' }, also: { normal: '凶狠' } },
  lm: { id: 'limo', dir: 'lm', files: { '平常-不耐烦': 'normal', 生气: 'angry', 紧张: 'nervous', '心虚-克制': 'guilty' } },
}

const PROPS = { 'sy_证物-玻璃奖杯.png': 'trophy', 'sy_证物-墨绿色长柄伞.png': 'umbrella' }

if (!existsSync(src)) {
  console.error(`role_images not found at ${src}`)
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
mkdirSync(propsDir, { recursive: true })

const manifest = {}
let count = 0
for (const [prefix, c] of Object.entries(CHARACTERS)) {
  manifest[c.id] = {}
  mkdirSync(join(outDir, c.id), { recursive: true })
  const dir = join(src, c.dir)
  const present = new Set(readdirSync(dir))
  for (const [stem, key] of Object.entries(c.files)) {
    const name = `${prefix}_${c.nameInfix ?? ''}${stem}${c.suffix ?? ''}.png`
    if (!present.has(name)) throw new Error(`missing ${join(c.dir, name)}`)
    await sharp(join(dir, name))
      .resize({ width: 640 })
      .webp({ quality: 82, alphaQuality: 90 })
      .toFile(join(outDir, c.id, `${key}.webp`))
    manifest[c.id][key] = `characters/${c.id}/${key}.webp`
    count += 1
  }
  // a look that is also used as the default one (he has no neutral drawing: the fierce one is how he stands)
  for (const [key, stem] of Object.entries(c.also ?? {})) {
    await sharp(join(dir, `${prefix}_${c.nameInfix ?? ''}${stem}${c.suffix ?? ''}.png`))
      .resize({ width: 640 })
      .webp({ quality: 82, alphaQuality: 90 })
      .toFile(join(outDir, c.id, `${key}.webp`))
    manifest[c.id][key] = `characters/${c.id}/${key}.webp`
    count += 1
  }
}

for (const [name, key] of Object.entries(PROPS)) {
  await sharp(join(src, 'sy', name)).resize({ width: 640 }).webp({ quality: 85 }).toFile(join(propsDir, `${key}.webp`))
  count += 1
}

// Backgrounds: ../background/game-backgrounds/<id>.png (night) and <id>_day.png -> src/assets/backgrounds/*.webp
const bgSrc = join(root, 'design', 'background', 'game-backgrounds')
const bgOut = join(root, 'src', 'assets', 'backgrounds')
let bgCount = 0
if (existsSync(bgSrc)) {
  mkdirSync(bgOut, { recursive: true })
  for (const name of readdirSync(bgSrc).filter(n => n.endsWith('.png'))) {
    await sharp(join(bgSrc, name)).resize({ width: 1600 }).webp({ quality: 80 }).toFile(join(bgOut, name.replace(/\.png$/, '.webp')))
    bgCount += 1
  }
}

// Chapter posters: design/posters/c1.png … c4.png -> src/assets/posters/c1.webp … c4.webp
const posterSrc = join(root, 'design', 'posters')
const posterOut = join(root, 'src', 'assets', 'posters')
let posterCount = 0
if (existsSync(posterSrc)) {
  mkdirSync(posterOut, { recursive: true })
  for (const name of readdirSync(posterSrc).filter(n => /^c[1-4]\.png$/.test(n))) {
    await sharp(join(posterSrc, name)).resize({ width: 768 }).webp({ quality: 82 }).toFile(join(posterOut, name.replace(/\.png$/, '.webp')))
    posterCount += 1
  }
}

// Evidence: ../evidence/E01_<name>.png -> src/assets/evidence/E01.webp
const evSrc = join(root, 'design', 'evidence')
const evOut = join(root, 'src', 'assets', 'evidence')
let evCount = 0
if (existsSync(evSrc)) {
  rmSync(evOut, { recursive: true, force: true })
  mkdirSync(evOut, { recursive: true })
  for (const name of readdirSync(evSrc)) {
    const m = /^(E\d{2})_.*\.png$/.exec(name)
    if (!m) continue
    await sharp(join(evSrc, name)).resize({ width: 512 }).webp({ quality: 85, alphaQuality: 90 }).toFile(join(evOut, `${m[1]}.webp`))
    evCount += 1
  }
}

// Case 2 evidence: design/evidence2/<folder>/C2E-xx_<name>.png -> src/assets/evidence/2E<xx>.webp.
// The two folders overlap on the four redrawn images; the later folder wins.
const c2Dirs = [
  join(root, 'design', 'evidence2', '九点熄灯_案二证物图_35张_修订版'),
  join(root, 'design', 'evidence2', '案二新增证物_4张_1024'),
  join(root, 'design', 'evidence2', '案二现场照片'),
]
// Superseded drawings: kept in the repo, deliberately not imported.
const C2_DROPPED = new Set(['C2E-08a_前台咖啡小票.png', 'C2E-08b_点单人陆诚.png'])

// C2E-01_x -> 2E01, C2E-08a′_x -> 2E08a, C2E-03b_x -> 2E33 (the optional jacket-and-cup shot).
function c2EvidenceId(name) {
  if (C2_DROPPED.has(name)) return null
  if (name.startsWith('C2E-03b_')) return '2E33'
  const m = /^C2E-(\d{2})([a-e]?)[′'’]?_/.exec(name)
  return m ? `2E${m[1]}${m[2]}` : undefined
}

const c2Files = new Map()
const c2Unmapped = []
for (const dir of c2Dirs) {
  if (!existsSync(dir)) throw new Error(`case 2 evidence folder not found: ${dir}`)
  for (const name of readdirSync(dir).filter(n => n.endsWith('.png')).sort()) {
    const id = c2EvidenceId(name)
    if (id === null) continue
    if (id === undefined) {
      c2Unmapped.push(`${name} (${dir})`)
      continue
    }
    c2Files.set(id, join(dir, name))
  }
}
if (c2Unmapped.length) throw new Error(`unmapped case 2 evidence image(s): ${c2Unmapped.join(', ')}`)

mkdirSync(evOut, { recursive: true })
let c2Count = 0
for (const [id, file] of c2Files) {
  await sharp(file).resize({ width: 800 }).webp({ quality: 80 }).toFile(join(evOut, `${id}.webp`))
  c2Count += 1
}

// Tang only ever appears inside a video-call window: a square avatar, kept as a prop rather than a standing sprite.
const tangSrc = join(src, 'tjl', 'tjl_唐经理_视频会议头像.png')
if (existsSync(tangSrc)) {
  await sharp(tangSrc).resize({ width: 512 }).webp({ quality: 85 }).toFile(join(propsDir, 'tang_avatar.webp'))
  count += 1
}

writeFileSync(join(root, 'src', 'data', 'characters.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${count} images and characters.json for ${Object.keys(manifest).length} characters, ${bgCount} backgrounds, ${posterCount} posters, ${evCount} evidence images, ${c2Count} case 2 evidence images`)
