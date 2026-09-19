import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getPassengerColor, MetroSimulation } from '../sim/MetroSimulation'
import {
  DOOR_Z,
  gateDefinitions,
  HALL_Y,
  passageDefinitions,
  PLATFORM_Y,
  TRAIN_DOOR_X,
  TRAIN_Z,
} from '../sim/stationGraph'

const FLOOR_SURFACE: [number, number, number] = [0.11, -6.39, -12.89]

type SelectableKind = 'gate' | 'passage'

interface SelectableObject extends THREE.Object3D {
  userData: {
    kind: SelectableKind
    id: string
  }
}

interface HeatLayer {
  mesh: THREE.InstancedMesh
  cells: Array<{ x: number; z: number; ix: number; iz: number }>
  cellSize: number
  width: number
  depth: number
  y: number
  minX: number
  minZ: number
}

interface TrainView {
  group: THREE.Group
  doorMaterials: THREE.MeshStandardMaterial[]
}

const tempMatrix = new THREE.Matrix4()
const tempPosition = new THREE.Vector3()
const tempQuaternion = new THREE.Quaternion()
const tempScale = new THREE.Vector3(1, 1, 1)
const heatColor = new THREE.Color()

export class StationScene {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls

  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private sim: MetroSimulation
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private passengerMesh: THREE.InstancedMesh
  private gateBarriers: Array<THREE.Mesh & { userData: { kind: 'gate'; id: string } }> = []
  private passageBarriers = new Map<string, THREE.Mesh>()
  private selectables: THREE.Object3D[] = []
  private heatLayers: HeatLayer[] = []
  private trainViews = new Map<number, TrainView>()
  private heatTimer = 0

