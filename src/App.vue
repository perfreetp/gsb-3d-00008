<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MetroSimulation } from './sim/MetroSimulation'
import { StationScene } from './scene/StationScene'

const canvas = ref<HTMLCanvasElement | null>(null)
const showHeatmap = ref(true)
const showPanel = ref(true)

const sim = new MetroSimulation()
let scene: StationScene | null = null
let animationFrame = 0
let lastTime = 0

const stats = sim.stats
const gates = sim.gates
const passages = sim.passages

const activeClosures = computed(() => {
  return [...gates.filter((item) => !item.open), ...passages.filter((item) => !item.open)].length
})

const densityLevel = computed(() => {
  if (stats.averageDensity < 1.5) return { label: '畅通', className: 'good' }
  if (stats.averageDensity < 3.2) return { label: '缓行', className: 'warn' }
  return { label: '拥堵', className: 'danger' }
})

function toggleRunning() {
  stats.running = !stats.running
}

function resetScene() {
  sim.resetClosures()
  sim.resetPassengers()
}

function toggleHeatmap() {
  showHeatmap.value = !showHeatmap.value
  scene?.setHeatVisible(showHeatmap.value)
}

onMounted(() => {
  if (!canvas.value) return
  scene = new StationScene(canvas.value, sim)

  const tick = (time: number) => {
    const delta = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.05)
    lastTime = time
    sim.update(delta)
    scene?.render()
    animationFrame = requestAnimationFrame(tick)
  }
  animationFrame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  scene?.dispose()
})
</script>

<template>
  <main class="app-shell">
    <canvas ref="canvas" class="viewport"></canvas>

    <section class="title-card">
      <div>
        <p class="eyebrow">VUE 3 · TYPESCRIPT · THREE.JS</p>
        <h1>3D 地铁站客流仿真系统</h1>
      </div>
      <button class="ghost-button" type="button" @click="showPanel = !showPanel">
        {{ showPanel ? '收起面板' : '展开面板' }}
      </button>
    </section>

    <aside v-if="showPanel" class="control-panel">
      <div class="panel-section">
        <div class="section-heading">
          <h2>实时态势</h2>
          <span class="status-pill" :class="densityLevel.className">{{ densityLevel.label }}</span>
        </div>
        <div class="stats-grid">
          <div><strong>{{ stats.passengers }}</strong><span>站内人数</span></div>
          <div><strong>{{ stats.moving }}</strong><span>流动中</span></div>
          <div><strong>{{ stats.waiting }}</strong><span>候车</span></div>
          <div><strong>{{ stats.riding }}</strong><span>乘车</span></div>
          <div><strong>{{ stats.train1Passengers }}</strong><span>1号线</span></div>
          <div><strong>{{ stats.train2Passengers }}</strong><span>2号线</span></div>
          <div><strong>{{ stats.lost }}</strong><span>待绕行</span></div>
          <div><strong>{{ stats.served }}</strong><span>已完成</span></div>
        </div>
        <div class="density-bar">
          <div
            class="density-fill"
            :class="densityLevel.className"
            :style="{ width: `${Math.min(100, stats.averageDensity * 16)}%` }"
          ></div>
        </div>
        <p class="micro-copy">平均节点密度：{{ stats.averageDensity.toFixed(2) }} 人/节点 · 路由版本：{{ stats.routeVersion }}</p>
      </div>

      <div class="panel-section">
        <h2>仿真控制</h2>
        <div class="button-row">
          <button type="button" @click="toggleRunning">{{ stats.running ? '暂停' : '继续' }}</button>
          <button type="button" @click="toggleHeatmap">{{ showHeatmap ? '隐藏热力' : '显示热力' }}</button>
          <button type="button" class="warning" @click="resetScene">复位</button>
        </div>

        <label class="slider">
          <span>生成速率 <b>{{ stats.spawnRate }} 人/秒</b></span>
          <input v-model.number="stats.spawnRate" type="range" min="0" max="60" step="1" />
        </label>
        <label class="slider">
          <span>客流上限 <b>{{ stats.maxPassengers }} 人</b></span>
          <input v-model.number="stats.maxPassengers" type="range" min="40" max="420" step="10" />
        </label>
        <label class="slider">
          <span>仿真倍速 <b>{{ stats.speed.toFixed(1) }}×</b></span>
          <input v-model.number="stats.speed" type="range" min="0.25" max="4" step="0.25" />
        </label>
      </div>

      <div class="panel-section">
        <div class="section-heading">
          <h2>闸机封控</h2>
          <span class="closure-count">{{ gates.filter((item) => !item.open).length }}/6 关闭</span>
        </div>
        <div class="facility-grid">
          <button
            v-for="gate in gates"
            :key="gate.id"
            type="button"
            :class="['facility-button', gate.open ? 'open' : 'closed']"
            @click="sim.toggleGate(gate.id)"
          >
            <span>{{ gate.label }}</span>
            <small>{{ gate.open ? '通行中' : '已关闭' }}</small>
          </button>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-heading">
          <h2>垂直通道</h2>
          <span class="closure-count">{{ passages.filter((item) => !item.open).length }}/4 关闭</span>
        </div>
        <div class="facility-list">
          <button
            v-for="passage in passages"
            :key="passage.id"
            type="button"
            :class="['passage-button', passage.open ? 'open' : 'closed']"
            @click="sim.togglePassage(passage.id)"
          >
            <span>{{ passage.label }}</span>
            <b>{{ passage.open ? '开放' : '封闭' }}</b>
          </button>
        </div>
      </div>

      <div class="panel-section">
        <h2>图例</h2>
        <div class="legend">
          <span><i class="cyan"></i>流动乘客</span>
          <span><i class="yellow"></i>站台候车</span>
          <span><i class="green"></i>车内乘客</span>
          <span><i class="purple"></i>上车中</span>
          <span><i class="red"></i>等待绕行</span>
        </div>
        <p class="hint">鼠标左键旋转、滚轮缩放、右键平移。也可以直接点击场景中的闸机或通道进行关闭/开放。</p>
        <p v-if="activeClosures > 0" class="route-alert">
          已关闭 {{ activeClosures }} 个通行节点，乘客会基于实时拥堵代价重新计算路径。
        </p>
      </div>
    </aside>
  </main>
