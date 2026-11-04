import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'

// What is deployed, so a tester can tell which build they are looking at.
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const build = {
  commit: git('rev-parse --short HEAD') || 'unknown',
  subject: git('log -1 --format=%s'),
  time: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
}

export default defineConfig({
  base: './',
  plugins: [vue()],
  define: { __BUILD__: JSON.stringify(build) },
  server: {
    host: true, // listen on every network interface, so other devices on the LAN can open the dev server
    proxy: { '/api': 'http://127.0.0.1:8086' }, // the account server (server/app.py)
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
