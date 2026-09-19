<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Simulation } from '../sim/simulation'
import type { ClosedState, Stats } from '../sim/types'

const emit = defineEmits<{
  (e: 'select', payload: { type: 'gate' | 'passage'; id: number | string; closed: boolean } | null): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const hint = ref('点击闸机或扶梯/楼梯标牌可切换开闭')

let renderer: THREE.WebGLRenderer
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let raycaster: THREE.Raycaster
let pointer = new THREE.Vector2()
const clock = new THREE.Clock()
let frame = 0

const sim = new Simulation()
const ui = reactive({
  running: true,
  spawnRate: 6,
  heatmap: true,
  stats: sim.stats,
  closed: sim.closed
})

onMounted(() => {
  const container = containerRef.value!
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  sceneSetup()
  sim.init()
  bindInteraction(renderer.domElement)

  window.addEventListener('resize', onResize)
  animate()
})

function sceneSetup() {
  sim.scene.background = new THREE.Color(0x0d1420)
  sim.scene.fog = new THREE.Fog(0x0d1420, 70, 160)

  camera = new THREE.PerspectiveCamera(55, containerRef.value!.clientWidth / containerRef.value!.clientHeight, 0.1, 400)
  camera.position.set(52, 44, 66)
  camera.lookAt(0, 3, -6)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 3, -6)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI * 0.48
  controls.minDistance = 12
  controls.maxDistance = 140

  raycaster = new THREE.Raycaster()

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x313944, 0.85)
  sim.scene.add(hemi)
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(30, 60, 24)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  dir.shadow.camera.left = -70
  dir.shadow.camera.right = 70
  dir.shadow.camera.top = 70
  dir.shadow.camera.bottom = -70
  dir.shadow.camera.far = 180
  sim.scene.add(dir)

  const hallLight = new THREE.PointLight(0xffffff, 0.7, 60, 1.6)
  hallLight.position.set(0, 10.5, 2)
  sim.scene.add(hallLight)
  for (const p of [1, 2]) {
    const x = p === 1 ? -11 : 11
    const light = new THREE.PointLight(0xdfeeff, 0.8, 90, 1.8)
    light.position.set(x, 4.5, 0)
    sim.scene.add(light)
  }
}

function bindInteraction(dom: HTMLCanvasElement) {
  dom.addEventListener('click', onClick)
  dom.addEventListener('pointermove', onMove)
}

function updatePointer(event: MouseEvent) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function onClick(event: MouseEvent) {
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)
  const gate = sim.pickGate(raycaster)
  if (gate !== null) {
    sim.toggleGate(gate)
    emit('select', { type: 'gate', id: gate, closed: !!sim.closed.gates[gate] })
    return
  }
  const passage = sim.pickPassage(raycaster)
  if (passage !== null) {
    sim.togglePassage(passage)
    emit('select', { type: 'passage', id: passage, closed: !!sim.closed.passages[passage] })
    return
  }
  emit('select', null)
}

function onMove(event: MouseEvent) {
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)
  const gate = sim.pickGate(raycaster)
  const passage = gate === null ? sim.pickPassage(raycaster) : null
  renderer.domElement.style.cursor = gate !== null || passage !== null ? 'pointer' : 'grab'
}

function onResize() {
  const container = containerRef.value
  if (!container) return
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.clientWidth, container.clientHeight)
}

const FIXED_DT = 1 / 60
let accumulator = 0

function animate() {
  frame = requestAnimationFrame(animate)
  const elapsed = Math.min(0.25, clock.getDelta())
  accumulator += elapsed
  let steps = 0
  while (accumulator >= FIXED_DT && steps < 8) {
    sim.update(FIXED_DT)
    accumulator -= FIXED_DT
    steps++
  }
  sim.syncRender()
  controls.update()
  renderer.render(sim.scene, camera)
}

function setRunning(v: boolean) {
  sim.running = v
  ui.running = v
}

function setSpawnRate(rate: number) {
  ui.spawnRate = rate
  sim.setSpawnRate(rate)
}

function setHeatmap(v: boolean) {
  ui.heatmap = v
  sim.setHeatmapVisible(v)
}

function resetView() {
  camera.position.set(52, 44, 66)
  controls.target.set(0, 3, -6)
  controls.update()
}

defineExpose({
  ui,
  setRunning,
  setSpawnRate,
  setHeatmap,
  resetView,
  toggleGate: (id: number) => sim.toggleGate(id),
  togglePassage: (id: string) => sim.togglePassage(id),
  closeAllGates: (n: number) => {
    sim.setGateClosed(n, true)
  },
  reopenAll: () => {
    Object.keys(sim.closed.gates).forEach((k) => sim.setGateClosed(Number(k), false))
    Object.keys(sim.closed.passages).forEach((k) => sim.setPassageClosed(k, false))
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', onResize)
  controls?.dispose()
  sim.dispose()
  renderer?.dispose()
  if (renderer?.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement)
})
</script>

<template>
  <div ref="containerRef" class="scene-container">
    <div class="hint-bar panel">{{ hint }} · 左键旋转 / 滚轮缩放 / 右键平移</div>
  </div>
</template>

<style scoped>
.scene-container {
  position: absolute;
  inset: 0;
}

.hint-bar {
  position: absolute;
  left: 16px;
  bottom: 16px;
  padding: 8px 14px;
  font-size: 13px;
  pointer-events: none;
  color: #cfe0f5;
}
</style>
