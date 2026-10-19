import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

describe('desktop packaging config', () => {
  it('points Electron at a main file that exists', () => {
    expect(pkg.main).toBe('electron/main.cjs')
    expect(existsSync(resolve(root, pkg.main))).toBe(true)
  })

  it('has the dev and dist scripts', () => {
    // launched through a script that clears ELECTRON_RUN_AS_NODE (VS Code sets it, which turns electron.exe into plain node)
    expect(pkg.scripts['electron:dev']).toContain('scripts/run-electron.cjs')
    expect(existsSync(resolve(root, 'scripts/run-electron.cjs'))).toBe(true)
    expect(readFileSync(resolve(root, 'scripts/run-electron.cjs'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE')
    expect(pkg.scripts.dist).toContain('electron-builder')
    expect(pkg.scripts.dist).toContain('portable')
  })

  it('builds a portable Windows exe into release/, shipping only dist and electron', () => {
    expect(pkg.build.productName).toBe('九点熄灯')
    expect(pkg.build.directories.output).toBe('release')
    expect(pkg.build.files).toEqual(['dist/**', 'electron/**'])
    expect(pkg.build.win.target).toBe('portable')
    expect(pkg.build.win.signAndEditExecutable).toBe(false)
  })

  it('serves the built page with relative asset paths (needed for file://)', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
    expect(config).toContain("base: './'")
  })

  it('main.cjs keeps the renderer isolated and has no remote debugging', () => {
    const main = readFileSync(resolve(root, 'electron/main.cjs'), 'utf8')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).not.toContain('remote-debugging')
    expect(main).toContain("title: '九点熄灯'")
    expect(main).toContain('minWidth: 960')
    expect(main).toContain('minHeight: 600')
  })
})
