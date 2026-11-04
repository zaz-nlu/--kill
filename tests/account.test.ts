import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AccountPanel from '../src/ui/AccountPanel.vue'
import TitleScreen from '../src/ui/TitleScreen.vue'
import { currentUser, login, logout, register } from '../src/engine/account'
import { startCloudSync, syncError, syncNow } from '../src/engine/cloud'
import { clearSlot, parseSlotKey, slotInfo, slotKey, writeSlot } from '../src/engine/saves'
import { createInitialState } from '../src/engine/state'
import { loadProfile, markCleared, markRecapSeen, mergeProfiles, parseProfile, type Profile } from '../src/engine/profile'

interface Remote { chapter: string; slot: string; data: string; at: number }

// An in-memory stand-in for server/app.py: one account ("Alice"), its saves, and a log of the calls it received.
function fakeServer() {
  const saves = new Map<string, Remote>()
  let profile: Profile = parseProfile(null)
  const calls: string[] = []
  let down = false
  const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))
  const fetchFake = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (down) throw new TypeError('offline')
    const method = init.method ?? 'GET'
    const route = url.replace(/^\/api/, '')
    calls.push(`${method} ${route}`)
    const body = init.body ? JSON.parse(init.body as string) : {}
    if (route === '/login' || route === '/register') {
      if (body.password === 'wrong') return reply(401, { error: '用户名或密码错误' })
      return reply(200, { username: 'Alice', token: 'tok' })
    }
    if (route === '/logout') return reply(200, { ok: true })
    if (route === '/saves') return reply(200, { saves: [...saves.values()] })
    if (route === '/profile') {
      profile = mergeProfiles(profile, parseProfile(body.profile)) // the server merges what it is sent into what it has
      return reply(200, { profile })
    }
    const m = /^\/saves\/(\w+)\/(\w+)$/.exec(route)
    if (m && method === 'PUT') saves.set(`${m[1]}:${m[2]}`, { chapter: m[1], slot: m[2], data: body.data, at: body.at })
    if (m && method === 'DELETE') saves.delete(`${m[1]}:${m[2]}`)
    return reply(200, { ok: true })
  })
  vi.stubGlobal('fetch', fetchFake)
  return {
    saves, calls, setDown: (v: boolean) => { down = v },
    get profile() { return profile }, set profile(p: Profile) { profile = p },
  }
}

const stateAt = (day: number) => ({ ...createInitialState(), day })

describe('account-scoped save keys', () => {
  it('round-trips through parseSlotKey, for guests and accounts', () => {
    expect(slotKey(3, 'c1', '')).toBe('jiudian-save:c1:3')
    expect(slotKey('auto', 'c2', '@Alice')).toBe('jiudian-auto:c2@Alice')
    expect(parseSlotKey('jiudian-save:c1:3')).toEqual({ slot: 3, chapter: 'c1', user: '' })
    expect(parseSlotKey('jiudian-save:c1:3@小明')).toEqual({ slot: 3, chapter: 'c1', user: '小明' })
    expect(parseSlotKey('jiudian-auto:c2@Alice')).toEqual({ slot: 'auto', chapter: 'c2', user: 'Alice' })
    expect(parseSlotKey('jiudian-timeline:c1')).toBeNull()
    expect(parseSlotKey('jiudian-audio')).toBeNull()
  })
})

