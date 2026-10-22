<script setup lang="ts">
import { ref } from 'vue'
import { audio } from '../audio/engine'

const muted = ref(audio.muted)
const volume = ref(Math.round(audio.volume * 100))
const open = ref(false)

function toggleMute() {
  muted.value = !muted.value
  audio.setMuted(muted.value)
}

function onVolume() {
  audio.setVolume(volume.value / 100)
  if (muted.value && volume.value > 0) toggleMute()
}
</script>

<template>
  <div class="audio" @mouseenter="open = true" @mouseleave="open = false">
    <input
      v-show="open"
      v-model.number="volume"
      type="range"
      min="0"
      max="100"
      aria-label="音量"
      data-testid="volume"
      @input="onVolume"
    >
    <button type="button" data-testid="mute" :title="muted ? '开启声音' : '静音'" @click="toggleMute">{{ muted ? '静音' : '声音' }}</button>
  </div>
</template>

<style scoped>
.audio { display: flex; align-items: center; gap: 8px; }
input { width: 90px; accent-color: #c8501e; }
</style>
