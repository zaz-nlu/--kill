import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, it, expect } from 'vitest'
import App from '../src/App.vue'

describe('smoke', () => {
  it('renders the game title', () => {
    expect(mount(App, { global: { plugins: [createPinia()] } }).text()).toContain('九点熄灯')
  })
})
