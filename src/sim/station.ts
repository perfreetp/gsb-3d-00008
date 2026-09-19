import * as THREE from 'three'
import { LAYOUT } from './layout'
import { makeTextSprite } from './labels'

export interface GateView {
  gateId: number
  group: THREE.Group
  light: THREE.Mesh
  setClosed: (closed: boolean) => void
}

export interface PassageView {
  id: string
  banner: THREE.Sprite
  setClosed: (closed: boolean) => void
}

export interface PsdPanel {
  mesh: THREE.Mesh
  closedX: number
  openOffset: number
  progress: number
  target: number
}

export interface PsdView {
  platformId: number
  panels: PsdPanel[]
}

export interface StationHandles {
  gateViews: GateView[]
  passageViews: PassageView[]
  psds: PsdView[]
}

const matFloor = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.85, metalness: 0.05 })
const matPlatform = new THREE.MeshStandardMaterial({ color: 0xb7bec6, roughness: 0.8 })
const matWall = new THREE.MeshStandardMaterial({ color: 0x6b7683, roughness: 0.9 })
const matMetal = new THREE.MeshStandardMaterial({ color: 0x8a94a0, roughness: 0.35, metalness: 0.8 })
export const matDark = new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.6, metalness: 0.4 })
const matYellow = new THREE.MeshStandardMaterial({ color: 0xf2c12e, roughness: 0.7 })
const matGlass = new THREE.MeshStandardMaterial({
  color: 0x8fd0e8,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.35
})
const matEscalator = new THREE.MeshStandardMaterial({ color: 0x3d4650, roughness: 0.5, metalness: 0.5 })
const matRail = new THREE.MeshStandardMaterial({ color: 0x5a636d, roughness: 0.4, metalness: 0.7 })
const matSleeper = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 })
const matColumn = new THREE.MeshStandardMaterial({ color: 0x4f86c6, roughness: 0.5, metalness: 0.3 })

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildHall(root: THREE.Group, handles: StationHandles) {
  const H = LAYOUT.hall
  const floorTop = H.floorY
  const c = H.cutout

  const addSlab = (x: number, z: number, w: number, d: number) => {
    const slab = box(w, H.thickness, d, matFloor, x, floorTop - H.thickness / 2, z)
    root.add(slab)
  }
  const cutW = c.xMax - c.xMin
  const leftW = c.xMin - H.xMin
  const rightW = H.xMax - c.xMax
  addSlab((H.xMin + c.xMin) / 2, (H.zMin + H.zMax) / 2, leftW, H.depth)
  addSlab((c.xMax + H.xMax) / 2, (H.zMin + H.zMax) / 2, rightW, H.depth)
  const cutD = c.zMax - c.zMin
  const backD = H.zMax - c.zMax
  addSlab((c.xMin + c.xMax) / 2, (c.zMax + H.zMax) / 2, cutW, backD)
  addSlab((c.xMin + c.xMax) / 2, (H.zMin + c.zMin) / 2, cutW, H.cutout.zMin - H.zMin)

  const wallH = 3
  const wallY = floorTop + wallH / 2
  root.add(box(H.width, wallH, 0.4, matWall, 0, wallY, H.zMin))
  root.add(box(0.4, wallH, H.depth, matWall, H.xMin, wallY, 0))
  root.add(box(0.4, wallH, H.depth, matWall, H.xMax, wallY, 0))

  const gateZ = LAYOUT.gateRow.z
  for (let i = 0; i < LAYOUT.gateXs.length; i++) {
    const x = LAYOUT.gateXs[i]
    const group = new THREE.Group()
    group.position.set(x, floorTop, gateZ)
    const body = box(0.28, 1.05, 1.5, matMetal, 0, 0.52, 0)
    group.add(body)
    const lid = box(0.5, 0.06, 1.6, matDark, 0, 1.08, 0)
    group.add(lid)
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x3ee07a, emissive: 0x1fae54, emissiveIntensity: 1.2 })
    const light = box(0.3, 0.12, 0.12, lightMat, 0, 1.12, 0.78)
    group.add(light)
    const screen = box(0.3, 0.22, 0.05, new THREE.MeshStandardMaterial({ color: 0x10243c, emissive: 0x123a66, emissiveIntensity: 0.8 }), 0, 0.85, -0.4)
    group.add(screen)
    group.traverse((o) => (o.userData.gateId = i))
    root.add(group)
    const view: GateView = {
      gateId: i,
      group,
      light,
      setClosed(closed: boolean) {
        const m = light.material as THREE.MeshStandardMaterial
        if (closed) {
          m.color.setHex(0xff4d4d)
          m.emissive.setHex(0xb01818)
        } else {
          m.color.setHex(0x3ee07a)
          m.emissive.setHex(0x1fae54)
        }
      }
    }
    handles.gateViews.push(view)
  }

  const gap = LAYOUT.gateXs[1] - LAYOUT.gateXs[0]
  const first = LAYOUT.gateXs[0]
  const last = LAYOUT.gateXs[LAYOUT.gateXs.length - 1]
  root.add(box(first - H.xMin - gap / 2, 1.0, 0.25, matMetal, (H.xMin + first - gap / 2) / 2, floorTop + 0.5, gateZ))
  root.add(box(H.xMax - (last + gap / 2), 1.0, 0.25, matMetal, (H.xMax + last + gap / 2) / 2, floorTop + 0.5, gateZ))
  for (let i = 0; i < LAYOUT.gateXs.length - 1; i++) {
    const xa = LAYOUT.gateXs[i] + gap / 2
    const xb = LAYOUT.gateXs[i + 1] - gap / 2
    root.add(box(xb - xa - 0.3, 1.0, 0.25, matMetal, (xa + xb) / 2, floorTop + 0.5, gateZ))
  }

  for (const e of LAYOUT.entrances) {
    root.add(box(4.4, wallH, 0.3, matGlass, e.x, wallY, H.zMax + 0.1))
    const label = makeTextSprite(`入口 ${e.id + 1}`, { bg: '#1f6f43', scale: 0.8 })
    label.position.set(e.x, floorTop + 2.9, H.zMax + 0.4)
    root.add(label)
    root.add(box(0.3, 0.3, 1.6, matMetal, e.x - 2.3, floorTop + 0.15, H.zMax - 0.4))
    root.add(box(0.3, 0.3, 1.6, matMetal, e.x + 2.3, floorTop + 0.15, H.zMax - 0.4))
  }

  const colXs = [-17.5, -8.5, 8.5, 17.5]
  const colZs = [-9.5, -2.5, 8.5]
  for (const cx of colXs) {
    for (const cz of colZs) {
      if (cx > c.xMin && cx < c.xMax && cz > c.zMin && cz < c.zMax) continue
      root.add(box(0.7, H.ceilingY - floorTop, 0.7, matColumn, cx, (H.ceilingY + floorTop) / 2, cz))
    }
  }

  const sign = makeTextSprite('站厅层 · 闸机 / 扶梯 / 楼梯', { bg: 'rgba(8,20,40,0.85)', scale: 1.1 })
  sign.position.set(0, floorTop + 3.1, 9)
  root.add(sign)
}

