import { ref } from 'vue'

// Who is signed in, and the small fetch wrapper for the account server. Each account's saves live under their own
// local keys (`…@name`), so signing in or out on a shared browser never mixes two people's saves.
const TOKEN_KEY = 'jiudian-token'
const USER_KEY = 'jiudian-user'
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

// The packaged desktop build opens from file:// and has no server to talk to.
export const accountAvailable = typeof location !== 'undefined' && /^https?:$/.test(location.protocol)

function stored(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export const currentUser = ref(stored(USER_KEY))
let token = stored(TOKEN_KEY)

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// '' for a guest, '@name' for an account: appended to every local save key.
export function scopeSuffix(): string {
  return currentUser.value ? `@${currentUser.value}` : ''
}

function setSession(user: string, tok: string): void {
  currentUser.value = user
  token = tok
  try {
    if (user) {
      localStorage.setItem(USER_KEY, user)
      localStorage.setItem(TOKEN_KEY, tok)
    } else {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch { /* storage blocked: signed in for this visit only */ }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('连不上服务器', 0)
  }
  const json = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) {
    if (res.status === 401 && token) setSession('', '') // the token ran out or was revoked
    throw new ApiError(json.error ?? `请求失败（${res.status}）`, res.status)
  }
  return json as T
}

async function enter(path: '/login' | '/register', username: string, password: string): Promise<void> {
  const r = await api<{ username: string; token: string }>('POST', path, { username, password })
  setSession(r.username, r.token)
}

export const login = (username: string, password: string) => enter('/login', username, password)
export const register = (username: string, password: string) => enter('/register', username, password)

export async function logout(): Promise<void> {
  try {
    await api('POST', '/logout')
  } catch { /* the server forgets the token on its own when it expires */ }
  setSession('', '')
}
