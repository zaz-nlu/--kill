import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import App from '../src/App.vue'

describe('smoke', () => {
  it('renders the game title', () => {
    expect(mount(App).text()).toContain('九点熄灯')
  })
})
