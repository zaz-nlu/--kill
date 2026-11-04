import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: true, // listen on every network interface, so other devices on the LAN can open the dev server
    proxy: { '/api': 'http://127.0.0.1:8086' }, // the account server (server/app.py)
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