function beamBetween(root: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, thick: number, material: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), material)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize())
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

function buildPassages(root: THREE.Group, handles: StationHandles) {
  for (const esc of LAYOUT.escalators) {
    const top = new THREE.Vector3(esc.topX, LAYOUT.hall.floorY, esc.topZ)
    const bot = new THREE.Vector3(esc.botX, 0.02, esc.botZ)
    const a = top.clone().add(new THREE.Vector3(-0.75, 0, 0))
    const b = bot.clone().add(new THREE.Vector3(-0.75, 0, 0))
    const a2 = top.clone().add(new THREE.Vector3(0.75, 0, 0))
    const b2 = bot.clone().add(new THREE.Vector3(0.75, 0, 0))
    beamBetween(root, a, b, 1.4, matEscalator)
    beamBetween(root, a2, b2, 1.4, matEscalator)
    beamBetween(root, a.clone().add(new THREE.Vector3(0, 1.0, 0)), b.clone().add(new THREE.Vector3(0, 1.0, 0)), 0.12, matGlass)
    beamBetween(root, a2.clone().add(new THREE.Vector3(0, 1.0, 0)), b2.clone().add(new THREE.Vector3(0, 1.0, 0)), 0.12, matGlass)
    addPassageHandle(root, handles, esc.id, `扶梯 ${esc.platformId} 站台`, esc.topX, esc.topZ)
  }

  for (const st of LAYOUT.stairs) {
    const top = new THREE.Vector3(st.topX, LAYOUT.hall.floorY, st.topZ)
    const bot = new THREE.Vector3(st.botX, 0.02, st.botZ)
    const centerA = top.clone().add(new THREE.Vector3(-1, 0, 0))
    const centerB = bot.clone().add(new THREE.Vector3(-1, 0, 0))
    beamBetween(root, centerA, centerB, 2.2, matFloor)
    const steps = 14
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps
      const t1 = (i + 1) / steps
      const p0 = centerA.clone().lerp(centerB, t0)
      const p1 = centerA.clone().lerp(centerB, t1)
      const h = (LAYOUT.hall.floorY / steps) * (i + 1)
      const step = box(2.2, h, p1.z - p0.z + 0.06, matPlatform, (p0.x + p1.x) / 2, h / 2, (p0.z + p1.z) / 2)
      root.add(step)
    }
    const railA = centerA.clone().add(new THREE.Vector3(-1.2, 1.0, 0))
    const railB = centerB.clone().add(new THREE.Vector3(-1.2, 1.0, 0))
    beamBetween(root, railA, railB, 0.1, matMetal)
    const railC = centerA.clone().add(new THREE.Vector3(1.2, 1.0, 0))
    const railD = centerB.clone().add(new THREE.Vector3(1.2, 1.0, 0))
    beamBetween(root, railC, railD, 0.1, matMetal)
    addPassageHandle(root, handles, st.id, `楼梯 ${st.platformId} 站台`, st.topX, st.topZ)
  }
}

