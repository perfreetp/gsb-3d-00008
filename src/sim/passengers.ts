import * as THREE from 'three'
import type { NavNode, PassengerState } from './types'

const STATE_COLORS: Record<PassengerState, number> = {
  toGate: 0x4fc3f7,
  toPlatform: 0x66bb6a,
  waiting: 0xffca28,
  boarding: 0xff8a3d,
  alighting: 0xab7df7,
  toExit: 0x42a5f5,
  exiting: 0x90caf9
}

let nextId = 1

export class Passenger {
  id: number
  state: PassengerState
  targetPlatform: 1 | 2
  path: NavNode[] = []
  pathIndex = 0
  pos = new THREE.Vector3()
  speed: number
  scale: number
  color: THREE.Color
  slotId: string | null = null
  startNodeId = 0
  repathTimer = 0
  done = false
  trainAlighting = false
  stateTimer = 0

  constructor(entrance: NavNode, targetPlatform: 1 | 2) {
    this.id = nextId++
    this.state = 'toGate'
    this.targetPlatform = targetPlatform
    this.pos.set(entrance.x, entrance.y, entrance.z)
    this.speed = 1.35 + Math.random() * 0.9
    this.scale = 0.85 + Math.random() * 0.25
    this.color = new THREE.Color(STATE_COLORS.toGate)
    this.startNodeId = entrance.id
  }

  get currentNode(): NavNode | null {
    return this.path[this.pathIndex] ?? null
  }

  setState(state: PassengerState) {
    this.state = state
    this.color.setHex(STATE_COLORS[state])
  }

  setPath(path: NavNode[], startIndex = 0) {
    this.path = path
    this.pathIndex = startIndex
  }

  update(dt: number): { arrivedAtNode: NavNode | null; crossedPassage: NavNode | null } {
    let arrivedAtNode: NavNode | null = null
    let crossedPassage: NavNode | null = null
    let remaining = this.speed * dt
    const maxSteps = 12
    let steps = 0
    while (remaining > 0 && this.pathIndex < this.path.length && steps < maxSteps) {
      steps++
      const target = this.path[this.pathIndex]
      const to = new THREE.Vector3(target.x, target.y, target.z)
      const dir = to.clone().sub(this.pos)
      const dist = dir.length()
      if (dist <= remaining) {
        const prevFloor = this.pos.y
        this.pos.copy(to)
        remaining -= dist
        arrivedAtNode = target
        if (target.kind === 'landing' && Math.abs(prevFloor - target.y) > 1) crossedPassage = target
        this.pathIndex++
        if (this.pathIndex >= this.path.length) break
      } else {
        this.pos.add(dir.normalize().multiplyScalar(remaining))
        const prev = this.path[Math.max(0, this.pathIndex - 1)]
        const total = to.clone().sub(new THREE.Vector3(prev.x, prev.y, prev.z)).length()
        if (total > 0.001) {
          const t = THREE.MathUtils.clamp(this.pos.distanceTo(new THREE.Vector3(prev.x, prev.y, prev.z)) / total, 0, 1)
          this.pos.y = THREE.MathUtils.lerp(prev.y, target.y, t)
        }
        remaining = 0
      }
    }
    if (steps >= maxSteps) remaining = 0
    return { arrivedAtNode, crossedPassage: crossedPassage ?? null }
  }
}

export class PassengerRenderer {
  mesh: THREE.InstancedMesh
  private dummy = new THREE.Object3D()
  private capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.62, 4, 8)
    bodyGeo.translate(0, 0.72, 0)
    const headGeo = new THREE.SphereGeometry(0.18, 10, 10)
    headGeo.translate(0, 1.28, 0)
    const merged = mergeGeometriesDummy(bodyGeo, headGeo)
    const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 })
    this.mesh = new THREE.InstancedMesh(merged, material, capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.castShadow = true
    const colorArray = new Float32Array(capacity * 3)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3)
    this.mesh.count = 0
  }

  sync(passengers: Passenger[]) {
    const n = Math.min(passengers.length, this.capacity)
    for (let i = 0; i < n; i++) {
      const p = passengers[i]
      this.dummy.position.copy(p.pos)
      this.dummy.scale.setScalar(p.scale)
      const target = p.currentNode
      if (target) {
        const dx = target.x - p.pos.x
        const dz = target.z - p.pos.z
        if (dx * dx + dz * dz > 0.001) this.dummy.rotation.y = Math.atan2(dx, dz)
      }
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
      this.mesh.setColorAt(i, p.color)
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

function mergeGeometriesDummy(body: THREE.BufferGeometry, head: THREE.BufferGeometry): THREE.BufferGeometry {
  const list = [body, head]
  const positions: number[] = []
  list.forEach((g) => {
    const pos = g.getAttribute('position')
    const index = g.getIndex()
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const vi = index.getX(i)
        positions.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi))
      }
    } else {
      for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
