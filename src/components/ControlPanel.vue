<script setup lang="ts">
import { computed } from 'vue'
import type { LAYOUT } from '../sim/layout'
import { LAYOUT as L } from '../sim/layout'

type SceneInstance = InstanceType<typeof import('./StationScene.vue').default> | null

const props = defineProps<{
  scene: SceneInstance | null
  selected: { type: 'gate' | 'passage'; id: number | string; closed: boolean } | null
}>()

const ui = computed(() => props.scene?.ui)
const closed = computed(() => props.scene?.ui?.closed ?? { gates: {}, passages: {} })

const gateList = L.gateXs.map((_, i) => i)
const passages = [
  ...L.escalators.map((e) => ({ id: e.id, name: `扶梯 → 站台 ${e.platformId}` })),
  ...L.stairs.map((s) => ({ id: s.id, name: `楼梯 → 站台 ${s.platformId}` }))
]

function isGateClosed(id: number) {
  return !!closed.value.gates[id]
}
function isPassageClosed(id: string) {
  return !!closed.value.passages[id]
}
</script>

<template>
  <div class="panel control-panel">
    <div class="title">🚇 地铁客流仿真控制台</div>

    <div class="row">
      <button class="btn" @click="scene?.setRunning(!ui?.running)">
        {{ ui?.running ? '⏸ 暂停' : '▶ 运行' }}
      </button>
      <button class="btn ghost" @click="scene?.resetView()">复位视角</button>
      <button class="btn danger ghost" @click="scene?.reopenAll()">全部重开</button>
    </div>

    <div class="block">
      <div class="label">乘客生成速率：{{ ui?.spawnRate ?? 6 }} 人/秒</div>
      <input
        class="slider"
        type="range"
        min="1"
        max="20"
        step="1"
        :value="ui?.spawnRate ?? 6"
        @input="scene?.setSpawnRate(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <div class="block">
      <label class="check">
        <input type="checkbox" :checked="ui?.heatmap ?? true" @change="scene?.setHeatmap(($event.target as HTMLInputElement).checked)" />
        显示拥堵热力图
      </label>
    </div>

    <div class="block">
      <div class="label">闸机（点击切换，也可在 3D 场景直接点闸机）</div>
      <div class="chip-grid">
        <button
          v-for="id in gateList"
          :key="id"
          class="chip"
          :class="{ off: isGateClosed(id) }"
          @click="scene?.toggleGate(id)"
        >
          {{ isGateClosed(id) ? '⛔' : '✅' }} 闸机 {{ id + 1 }}
        </button>
      </div>
    </div>

    <div class="block">
      <div class="label">扶梯 / 楼梯通道</div>
      <div class="chip-grid">
        <button
          v-for="pass in passages"
          :key="pass.id"
          class="chip"
          :class="{ off: isPassageClosed(pass.id) }"
          @click="scene?.togglePassage(pass.id)"
        >
          {{ isPassageClosed(pass.id) ? '⛔' : '🟢' }} {{ pass.name }}
        </button>
      </div>
    </div>

    <div v-if="selected" class="selected-tip">
      已切换：{{ selected.type === 'gate' ? `闸机 ${Number(selected.id) + 1}` : String(selected.id) }}
      → {{ selected.closed ? '关闭，乘客自动改道' : '重新开放' }}
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 262px;
  padding: 14px 16px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 180, 240, 0.4) transparent;
}

.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-thumb {
  background: rgba(140, 180, 240, 0.35);
  border-radius: 4px;
}

.control-panel::-webkit-scrollbar-track {
  background: transparent;
}

.title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #dceaff;
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.block {
  margin-top: 12px;
}

.label {
  font-size: 12px;
  color: #9fb6d4;
  margin-bottom: 6px;
}

.slider {
  width: 100%;
  accent-color: #4f9bff;
}

.check {
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  cursor: pointer;
  border: 1px solid rgba(150, 190, 255, 0.25);
  background: rgba(255, 255, 255, 0.07);
  color: #e6eefb;
}

.chip.off {
  border-color: rgba(255, 90, 90, 0.5);
  background: rgba(160, 30, 24, 0.55);
}

.selected-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #ffd98a;
  background: rgba(255, 180, 60, 0.08);
  border: 1px solid rgba(255, 190, 80, 0.25);
  padding: 8px;
  border-radius: 8px;
}
</style>
