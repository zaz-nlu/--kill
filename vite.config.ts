import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: true, // listen on every network interface, so other devices on the LAN can open the dev server
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
