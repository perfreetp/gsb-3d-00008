<script setup lang="ts">
import { computed } from 'vue'

type SceneInstance = InstanceType<typeof import('./StationScene.vue').default> | null
const props = defineProps<{ scene: SceneInstance | null }>()
const stats = computed(() => props.scene?.ui?.stats)

const heatPct = computed(() => Math.round((stats.value?.avgHeat ?? 0) * 100))
const heatLevel = computed(() => {
  const v = stats.value?.avgHeat ?? 0
  if (v < 0.08) return { text: '畅通', color: '#3ed598' }
  if (v < 0.2) return { text: '平稳', color: '#ffd91a' }
  return { text: '拥堵', color: '#ff5a45' }
})

function fmtTta(tta: number) {
  if (tta < 0) return '已离站'
  if (tta === 0) return '停靠中'
  return `${tta.toFixed(0)}s`
}
</script>

<template>
  <div class="panel stats-panel">
    <div class="title">实时客流监测</div>

    <div class="grid">
      <div class="cell">
        <div class="num">{{ stats?.active ?? 0 }}</div>
        <div class="cap">站内乘客</div>
      </div>
      <div class="cell">
        <div class="num yellow">{{ stats?.waiting ?? 0 }}</div>
        <div class="cap">站台候车</div>
      </div>
      <div class="cell">
        <div class="num blue">{{ stats?.onboard ?? 0 }}</div>
        <div class="cap">车上乘客</div>
      </div>
    </div>

    <div class="block">
      <div class="label">拥堵指数 <span :style="{ color: heatLevel.color }">{{ heatLevel.text }} ({{ heatPct }}%)</span></div>
      <div class="heatbar"><div class="heatfill" :style="{ width: heatPct + '%' }" /></div>
      <div class="legend">
        <span>低</span>
        <div class="legend-bar" />
        <span>高</span>
      </div>
    </div>

    <div class="block" v-for="t in stats?.trains ?? []" :key="t.platformId">
      <div class="train-row">
        <span class="train-name">列车 · 站台 {{ t.platformId }}</span>
        <span class="chip">{{ t.state }} {{ t.state === '进站中' ? fmtTta(t.tta) : '' }}</span>
      </div>
      <div class="train-meta">载客 {{ t.onboard }} 人</div>
    </div>

    <div class="block totals">
      <div>累计生成：{{ stats?.totalSpawned ?? 0 }}</div>
      <div>累计上车：{{ stats?.totalBoarded ?? 0 }}</div>
      <div>累计下车：{{ stats?.totalAlighted ?? 0 }}</div>
      <div>累计出站：{{ stats?.totalExited ?? 0 }}</div>
    </div>

    <div class="legend-colors">
      <span><i style="background:#4fc3f7" />入站</span>
      <span><i style="background:#66bb6a" />前往站台</span>
      <span><i style="background:#ffca28" />候车</span>
      <span><i style="background:#ab7df7" />下车</span>
      <span><i style="background:#42a5f5" />出站</span>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 250px;
  padding: 14px 16px;
}

.title {
  font-size: 15px;
  font-weight: 700;
  color: #dceaff;
  margin-bottom: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cell {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px 4px;
  text-align: center;
}

.num {
  font-size: 20px;
  font-weight: 700;
  color: #ff8a5c;
}
.num.yellow {
  color: #ffd91a;
}
.num.blue {
  color: #57a8ff;
}

.cap {
  font-size: 11px;
  color: #9fb6d4;
  margin-top: 2px;
}

.block {
  margin-top: 12px;
}

.label {
  font-size: 12px;
  color: #9fb6d4;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
}

.heatbar {
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.heatfill {
  height: 100%;
  background: linear-gradient(90deg, #0059ff, #00e680, #ffd91a, #ff260d);
  transition: width 0.2s ease;
}

.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #8ea6c6;
  margin-top: 4px;
}

.legend-bar {
  flex: 1;
  height: 6px;
  border-radius: 4px;
  background: linear-gradient(90deg, #0059ff, #00e680, #ffd91a, #ff260d);
}

.train-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.train-name {
  font-weight: 600;
}

.train-meta {
  font-size: 12px;
  color: #9fb6d4;
  margin-top: 2px;
}

.totals {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
  font-size: 12px;
  color: #c3d4ec;
}

.legend-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  font-size: 11px;
  color: #9fb6d4;
}

.legend-colors i {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  margin-right: 4px;
}
</style>