function addPassageHandle(root: THREE.Group, handles: StationHandles, id: string, text: string, x: number, z: number) {
  const banner = makeTextSprite(`${text} · 开放`, { bg: '#1f6f43', scale: 0.7 })
  banner.position.set(x, LAYOUT.hall.floorY + 2.4, z + 1.2)
  root.add(banner)
  const applyText = (closed: boolean) => {
    const next = makeTextSprite(`${text} · ${closed ? '关闭' : '开放'}`, { bg: closed ? '#b01818' : '#1f6f43', scale: 0.7 })
    const old = banner.material as THREE.SpriteMaterial
    const nm = next.material as THREE.SpriteMaterial
    old.map?.dispose()
    old.map = nm.map
    old.needsUpdate = true
    nm.map = null
    next.material.dispose()
  }
  handles.passageViews.push({
    id,
    banner,
    setClosed(closed: boolean) {
      applyText(closed)
    }
  })
}

function buildPlatforms(root: THREE.Group, handles: StationHandles) {
  const t = LAYOUT.train
  for (const p of LAYOUT.platforms) {
    const slab = box(p.width, 0.5, p.length, matPlatform, p.xCenter, -0.25, 0)
    root.add(slab)

    root.add(box(0.25, 0.06, p.length - 1, matYellow, p.edgeX + (p.id === 1 ? 0.25 : -0.25), 0.03, 0))
    for (let z = -p.length / 2 + 2; z < p.length / 2 - 2; z += 1.6) {
      root.add(box(0.45, 0.05, 0.7, matYellow, p.slotX, 0.03, z))
    }

    const wallMat = matWall
    root.add(box(p.width, 3.2, 0.4, wallMat, p.xCenter, 1.6, -p.length / 2))
    root.add(box(p.width, 3.2, 0.4, wallMat, p.xCenter, 1.6, p.length / 2))
    const backX = p.id === 1 ? p.xMin : p.xMax
    root.add(box(0.4, 3.2, p.length, wallMat, backX, 1.6, 0))

    for (let z = -30; z <= 30; z += 10) {
      const cx = p.id === 1 ? p.xMax - 1.2 : p.xMin + 1.2
      root.add(box(0.6, 3.2, 0.6, matColumn, cx, 1.6, z))
    }

    const panels: PsdPanel[] = []
    const doorZs: number[] = []
    for (let c = 0; c < t.cars; c++) {
      const carStart = -t.halfTrain + c * t.carLength
      doorZs.push(carStart + t.carLength / 2 - t.doorSpacing / 2)
      doorZs.push(carStart + t.carLength / 2 + t.doorSpacing / 2)
    }
    for (const z of doorZs) {
      for (const side of [-1, 1]) {
        const off = side * 0.72
        const panelMat = matGlass.clone()
        const panel = box(0.12, 2.4, 1.25, panelMat, p.edgeX + off, 1.2, z)
        root.add(panel)
        panels.push({ mesh: panel, closedX: p.edgeX + off, openOffset: side * 0.72, progress: 0, target: 0 })
      }
    }
    for (let z = -t.halfTrain; z <= t.halfTrain; z += 2) {
      if (doorZs.some((d) => Math.abs(d - z) < 1.4)) continue
      root.add(box(0.12, 2.4, 1.6, matGlass, p.edgeX, 1.2, z))
    }
    root.add(box(0.18, 0.18, t.halfTrain * 2 + 2, matMetal, p.edgeX, 2.5, 0))
    handles.psds.push({ platformId: p.id, panels })

    const label = makeTextSprite(`站台 ${p.id}`, { bg: 'rgba(8,20,40,0.85)', scale: 1.1 })
    label.position.set(p.xCenter, 3.4, -p.length / 2 + 3)
    root.add(label)
  }
}