describe('signing in', () => {
  beforeEach(async () => {
    fakeServer()
    await logout()
    localStorage.clear()
    startCloudSync()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a guest\'s saves and an account\'s saves apart on the same browser', async () => {
    writeSlot(1, stateAt(2), undefined, 100)
    await login('alice', 'abcd')
    expect(currentUser.value).toBe('Alice') // the server\'s spelling of the name
    expect(slotInfo(1, 'c1')).toBeNull()
    writeSlot(1, stateAt(5), undefined, 200)
    expect(slotInfo(1, 'c1')?.day).toBe(5)
    await logout()
    expect(currentUser.value).toBe('')
    expect(slotInfo(1, 'c1')?.day).toBe(2)
  })

  it('remembers the login across a reload', async () => {
    await login('alice', 'abcd')
    expect(localStorage.getItem('jiudian-user')).toBe('Alice')
    expect(localStorage.getItem('jiudian-token')).toBe('tok')
    await logout()
    expect(localStorage.getItem('jiudian-user')).toBeNull()
    expect(localStorage.getItem('jiudian-token')).toBeNull()
  })

  it('rejects a wrong password with the server\'s message and stays signed out', async () => {
    await expect(login('alice', 'wrong')).rejects.toThrow('用户名或密码错误')
    expect(currentUser.value).toBe('')
  })

  it('says so when the server cannot be reached', async () => {
    const s = fakeServer()
    s.setDown(true)
    await expect(register('alice', 'abcd')).rejects.toThrow('连不上服务器')
  })
})

describe('cloud sync', () => {
  let server: ReturnType<typeof fakeServer>
  beforeEach(async () => {
    server = fakeServer()
    await logout()
    localStorage.clear()
    startCloudSync()
    await login('alice', 'abcd')
    server.calls.length = 0
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uploads each save and delete made while signed in, and nothing as a guest', async () => {
    writeSlot(2, stateAt(3), undefined, 300)
    clearSlot(2, 'c1')
    await flushPromises()
    expect(server.calls).toEqual(['PUT /saves/c1/2', 'DELETE /saves/c1/2'])
    await logout()
    server.calls.length = 0
    writeSlot(1, stateAt(1), undefined, 400)
    await flushPromises()
    expect(server.calls).toEqual([])
  })

  it('pulls saves that only exist on the server', async () => {
    const raw = JSON.stringify({ version: 2, state: stateAt(4), meta: { chapter: 'c1', day: 4, hour: 9, evidence: 0, testimony: 0, at: 500 } })
    server.saves.set('c1:auto', { chapter: 'c1', slot: 'auto', data: raw, at: 500 })
    server.saves.set('c1:7', { chapter: 'c1', slot: '7', data: raw, at: 500 })
    expect(await syncNow()).toBe(true)
    expect(slotInfo('auto', 'c1')?.day).toBe(4)
    expect(slotInfo(7, 'c1')?.day).toBe(4)
  })

  it('keeps the newer copy of a slot, whichever side has it', async () => {
    writeSlot(1, stateAt(2), undefined, 100)
    writeSlot(2, stateAt(2), undefined, 100)
    await flushPromises()
    const newer = (day: number, at: number) =>
      JSON.stringify({ version: 2, state: stateAt(day), meta: { at } })
    server.saves.set('c1:1', { chapter: 'c1', slot: '1', data: newer(9, 900), at: 900 }) // server is newer
    server.saves.set('c1:2', { chapter: 'c1', slot: '2', data: newer(1, 50), at: 50 })    // local is newer
    await syncNow()
    expect(slotInfo(1, 'c1')?.day).toBe(9)
    expect(slotInfo(2, 'c1')?.day).toBe(2)
    expect(server.saves.get('c1:2')?.at).toBe(100)
  })

  it('uploads saves that were made while the server was unreachable', async () => {
    server.setDown(true)
    writeSlot(3, stateAt(6), undefined, 600)
    await flushPromises()
    expect(syncError.value).toBe('连不上服务器')
    server.setDown(false)
    await syncNow()
    expect(server.saves.get('c1:3')?.at).toBe(600)
    expect(syncError.value).toBe('')
  })
})

describe('chapter progress', () => {
  let server: ReturnType<typeof fakeServer>
  beforeEach(async () => {
    server = fakeServer()
    await logout()
    localStorage.clear()
    startCloudSync()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('merges two records into everything either one knew', () => {
    const a = parseProfile({ cleared: { c1: { ending: 'bad2', at: 10 } }, seenRecap: { c2: true } })
    const b = parseProfile({ cleared: { c1: { ending: 'true', at: 20 }, c2: { ending: 'true', at: 5 } }, seenChapterNote: true })
    const m = mergeProfiles(a, b)
    expect(m.cleared.c1.ending).toBe('true') // the later clear of a chapter both have
    expect(m.cleared.c2.ending).toBe('true')
    expect(m.seenRecap).toEqual({ c2: true })
    expect(m.seenChapterNote).toBe(true)
  })

  it('is kept per account: a guest clearing a chapter unlocks nothing for someone who signs in', async () => {
    markCleared('c1', 'true', 1)
    await login('alice', 'abcd')
    expect(loadProfile().cleared).toEqual({})
    markRecapSeen('c2')
    await logout()
    expect(loadProfile().cleared.c1?.ending).toBe('true')
    expect(loadProfile().seenRecap).toEqual({})
  })

  it('goes up when it changes while signed in, and not as a guest', async () => {
    await login('alice', 'abcd')
    server.calls.length = 0
    markCleared('c1', 'true', 7)
    await flushPromises()
    expect(server.calls).toEqual(['PUT /profile'])
    expect(server.profile.cleared.c1).toEqual({ ending: 'true', at: 7 })
    await logout()
    server.calls.length = 0
    markCleared('c1', 'true', 8)
    await flushPromises()
    expect(server.calls).toEqual([])
  })

  it('comes down on a new device, so the next chapter is open there too', async () => {
    server.profile = parseProfile({ cleared: { c1: { ending: 'true', at: 3 } }, seenRecap: { c2: true } })
    await login('alice', 'abcd')
    expect(loadProfile().cleared).toEqual({})
    expect(await syncNow()).toBe(true)
    expect(loadProfile().cleared.c1).toEqual({ ending: 'true', at: 3 })
    expect(loadProfile().seenRecap.c2).toBe(true)
  })

  it('sends what this device earned before the first sync, without losing what the server had', async () => {
    server.profile = parseProfile({ cleared: { c1: { ending: 'true', at: 3 } } })
    await login('alice', 'abcd')
    markRecapSeen('c3')
    await flushPromises()
    expect(server.profile.seenRecap).toEqual({ c3: true })
    expect(server.profile.cleared.c1).toBeDefined()
    expect(loadProfile().cleared.c1).toBeDefined() // the merged record came back with the answer
  })
})

describe('AccountPanel and the title button', () => {
  beforeEach(async () => {
    fakeServer()
    await logout()
    localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('registers from the form, then shows the account and lets them sign out', async () => {
    const w = mount(AccountPanel)
    await w.find('[data-testid="account-switch"]').trigger('click')
    await w.find('[data-testid="account-username"]').setValue('alice')
    await w.find('[data-testid="account-password"]').setValue('abcd')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.find('[data-testid="account-name"]').text()).toBe('Alice')
    await w.find('[data-testid="account-logout"]').trigger('click')
    await flushPromises()
    expect(w.emitted('changed')).toHaveLength(2)
    expect(w.find('[data-testid="account-username"]').exists()).toBe(true)
  })

  it('shows the server\'s error and keeps the form', async () => {
    const w = mount(AccountPanel)
    await w.find('[data-testid="account-username"]').setValue('alice')
    await w.find('[data-testid="account-password"]').setValue('wrong')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-testid="account-error"]').text()).toBe('用户名或密码错误')
    expect(w.emitted('changed')).toBeUndefined()
  })

  it('title screen: hidden without an account prop, and labelled by who is signed in', async () => {
    expect(mount(TitleScreen).find('[data-testid="account"]').exists()).toBe(false)
    const w = mount(TitleScreen, { props: { account: '' } })
    expect(w.find('[data-testid="account"]').text()).toBe('登录 / 注册')
    await w.setProps({ account: 'Alice' })
    expect(w.find('[data-testid="account"]').text()).toBe('账号：Alice')
    await w.find('[data-testid="account"]').trigger('click')
    expect(w.emitted('account')).toHaveLength(1)
  })
})
