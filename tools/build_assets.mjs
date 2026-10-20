// Converts ../role_images (full-size PNGs) into small WebP files under src/assets/characters,
// and writes src/data/characters.json (npc id -> expression key -> asset path).
// Run: node tools/build_assets.mjs
import { mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, '..', 'role_images')
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
  sxy: { id: 'shaoxy', dir: 'sxy', files: { 正常: 'normal', 生气: 'angry', 紧张: 'nervous', 心虚: 'guilty' } },
  lc: { id: 'lucheng', dir: 'lc', files: { 正常: 'normal', 生气: 'angry', 紧张: 'nervous', 心虚: 'guilty' } },
  my: { id: 'mengyao', dir: 'my', files: { 正常: 'normal', 紧张: 'nervous', 害怕: 'panic', 生气: 'angry' } },
  lh: { id: 'laohan', dir: 'lh', suffix: '', nameInfix: '老韩_', files: { 严肃: 'normal', 怀疑: 'suspicious', 惊讶: 'surprised', 缓和: 'soft' } },
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
}

for (const [name, key] of Object.entries(PROPS)) {
  await sharp(join(src, 'sy', name)).resize({ width: 640 }).webp({ quality: 85 }).toFile(join(propsDir, `${key}.webp`))
  count += 1
}

// Backgrounds: ../background/game-backgrounds/<id>.png (night) and <id>_day.png -> src/assets/backgrounds/*.webp
const bgSrc = resolve(root, '..', 'background', 'game-backgrounds')
const bgOut = join(root, 'src', 'assets', 'backgrounds')
let bgCount = 0
if (existsSync(bgSrc)) {
  mkdirSync(bgOut, { recursive: true })
  for (const name of readdirSync(bgSrc).filter(n => n.endsWith('.png'))) {
    await sharp(join(bgSrc, name)).resize({ width: 1600 }).webp({ quality: 80 }).toFile(join(bgOut, name.replace(/\.png$/, '.webp')))
    bgCount += 1
  }
}

// Evidence: ../evidence/E01_<name>.png -> src/assets/evidence/E01.webp
const evSrc = resolve(root, '..', 'evidence')
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

writeFileSync(join(root, 'src', 'data', 'characters.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${count} images and characters.json for ${Object.keys(manifest).length} characters, ${bgCount} backgrounds, ${evCount} evidence images`)