function buildTracks(root: THREE.Group) {
  for (const p of LAYOUT.platforms) {
    const tx = p.trackX
    root.add(box(6, 0.3, 110, new THREE.MeshStandardMaterial({ color: 0x242a31, roughness: 1 }), tx, -0.42, 10))
    for (let z = -54; z <= 74; z += 1.6) {
      root.add(box(2.6, 0.12, 0.3, matSleeper, tx, -0.22, z))
    }
    root.add(box(0.12, 0.12, 128, matRail, tx - 0.85, -0.1, 10))
    root.add(box(0.12, 0.12, 128, matRail, tx + 0.85, -0.1, 10))
    const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x141a21, roughness: 1 })
    for (const zEnd of [-54, 74]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 20, 1, true), tunnelMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(tx, 2.6, zEnd)
      root.add(ring)
      root.add(box(8, 1.2, 0.6, tunnelMat, tx, 5.6, zEnd))
    }
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 200),
    new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.6
  ground.receiveShadow = true
  root.add(ground)
}

export function buildStation(): { root: THREE.Group; handles: StationHandles } {
  const root = new THREE.Group()
  const handles: StationHandles = { gateViews: [], passageViews: [], psds: [] }
  buildHall(root, handles)
  buildPassages(root, handles)
  buildPlatforms(root, handles)
  buildTracks(root)
  return { root, handles }
}

export function updatePsds(psds: PsdView[], dt: number) {
  for (const psd of psds) {
    for (const panel of psd.panels) {
      const speed = 2.2
      if (panel.progress < panel.target) panel.progress = Math.min(panel.target, panel.progress + dt * speed)
      else if (panel.progress > panel.target) panel.progress = Math.max(panel.target, panel.progress - dt * speed)
      panel.mesh.position.x = panel.closedX + panel.openOffset * panel.progress
      const m = panel.mesh.material as THREE.MeshStandardMaterial
      m.emissive = new THREE.Color(panel.target > 0.5 ? 0x2b6f8f : 0x000000)
      m.emissiveIntensity = panel.target > 0.5 ? 0.4 : 0
    }
  }
}