  constructor(canvas: HTMLCanvasElement, sim: MetroSimulation) {
    this.sim = sim
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.renderer.shadowMap.enabled = false

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x08111f)
    this.scene.fog = new THREE.FogExp2(0x08111f, 0.0065)

    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 420)
    this.camera.position.set(92, 72, 96)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, -8, 10)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.minDistance = 30
    this.controls.maxDistance = 190

    this.addLights()
    this.buildStation()

    const passengerGeometry = new THREE.CapsuleGeometry(0.42, 1.02, 4, 8)
    const passengerMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.48,
      metalness: 0.04,
      vertexColors: true,
    })
    this.passengerMesh = new THREE.InstancedMesh(passengerGeometry, passengerMaterial, 420)
    this.passengerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.passengerMesh.castShadow = false
    this.passengerMesh.count = 420
    for (let index = 0; index < 420; index += 1) {
      this.passengerMesh.setMatrixAt(index, tempMatrix.compose(
        new THREE.Vector3(0, -120, 0),
        tempQuaternion.identity(),
        tempScale.set(0.0001, 0.0001, 0.0001),
      ))
    }
    this.scene.add(this.passengerMesh)

    canvas.addEventListener('pointerdown', this.handlePointerDown)
    window.addEventListener('resize', this.handleResize)
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xcce6ff, 0x18202c, 1.8)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.position.set(48, 86, 58)
    sun.castShadow = false
    this.scene.add(sun)

    const hallLight = new THREE.PointLight(0x64d7ff, 140, 90)
    hallLight.position.set(0, 9, 24)
    this.scene.add(hallLight)

    const platformLight1 = new THREE.PointLight(0x8fffc0, 90, 70)
    platformLight1.position.set(0, -2, -8)
    this.scene.add(platformLight1)

    const platformLight2 = new THREE.PointLight(0xa594ff, 90, 70)
    platformLight2.position.set(0, -8.5, -20)
    this.scene.add(platformLight2)
  }

  private buildStation(): void {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x121b28,
      roughness: 0.92,
      metalness: 0.08,
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 140), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -16.4, 16)
    ground.receiveShadow = false
    this.scene.add(ground)

    this.addFloor('站厅层 · Hall', 0, 0, 18, 122, 76, 0x26384a, 0.48)
    this.addFloor('1号站台 · Platform 1', 0, -6.5, 0, 122, 44, 0x1f4656, 0.82)
    this.addFloor('2号站台 · Platform 2', 0, -13, 0, 122, 44, 0x30294f, 0.9)

    this.addFloorDetails()
    this.addEntrances()
    this.addGates()
    this.addTracksAndWalls()
    this.addPassages()
    this.createHeatLayers()
    this.createTrains()
  }

  private addFloor(label: string, x: number, y: number, z: number, width: number, depth: number, color: number, opacity: number): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.14,
      transparent: true,
      opacity,
    })
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, depth), material)
    floor.position.set(x, y - 0.25, z)
    floor.receiveShadow = false
    this.scene.add(floor)

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x9defff,
      emissive: 0x1b6f8b,
      roughness: 0.3,
    })
    const edgeFront = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.16), edgeMaterial)
    edgeFront.position.set(x, y + 0.04, z - depth / 2)
    const edgeBack = edgeFront.clone()
    edgeBack.position.z = z + depth / 2
    this.scene.add(edgeFront, edgeBack)

    this.addLabel(label, new THREE.Vector3(-51, y + 0.45, z + depth / 2 - 4), 4.8, '#9defff')
  }

  private addFloorDetails(): void {
    const hallGrid = new THREE.GridHelper(116, 24, 0x3d6178, 0x253a4c)
    hallGrid.position.set(0, HALL_Y + 0.025, 18)
    this.scene.add(hallGrid)

    const platformGrid1 = new THREE.GridHelper(112, 28, 0x3c8390, 0x244b55)
    platformGrid1.position.set(0, PLATFORM_Y[0] + 0.025, 0)
    this.scene.add(platformGrid1)

    const platformGrid2 = new THREE.GridHelper(112, 28, 0x6d61a8, 0x3e385f)
    platformGrid2.position.set(0, PLATFORM_Y[1] + 0.025, 0)
    this.scene.add(platformGrid2)

    const waitingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd34d,
      emissive: 0x806000,
      roughness: 0.5,
      transparent: true,
      opacity: 0.58,
    })
    for (const platform of [0, 1] as const) {
      TRAIN_DOOR_X.forEach((x) => {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.045, 2.2), waitingMaterial)
        mark.position.set(x, FLOOR_SURFACE[platform + 1] + 0.04, DOOR_Z)
        this.scene.add(mark)
      })
    }
  }

  private addEntrances(): void {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x42d8ff,
      emissive: 0x0d789a,
      roughness: 0.35,
    })
    ;[-36, 0, 36].forEach((x, index) => {
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.2, 0.8), frameMaterial)
      left.position.set(x - 4.6, 2.6, 53.4)
      const right = left.clone()
      right.position.x = x + 4.6
      const top = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 1.2), frameMaterial)
      top.position.set(x, 5.45, 53.4)
      left.castShadow = right.castShadow = top.castShadow = true
      this.scene.add(left, right, top)
      this.addLabel(`入口 ${index + 1}`, new THREE.Vector3(x, 6.6, 53.4), 4.4, '#67e7ff')
    })
  }

  private addTracksAndWalls(): void {
    for (const platform of [0, 1] as const) {
      const bedMaterial = new THREE.MeshStandardMaterial({
        color: 0x171c24,
        roughness: 0.95,
        metalness: 0.25,
      })
      const bed = new THREE.Mesh(new THREE.BoxGeometry(132, 0.35, 8.2), bedMaterial)
      bed.position.set(0, PLATFORM_Y[platform] + 0.08, TRAIN_Z[platform])
      bed.receiveShadow = true
      this.scene.add(bed)

      const railMaterial = new THREE.MeshStandardMaterial({ color: 0x8292a4, metalness: 0.75, roughness: 0.28 })
      ;[-2.4, 2.4].forEach((offset) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(132, 0.16, 0.18), railMaterial)
        rail.position.set(0, PLATFORM_Y[platform] + 0.32, TRAIN_Z[platform] + offset)
        this.scene.add(rail)
      })

      const wallMaterial = new THREE.MeshStandardMaterial({
        color: platform === 0 ? 0x173644 : 0x272445,
        roughness: 0.78,
      })
      const farWall = new THREE.Mesh(new THREE.BoxGeometry(122, 3.4, 0.6), wallMaterial)
      farWall.position.set(0, PLATFORM_Y[platform] + 1.6, -21.8)
      this.scene.add(farWall)

      const screenMaterial = new THREE.MeshStandardMaterial({
        color: 0x05080f,
        emissive: platform === 0 ? 0x0b5268 : 0x392b7a,
        roughness: 0.25,
      })
      TRAIN_DOOR_X.forEach((x) => {
        const screen = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.6, 0.12), screenMaterial)
        screen.position.set(x, PLATFORM_Y[platform] + 2.1, DOOR_Z + 5.8)
        this.scene.add(screen)
      })
    }

    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x8ea8bc, metalness: 0.55, roughness: 0.35 })
    ;[-50, -25, 0, 25, 50].forEach((x) => {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 15.5, 18), columnMaterial)
      column.position.set(x, -7.6, 18)
      column.castShadow = true
      this.scene.add(column)
    })
  }

  private addGates(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x557083,
      metalness: 0.55,
      roughness: 0.32,
    })
    gateDefinitions.forEach((definition, index) => {
      const group = new THREE.Group()
      group.position.set(definition.x, HALL_Y + 0.05, 33)

      const left = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.15, 4.5), bodyMaterial)
      left.position.set(-0.72, 0.58, 0)
      const right = left.clone()
      right.position.x = 0.72
      const reader = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.38, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x101820, emissive: 0x00e58a, emissiveIntensity: 0.9 }),
      )
      reader.position.set(0, 1.12, -1.25)
      left.castShadow = right.castShadow = true
      group.add(left, right, reader)

      const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0x00d88a,
        emissive: 0x00a567,
        transparent: true,
        opacity: 0.42,
      })
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.24, 3.4), barrierMaterial)
      barrier.position.set(0, 0.95, 0)
      barrier.castShadow = true
      barrier.userData = { kind: 'gate', id: definition.id }
      group.add(barrier)

      this.addLabel(`闸机 ${index + 1}`, new THREE.Vector3(definition.x, HALL_Y + 2.35, 33), 3.2, '#a7ffe0')
      this.scene.add(group)
      this.scene.userData.gateGroups ||= new Map()
      ;(this.scene.userData.gateGroups as Map<string, THREE.Mesh>).set(definition.id, barrier)
      this.gateBarriers.push(barrier as typeof barrier & { userData: { kind: 'gate'; id: string } })
      this.selectables.push(barrier)
    })
  }

  private addPassages(): void {
    passageDefinitions.forEach((definition) => {
      const topY = 0
      const bottomY = PLATFORM_Y[definition.platform]
      const start = new THREE.Vector3(definition.x, topY + 0.15, 16)
      const end = new THREE.Vector3(definition.x, bottomY + 0.15, 12)

      if (definition.type === 'escalator') {
        this.addEscalator(start, end, definition.platform)
      } else {
        this.addStairs(start, end, definition.platform)
      }

      const midpoint = start.clone().lerp(end, 0.42)
      const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0x42d8ff,
        emissive: 0x0a7ca8,
        transparent: true,
        opacity: 0.38,
      })
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.35, 1.25), barrierMaterial)
      barrier.position.set(definition.x, topY + 1.05, 16.35)
      barrier.userData = { kind: 'passage', id: definition.id }
      barrier.castShadow = true
      this.scene.add(barrier)
      this.passageBarriers.set(definition.id, barrier)
      this.selectables.push(barrier)
      this.addLabel(definition.label, midpoint.clone().add(new THREE.Vector3(0, 1.8, 0)), 4.1, definition.type === 'escalator' ? '#75e7ff' : '#ffd37a')
    })
  }

  private addEscalator(start: THREE.Vector3, end: THREE.Vector3, platform: 0 | 1): void {
    const group = new THREE.Group()
    const direction = end.clone().sub(start)
    const length = direction.length()
    const angle = Math.atan2(-direction.y, direction.z)
    const midpoint = start.clone().lerp(end, 0.5)
    group.position.copy(midpoint)
    group.rotation.x = angle

    const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x607585, metalness: 0.72, roughness: 0.25 })
    for (let index = 0; index < 2; index += 1) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.16, length), stepMaterial)
      lane.position.x = index === 0 ? -1.42 : 1.42
      lane.receiveShadow = true
      group.add(lane)
    }

    const railMaterial = new THREE.MeshStandardMaterial({
      color: platform === 0 ? 0x61dbff : 0xb79bff,
      emissive: platform === 0 ? 0x1b6f88 : 0x463380,
      transparent: true,
      opacity: 0.86,
    })
    ;[-2.75, 0, 2.75].forEach((x) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, length), railMaterial)
      rail.position.set(x, 0.62, 0)
      group.add(rail)
    })

    const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x26323c, metalness: 0.6, roughness: 0.4 })
    for (let z = -length / 2 + 0.6; z < length / 2; z += 0.8) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 0.08), ridgeMaterial)
      ridge.position.set(0, 0.13, z)
      group.add(ridge)
    }

    this.scene.add(group)
  }

  private addStairs(start: THREE.Vector3, end: THREE.Vector3, platform: 0 | 1): void {
    const count = 14
    const material = new THREE.MeshStandardMaterial({
      color: platform === 0 ? 0x778592 : 0x8b839f,
      roughness: 0.66,
      metalness: 0.2,
    })
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1)
      const position = start.clone().lerp(end, t)
      const step = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.32, 0.78), material)
      step.position.copy(position)
      step.castShadow = true
      step.receiveShadow = true
      this.scene.add(step)
    }

    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd37a,
      emissive: 0x5a410c,
      roughness: 0.4,
    })
    ;[-3.25, 3.25].forEach((x) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, start.distanceTo(end), 8), railMaterial)
      rail.position.copy(start.clone().lerp(end, 0.5).add(new THREE.Vector3(x, 0.8, 0)))
      rail.rotation.x = Math.atan2(start.z - end.z, end.y - start.y)
      this.scene.add(rail)
    })
  }

  private addLabel(text: string, position: THREE.Vector3, height: number, color: string): void {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgba(5, 12, 22, 0.72)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = color
    context.lineWidth = 4
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
    context.font = 'bold 42px "PingFang SC", "Microsoft YaHei", sans-serif'
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.set(height * 2.35, height * 0.59, 1)
    sprite.renderOrder = 10
    this.scene.add(sprite)
  }

  private createHeatLayers(): void {
    this.heatLayers = [
      this.createHeatLayer(118, 70, -59, -17, FLOOR_SURFACE[0] + 0.06, 7),
      this.createHeatLayer(116, 40, -58, -20, FLOOR_SURFACE[1] + 0.06, 7),
      this.createHeatLayer(116, 40, -58, -20, FLOOR_SURFACE[2] + 0.06, 7),
    ]
  }

  private createHeatLayer(
    width: number,
    depth: number,
    minX: number,
    minZ: number,
    y: number,
    cellSize = 7,
  ): HeatLayer {
    const cols = Math.floor(width / cellSize)
    const rows = Math.floor(depth / cellSize)
    const geometry = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9)
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, cols * rows)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(0, y, 0)
    mesh.renderOrder = 5

    const cells: HeatLayer['cells'] = []
    for (let iz = 0; iz < rows; iz += 1) {
      for (let ix = 0; ix < cols; ix += 1) {
        const index = iz * cols + ix
        const x = minX + ix * cellSize + cellSize / 2
        const z = minZ + iz * cellSize + cellSize / 2
        cells.push({ x, z, ix, iz })
        tempPosition.set(x, y, z)
        tempQuaternion.identity()
        tempScale.set(0.0001, 0.0001, 0.0001)
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
        mesh.setMatrixAt(index, tempMatrix)
        mesh.setColorAt(index, heatColor.set(0x000000))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    this.scene.add(mesh)

    return { mesh, cells, width, depth, y, minX, minZ, cellSize }
  }

  private createTrains(): void {
    this.sim.getTrains().forEach((snapshot) => {
      const group = new THREE.Group()
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: snapshot.platform === 0 ? 0xdbeeff : 0xf1e6ff,
        roughness: 0.38,
        metalness: 0.18,
      })
      const body = new THREE.Mesh(new THREE.BoxGeometry(62, 3.2, 4.6), bodyMaterial)
      body.position.y = 0
      body.castShadow = true
      group.add(body)

      const stripeMaterial = new THREE.MeshStandardMaterial({
        color: snapshot.platform === 0 ? 0x0b9ed2 : 0x7b58d6,
        emissive: snapshot.platform === 0 ? 0x0a5e7d : 0x3c247e,
      })
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(62.2, 0.42, 4.72), stripeMaterial)
      stripe.position.y = -0.2
      group.add(stripe)

      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1726,
        emissive: 0x102a44,
        roughness: 0.2,
      })
      for (let x = -27; x <= 27; x += 6) {
        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 0.1), windowMaterial)
        windowMesh.position.set(x, 0.55, 2.36)
        group.add(windowMesh)
      }

      const doorMaterials: THREE.MeshStandardMaterial[] = []
      TRAIN_DOOR_X.forEach((x) => {
        const doorMaterial = new THREE.MeshStandardMaterial({
          color: 0x1e6f91,
          emissive: 0x0b3344,
          roughness: 0.28,
          transparent: true,
          opacity: 0.75,
        })
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.55, 0.12), doorMaterial)
        door.position.set(x, -0.05, 2.38)
        doorMaterials.push(doorMaterial)
        group.add(door)
      })

      const headMaterial = new THREE.MeshStandardMaterial({
        color: snapshot.platform === 0 ? 0xffe08a : 0xa8e8ff,
        emissive: 0x5f4d1c,
      })
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.7), headMaterial)
      head.position.set(31.2, 0.05, 0)
      group.add(head)

      group.position.set(snapshot.position[0], snapshot.position[1], snapshot.position[2])
      this.scene.add(group)
      this.trainViews.set(snapshot.id, { group, doorMaterials })
    })
  }

  render(): void {
    this.updatePassengers()
    this.updateTrains()
    this.updateFacilityStatus()

    this.heatTimer -= 1 / 60
    if (this.heatTimer <= 0) {
      this.heatTimer = 0.22
      this.updateHeatLayers()
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  setHeatVisible(visible: boolean): void {
    this.heatLayers.forEach((layer) => {
      layer.mesh.visible = visible
    })
  }

  private updatePassengers(): void {
    const passengers = this.sim.getPassengers()
    for (const passenger of passengers) {
      if (!passenger.active || !passenger.visible) {
        tempPosition.set(0, -120, 0)
        tempQuaternion.identity()
        tempScale.set(0.0001, 0.0001, 0.0001)
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
        this.passengerMesh.setMatrixAt(passenger.meshIndex, tempMatrix)
        continue
      }

      tempPosition.copy(passenger.position)
      tempPosition.y += 0.82
      tempQuaternion.identity()
      tempScale.set(1, 1, 1)
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      this.passengerMesh.setMatrixAt(passenger.meshIndex, tempMatrix)
      this.passengerMesh.setColorAt(passenger.meshIndex, getPassengerColor(passenger))
    }
    this.passengerMesh.instanceMatrix.needsUpdate = true
    if (this.passengerMesh.instanceColor) this.passengerMesh.instanceColor.needsUpdate = true
  }

  private updateTrains(): void {
    this.sim.getTrains().forEach((snapshot) => {
      const view = this.trainViews.get(snapshot.id)
      if (!view) return
      view.group.position.set(snapshot.position[0], snapshot.position[1], snapshot.position[2])
      view.doorMaterials.forEach((material) => {
        material.color.set(snapshot.doorsOpen ? 0x7cff9a : 0x1e6f91)
        material.emissive.set(snapshot.doorsOpen ? 0x29a956 : 0x0b3344)
        material.opacity = snapshot.doorsOpen ? 0.34 : 0.78
      })
    })
  }

  private updateFacilityStatus(): void {
    const gateGroups = this.scene.userData.gateGroups as Map<string, THREE.Mesh> | undefined
    this.sim.gates.forEach((gate) => {
      const barrier = gateGroups?.get(gate.id)
      if (!barrier) return
      const material = barrier.material as THREE.MeshStandardMaterial
      material.color.set(gate.open ? 0x00d88a : 0xff3d55)
      material.emissive.set(gate.open ? 0x00a567 : 0x9e1024)
      barrier.scale.set(1, gate.open ? 0.16 : 1.05, 1)
    })

    this.sim.passages.forEach((passage) => {
      const barrier = this.passageBarriers.get(passage.id)
      if (!barrier) return
      const material = barrier.material as THREE.MeshStandardMaterial
      material.color.set(passage.open ? 0x42d8ff : 0xff3d55)
      material.emissive.set(passage.open ? 0x0a7ca8 : 0x9e1024)
      barrier.scale.set(passage.open ? 0.12 : 1, passage.open ? 0.12 : 1, passage.open ? 0.12 : 1)
    })
  }

  private updateHeatLayers(): void {
    const passengers = this.sim.getPassengers()
    const levels = [
      { y: FLOOR_SURFACE[0], minZ: -17, maxZ: 53 },
      { y: FLOOR_SURFACE[1], minZ: -20, maxZ: 20 },
      { y: FLOOR_SURFACE[2], minZ: -20, maxZ: 20 },
    ]

    this.heatLayers.forEach((layer, levelIndex) => {
      const level = levels[levelIndex]
      const counts = new Map<number, number>()
      for (const passenger of passengers) {
        if (!passenger.active || !passenger.visible) continue
        if (Math.abs(passenger.position.y - level.y) > 0.9) continue
        if (passenger.position.z < level.minZ || passenger.position.z > level.maxZ) continue
        const ix = THREE.MathUtils.clamp(
          Math.floor((passenger.position.x - layer.minX) / layer.cellSize),
          0,
          Math.floor(layer.width / layer.cellSize) - 1,
        )
        const iz = THREE.MathUtils.clamp(
          Math.floor((passenger.position.z - layer.minZ) / layer.cellSize),
          0,
          Math.floor(layer.depth / layer.cellSize) - 1,
        )
        const key = ix * 100 + iz
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }

      layer.cells.forEach((cell, index) => {
        let value = counts.get(cell.ix * 100 + cell.iz) ?? 0
        value += (counts.get((cell.ix - 1) * 100 + cell.iz) ?? 0) * 0.35
        value += (counts.get((cell.ix + 1) * 100 + cell.iz) ?? 0) * 0.35
        value += (counts.get(cell.ix * 100 + cell.iz - 1) ?? 0) * 0.35
        value += (counts.get(cell.ix * 100 + cell.iz + 1) ?? 0) * 0.35

        const intensity = THREE.MathUtils.clamp(value / 7.5, 0, 1)
        const scale = intensity < 0.08 ? 0.001 : 1
        tempPosition.set(cell.x, layer.y, cell.z)
        tempQuaternion.identity()
        tempScale.set(scale, scale, scale)
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
        layer.mesh.setMatrixAt(index, tempMatrix)

        if (intensity < 0.34) {
          heatColor.setRGB(0.05 + intensity, 0.86, 0.62 - intensity * 0.6)
        } else if (intensity < 0.72) {
          heatColor.setRGB(0.95, 0.72 - (intensity - 0.34) * 1.1, 0.05)
        } else {
          heatColor.setRGB(1, 0.12 + (1 - intensity) * 0.2, 0.08)
        }
        layer.mesh.setColorAt(index, heatColor)
      })
      layer.mesh.instanceMatrix.needsUpdate = true
      if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true
    })
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const intersections = this.raycaster.intersectObjects(this.selectables, false)
    const hit = intersections[0]?.object as SelectableObject | undefined
    if (!hit) return

    if (hit.userData.kind === 'gate') this.sim.toggleGate(hit.userData.id)
    if (hit.userData.kind === 'passage') this.sim.togglePassage(hit.userData.id)
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('resize', this.handleResize)
    this.controls.dispose()
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material?.dispose()
    })
    this.renderer.dispose()
  }
}