</template>

<style scoped>
.app-shell {
  position: relative;
  width: 100%;
  height: 100%;
}

.viewport {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.viewport:active {
  cursor: grabbing;
}

.title-card,
.control-panel {
  position: absolute;
  z-index: 5;
  border: 1px solid rgba(125, 211, 252, 0.22);
  background: rgba(7, 15, 28, 0.76);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(18px);
}

.title-card {
  top: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 16px 18px;
  border-radius: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #67e8f9;
  font-size: 10px;
  letter-spacing: 0.18em;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 22px;
  line-height: 1.25;
}

h2 {
  margin-bottom: 12px;
  color: #e0f2fe;
  font-size: 15px;
}

.control-panel {
  top: 112px;
  left: 20px;
  bottom: 20px;
  width: 348px;
  overflow-y: auto;
  padding: 16px;
  border-radius: 20px;
  scrollbar-width: thin;
}

.panel-section {
  padding: 0 0 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.panel-section:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-heading h2 {
  margin-bottom: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 12px 0;
}

.stats-grid div {
  padding: 9px 6px;
  border: 1px solid rgba(103, 232, 249, 0.14);
  border-radius: 12px;
  background: rgba(14, 116, 144, 0.08);
  text-align: center;
}

.stats-grid strong {
  display: block;
  color: #7dd3fc;
  font-size: 18px;
}

.stats-grid span,
.micro-copy,
.hint {
  color: #94a3b8;
  font-size: 11px;
}

.micro-copy {
  margin-top: 8px;
}

.status-pill,
.closure-count {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.status-pill.good {
  color: #86efac;
  background: rgba(34, 197, 94, 0.13);
}

.status-pill.warn {
  color: #fde68a;
  background: rgba(234, 179, 8, 0.14);
}

.status-pill.danger {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.16);
}

.closure-count {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.12);
}

.density-bar {
  height: 7px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(148, 163, 184, 0.15);
}

.density-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.24s ease;
}

.density-fill.good {
  background: linear-gradient(90deg, #34d399, #86efac);
}

.density-fill.warn {
  background: linear-gradient(90deg, #f59e0b, #fde047);
}

.density-fill.danger {
  background: linear-gradient(90deg, #ef4444, #fb7185);
}

button {
  border: 1px solid rgba(125, 211, 252, 0.22);
  border-radius: 11px;
  color: #e0f2fe;
  background: rgba(14, 116, 144, 0.18);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

button:hover {
  transform: translateY(-1px);
  background: rgba(14, 116, 144, 0.32);
  border-color: rgba(125, 211, 252, 0.5);
}

.ghost-button {
  padding: 9px 12px;
  font-size: 12px;
}

.button-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.button-row button {
  padding: 10px 6px;
  font-size: 12px;
}

.button-row .warning {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(248, 113, 113, 0.28);
}

.slider {
  display: block;
  margin-top: 12px;
}

.slider span {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  color: #cbd5e1;
  font-size: 12px;
}

.slider b {
  color: #67e8f9;
}

input[type='range'] {
  width: 100%;
  accent-color: #38bdf8;
}

.facility-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.facility-button {
  padding: 10px 5px;
}

.facility-button span,
.facility-button small,
.passage-button span,
.passage-button b {
  display: block;
}

.facility-button span,
.passage-button span {
  font-size: 12px;
}

.facility-button small,
.passage-button b {
  margin-top: 4px;
  font-size: 10px;
  font-weight: 500;
}

.facility-list {
  display: grid;
  gap: 8px;
}

.passage-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}

.facility-button.open,
.passage-button.open {
  border-color: rgba(52, 211, 153, 0.28);
  background: rgba(16, 185, 129, 0.12);
}

.facility-button.closed,
.passage-button.closed {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(239, 68, 68, 0.18);
}

.facility-button.closed small,
.passage-button.closed b {
  color: #fca5a5;
}

.legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-bottom: 12px;
  color: #cbd5e1;
  font-size: 11px;
}

.legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.cyan { background: #48d8ff; }
.yellow { background: #ffd34d; }
.green { background: #7cff9a; }
.purple { background: #c28cff; }
.red { background: #ff4268; }

.hint {
  line-height: 1.65;
}

.route-alert {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 12px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.1);
  font-size: 11px;
  line-height: 1.55;
}

@media (max-width: 860px) {
  .title-card {
    right: 12px;
    left: 12px;
    top: 12px;
  }

  h1 {
    font-size: 17px;
  }

  .control-panel {
    top: 92px;
    right: 12px;
    bottom: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
