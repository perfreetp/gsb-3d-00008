<script setup lang="ts">
import { ref } from 'vue'
import StationScene from './components/StationScene.vue'
import ControlPanel from './components/ControlPanel.vue'
import StatsPanel from './components/StatsPanel.vue'

const simRef = ref<InstanceType<typeof StationScene> | null>(null)
const selected = ref<{ type: 'gate' | 'passage'; id: number | string; closed: boolean } | null>(null)

function onSelect(payload: { type: 'gate' | 'passage'; id: number | string; closed: boolean } | null) {
  selected.value = payload
}
</script>

<template>
  <div class="app-root">
    <StationScene ref="simRef" @select="onSelect" />
    <ControlPanel :scene="simRef" :selected="selected" />
    <StatsPanel :scene="simRef" />
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
