import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import manifest from '../src/data/characters.json'
import backgrounds from '../src/data/backgrounds.json'
import { hasArt, resolveSprite } from '../src/engine/characters'
import { resolveBackground } from '../src/engine/backgrounds'

const assets = resolve(__dirname, '../src/assets')

describe('character art manifest', () => {
  it('covers the twelve characters that have art, each with a normal face', () => {
    expect(Object.keys(manifest).sort()).toEqual(['boss', 'laohan', 'laowang', 'limo', 'lucheng', 'lyc', 'mengyao', 'shaoxy', 'songyan', 'suwen', 'xiaoxu', 'zhengcen'])
    for (const faces of Object.values(manifest)) expect(Object.keys(faces)).toContain('normal')
  })

  it('every file in the manifest exists on disk', () => {
    for (const faces of Object.values(manifest)) {
      for (const path of Object.values(faces)) expect(existsSync(resolve(assets, path)), path).toBe(true)
    }
  })

  it('ships the props and the video-call avatar', () => {
    expect(existsSync(resolve(assets, 'props/trophy.webp'))).toBe(true)
    expect(existsSync(resolve(assets, 'props/umbrella.webp'))).toBe(true)
    expect(existsSync(resolve(assets, 'props/tang_avatar.webp'))).toBe(true)
  })
})

describe('resolveSprite', () => {
  it('returns the requested expression', () => {
    expect(resolveSprite('limo', 'guilty')).toMatchObject({ expr: 'guilty' })
    expect(resolveSprite('limo', 'guilty')?.src).toContain('guilty')
  })

  it('defaults to normal', () => {
    expect(resolveSprite('limo')).toMatchObject({ expr: 'normal' })
  })

  it('falls back through aliases, then to normal', () => {
    expect(resolveSprite('limo', 'panic')).toMatchObject({ expr: 'nervous' })     // limo has no panic, nervous is the closest
    expect(resolveSprite('lyc', 'nervous')).toMatchObject({ expr: 'panic' })      // lyc has panic but no nervous
    expect(resolveSprite('limo', 'dancing')).toMatchObject({ expr: 'normal' })
    expect(resolveSprite('limo', 'determined')).toMatchObject({ expr: 'normal' })
  })

  it('returns null for characters without art', () => {
    expect(resolveSprite('tang', 'normal')).toBeNull()   // Tang is a video-window avatar, not a standing sprite
    expect(hasArt('tang')).toBe(false)
    expect(hasArt('xiaoxu')).toBe(true)
    expect(hasArt('laowang')).toBe(true)
    expect(hasArt('mengyao')).toBe(true)
    expect(hasArt('laohan')).toBe(true)
    expect(hasArt('limo')).toBe(true)
  })
})

describe('backgrounds', () => {
  it('has an image for every declared background', () => {
    expect(backgrounds.length).toBeGreaterThanOrEqual(10)
    for (const b of backgrounds) expect(resolveBackground(b.id), b.id).not.toBeNull()
  })

  it('knows nothing about undeclared ids', () => {
    expect(resolveBackground('nowhere')).toBeNull()
  })

  it('has distinct night and day artwork for every declared background', () => {
    for (const b of backgrounds) {
      const night = resolveBackground(b.id, 'night')
      const day = resolveBackground(b.id, 'day')
      expect(night, `${b.id} night`).not.toBeNull()
      expect(day, `${b.id} day`).not.toBeNull()
      expect(day, `${b.id} day differs`).not.toBe(night)
    }
  })

  it('defaults to the night version', () => {
    expect(resolveBackground('office')).toBe(resolveBackground('office', 'night'))
  })
})
