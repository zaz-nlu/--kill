<script setup lang="ts">
defineProps<{ ids: string[]; names: Record<string, string>; quotes: { id: string; text: string }[] }>()
defineEmits<{ pick: [id: string] }>()
</script>

<template>
  <div class="record">
    <section>
      <h3>证物与证言</h3>
      <p v-if="ids.length === 0">还没有可以出示的东西</p>
      <button v-for="id in ids" :key="id" type="button" :data-testid="'record-' + id" @click="$emit('pick', id)">
        {{ names[id] ?? id }}
      </button>
    </section>
    <section>
      <h3>日志里的话</h3>
      <p v-if="quotes.length === 0">还没有记录</p>
      <ul>
        <li v-for="q in quotes" :key="q.id">
          <button type="button" :data-testid="'quote-' + q.id" @click="$emit('pick', q.id)">{{ q.text }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.record { margin: 10px 0; padding: 10px; background: #1a1a1e; border: 1px solid #666; border-radius: 6px; max-height: 40vh; overflow-y: auto; }
section + section { margin-top: 10px; }
h3 { margin: 0 0 6px; font-size: 14px; color: #aaa; }
p { margin: 0; color: #999; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 3px 0; }
button { padding: 6px 12px; background: #2a2a2a; color: #eee; border: 1px solid #777; border-radius: 4px; cursor: pointer; text-align: left; }
button:hover { border-color: #c8501e; }
</style>
