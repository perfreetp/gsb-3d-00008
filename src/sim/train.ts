import * as THREE from 'three'
import { LAYOUT } from './layout'
import { matDark } from './station'

export type TrainState = 'inbound' | 'dwell' | 'outbound'

interface DoorPanel {
  mesh: THREE.Mesh
  side: number
  dir: number
  baseZ: number
  open: number
}

const matBody = new THREE.MeshStandardMaterial({ color: 0xd9dee5, roughness: 0.45, metalness: 0.25 })
const matStripe = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.5 })
const matWindow = new THREE.MeshStandardMaterial({
  color: 0x12243a,
  roughness: 0.2,
  metalness: 0.3,
  emissive: 0x9fd8ff,
  emissiveIntensity: 0.55
})
const matDoor = new THREE.MeshStandardMaterial({ color: 0xc3cbd4, roughness: 0.4, metalness: 0.3 })

export class Train {
  group = new THREE.Group()
  state: TrainState = 'inbound'
  z: number = LAYOUT.train.spawnZ
  dwellTimer = 0
  doorsOpen = 0
  onboard = 0
  capacity: number
  doorZs: number[] = []
  panels: DoorPanel[] = []

  constructor(public platformId: number, initialDelay: number) {
    const t = LAYOUT.train
    this.capacity = t.cars * t.perCar
    this.z = LAYOUT.train.spawnZ - initialDelay * t.speed
    const trackX = LAYOUT.platforms.find((p) => p.id === platformId)!.trackX
    this.group.position.set(trackX, 0, this.z)

    for (let c = 0; c < t.cars; c++) {
      const carZ = -t.halfTrain + c * t.carLength + t.carLength / 2
      const body = new THREE.Mesh(new THREE.BoxGeometry(t.width, t.height, t.carLength - 0.3), matBody)
      body.position.set(0, t.trackY + t.height / 2, carZ)
      body.castShadow = true
      body.receiveShadow = true
      this.group.add(body)

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.width + 0.04, 0.5, t.carLength - 0.4), matStripe)
      stripe.position.set(0, t.trackY + t.height * 0.72, carZ)
      this.group.add(stripe)

      const roof = new THREE.Mesh(new THREE.BoxGeometry(t.width - 0.4, 0.15, t.carLength - 1.2), matDark)
      roof.position.set(0, t.trackY + t.height + 0.08, carZ)
      this.group.add(roof)

      for (const side of [-1, 1]) {
        for (const wz of [-1.6, 1.6]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.1), matWindow)
          win.position.set(side * (t.width / 2 + 0.02), t.trackY + t.height * 0.62, carZ + wz)
          this.group.add(win)
        }
        const doorZ = [
          carZ - t.doorSpacing / 2,
          carZ + t.doorSpacing / 2
        ]
        for (const dz of doorZ) {
          for (const ds of [-1, 1]) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.55), matDoor)
            panel.position.set(side * (t.width / 2 + 0.02), t.trackY + 1.25, dz + ds * 0.3)
            this.group.add(panel)
            this.panels.push({ mesh: panel, side, dir: ds, baseZ: dz + ds * 0.3, open: 0 })
          }
          this.doorZs.push(dz)
        }
      }
    }

    const frontZ = -t.halfTrain
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffe9a0, emissiveIntensity: 2 })
    )
    light.position.set(0, t.trackY + 1.6, frontZ - 0.05)
    this.group.add(light)
  }

  get tta(): number {
    if (this.state === 'dwell') return 0
    const dz = LAYOUT.train.stopZ - this.z
    if (this.state === 'inbound') return Math.max(0, dz / LAYOUT.train.speed)
    return Infinity
  }

  get doorsProgress(): number {
    return this.doorsOpen
  }

  update(dt: number): { arrived?: boolean; depart?: boolean } {
    const t = LAYOUT.train
    let result: { arrived?: boolean; depart?: boolean } = {}
    if (this.state === 'inbound') {
      this.z += t.speed * dt
      if (this.z >= t.stopZ) {
        this.z = t.stopZ
        this.state = 'dwell'
        this.dwellTimer = t.dwell
        result.arrived = true
      }
    } else if (this.state === 'dwell') {
      this.dwellTimer -= dt
      const boardingPhase = this.dwellTimer > 1.5
      this.doorsOpen += ((boardingPhase ? 1 : 0) - this.doorsOpen) * Math.min(1, dt * 3)
      if (this.dwellTimer <= 0) {
        this.state = 'outbound'
        result.depart = true
      }
    } else {
      this.doorsOpen += (0 - this.doorsOpen) * Math.min(1, dt * 3)
      this.z += t.speed * dt
    }
    this.group.position.z = this.z

    for (const panel of this.panels) {
      const base = panel.side * (t.width / 2 + 0.02)
      panel.mesh.position.x = base
      panel.mesh.position.z = panel.baseZ + panel.open * panel.dir * 0.32
    }
    return result
  }

  get isPastEnd(): boolean {
    return this.state === 'outbound' && this.z > 42
  }

  reset(delay: number) {
    this.state = 'inbound'
    this.z = -46 - delay * LAYOUT.train.speed
    this.doorsOpen = 0
    this.dwellTimer = 0
    this.group.position.z = this.z
  }
}
