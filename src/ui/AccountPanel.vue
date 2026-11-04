<script setup lang="ts">
import { ref } from 'vue'
import { currentUser, login, logout, register } from '../engine/account'
import { syncError, syncNow } from '../engine/cloud'

// `changed` fires whenever the signed-in account changes or its saves were just merged in, so the menus reread them.
const emit = defineEmits<{ changed: []; close: [] }>()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const note = ref('')

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  note.value = ''
  try {
    await (mode.value === 'login' ? login : register)(username.value, password.value)
    password.value = ''
    await syncNow()
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '出错了'
  } finally {
    busy.value = false
  }
}

async function syncAgain() {
  busy.value = true
  note.value = ''
  if (await syncNow()) note.value = '已同步'
  emit('changed')
  busy.value = false
}

async function signOut() {
  busy.value = true
  await logout()
  busy.value = false
  emit('changed')
}
</script>

<template>
  <div class="veil" data-testid="account-panel" @click.self="emit('close')">
    <section class="glass box">
      <header>
        <h3>{{ currentUser ? '账号' : mode === 'login' ? '登录' : '注册' }}</h3>
        <button type="button" data-testid="account-close" @click="emit('close')">关闭</button>
      </header>

      <template v-if="currentUser">
        <p class="who">当前账号：<b data-testid="account-name">{{ currentUser }}</b></p>
        <p class="tip">存档会自动同步到云端。换设备或换浏览器，用这个账号登录后，在“继续游戏”或存档界面里读取即可。</p>
        <p v-if="syncError" class="error" data-testid="account-sync-error">{{ syncError }}</p>
        <p v-else-if="note" class="ok">{{ note }}</p>
        <div class="row">
          <button type="button" :disabled="busy" data-testid="account-sync" @click="syncAgain">立即同步</button>
          <button type="button" :disabled="busy" data-testid="account-logout" @click="signOut">退出登录</button>
        </div>
      </template>

      <form v-else @submit.prevent="submit">
        <label>用户名
          <input v-model="username" type="text" autocomplete="username" maxlength="20" required data-testid="account-username">
        </label>
        <label>密码
          <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" maxlength="64" required data-testid="account-password">
        </label>
        <p class="tip">{{ mode === 'register' ? '用户名 2–20 位（中文、字母、数字、下划线），密码至少 4 位。' : '没有账号？点下面的“注册”，只要用户名和密码。' }}</p>
        <p v-if="error" class="error" data-testid="account-error">{{ error }}</p>
        <div class="row">
          <button type="submit" class="go" :disabled="busy" data-testid="account-submit">{{ mode === 'login' ? '登录' : '注册并登录' }}</button>
          <button type="button" :disabled="busy" data-testid="account-switch" @click="mode = mode === 'login' ? 'register' : 'login'; error = ''">
            {{ mode === 'login' ? '注册' : '已有账号，去登录' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: #0008; }
.box { width: min(400px, 92vw); padding: 16px 18px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h3 { margin: 0; letter-spacing: 3px; }
form { display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #e8c8a8; }
input { padding: 8px 10px; font: inherit; color: #f1ece4; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--glass-line); border-radius: 8px; }
input:focus { outline: none; border-color: var(--accent); }
.who { margin: 0 0 8px; }
.tip { margin: 0; font-size: 13px; line-height: 1.6; color: #b9ad9d; }
.error { margin: 0; font-size: 13px; color: #f0a39f; }
.ok { margin: 0; font-size: 13px; color: #8fcf8f; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.go { border-color: var(--accent); background: rgba(232, 160, 112, 0.2); }
</style>
