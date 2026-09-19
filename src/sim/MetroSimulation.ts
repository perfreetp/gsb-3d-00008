import * as THREE from 'three'
import { reactive } from 'vue'
import {
  buildStationGraph,
  createGates,
  createPassages,
  DOOR_Z,
  HALL_Y,
  PLATFORM_Y,
  TRAIN_DOOR_X,
  TRAIN_Z,
} from './stationGraph'
import type {
  GateInfo,
  PassageInfo,
  Passenger,
  SimulationStats,
  TrainPhase,
  TrainSnapshot,
} from './types'

interface TrainState {
  id: number
  platform: 0 | 1
  phase: TrainPhase
  x: number
  doorsOpen: boolean
  passengers: Passenger[]
  capacity: number
  countdown: number
  hasAlighted: boolean
}

const MAX_POOL_SIZE = 420
const DWELL_DURATION = 9
const TRAIN_HALF_LENGTH = 31

const stateColors = {
  moving: new THREE.Color(0x48d8ff),
  waiting: new THREE.Color(0xffd34d),
  riding: new THREE.Color(0x7cff9a),
  lost: new THREE.Color(0xff4268),
  boarding: new THREE.Color(0xc28cff),
}

export class MetroSimulation {
  readonly gates = reactive<GateInfo[]>(createGates())
  readonly passages = reactive<PassageInfo[]>(createPassages())
  readonly stats = reactive<SimulationStats>({
    passengers: 0,
    waiting: 0,
    riding: 0,
    moving: 0,
    lost: 0,
    served: 0,
    train1Passengers: 0,
    train2Passengers: 0,
    averageDensity: 0,
    routeVersion: 0,
    running: true,
    speed: 1,
    spawnRate: 3,
    maxPassengers: 180,
  })

  private graph = buildStationGraph(this.gates, this.passages)
  private trains: [TrainState, TrainState] = [
    { id: 0, platform: 0, phase: 'inbound', x: -190, doorsOpen: false, passengers: [], capacity: 72, countdown: 0, hasAlighted: false },
    { id: 1, platform: 1, phase: 'inbound', x: -318, doorsOpen: false, passengers: [], capacity: 72, countdown: 0, hasAlighted: false },
  ]

  private passengers: Passenger[] = []
  private availableIndices: number[] = []
  private spawnAccumulator = 0
  private repathTimer = 0
  private nextPassengerId = 1
  private nodeCounts = new Map<string, number>()
  private crowdGrid = new Map<string, number>()
  private time = 0

  constructor() {
    for (let index = MAX_POOL_SIZE - 1; index >= 0; index -= 1) {
      this.availableIndices.push(index)
      this.passengers.push({
        id: -1,
        meshIndex: index,
        active: false,
        state: 'lost',
        position: new THREE.Vector3(0, -100, 0),
        targetPlatform: 0,
        path: [],
        pathIndex: 0,
        routeVersion: -1,
        speed: 0,
        waitDoor: null,
        targetDoor: 0,
        exitId: null,
        trainId: null,
        laneOffset: 0,
        repathCooldown: 0,
        lifetime: 0,
        visible: false,
      })
    }
  }

  getPassengers(): readonly Passenger[] {
    return this.passengers
  }

  getTrains(): TrainSnapshot[] {
    return this.trains.map((train) => ({
      id: train.id,
      platform: train.platform,
      phase: train.phase,
      position: [train.x, PLATFORM_Y[train.platform] + 1.25, TRAIN_Z[train.platform]],
      doorsOpen: train.doorsOpen,
      passengers: train.passengers.length,
      capacity: train.capacity,
      countdown: train.countdown,
    }))
  }

  getTrainState(id: number): TrainState {
    return this.trains[id]
  }

  getGraph() {
    return this.graph
  }

  getNodeCounts(): ReadonlyMap<string, number> {
    return this.nodeCounts
  }

  getTime(): number {
    return this.time
  }

  toggleGate(id: string): void {
    const gate = this.gates.find((item) => item.id === id)
    if (gate) {
      gate.open = !gate.open
      this.rebuildTopology()
    }
  }

  togglePassage(id: string): void {
    const passage = this.passages.find((item) => item.id === id)
    if (passage) {
      passage.open = !passage.open
      this.rebuildTopology()
    }
  }

  resetClosures(): void {
    let changed = false
    this.gates.forEach((gate) => {
      if (!gate.open) {
        gate.open = true
        changed = true
      }
    })
    this.passages.forEach((passage) => {
      if (!passage.open) {
        passage.open = true
        changed = true
      }
    })
    if (changed) this.rebuildTopology()
  }

  resetPassengers(): void {
    this.passengers.forEach((passenger) => this.releasePassenger(passenger))
    this.trains.forEach((train) => {
      train.passengers = []
    })
    this.spawnAccumulator = 0
    this.nextPassengerId = 1
  }

  private rebuildTopology(): void {
    this.graph = buildStationGraph(this.gates, this.passages)
    this.stats.routeVersion += 1
    for (const passenger of this.passengers) {
      if (passenger.active && passenger.state !== 'riding') {
        passenger.routeVersion = -1
        passenger.repathCooldown = 0
      }
    }
  }

  update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.05) * this.stats.speed
    if (!this.stats.running || dt <= 0) {
      this.refreshStats()
      return
    }

    this.time += dt
    this.spawnAccumulator += dt * this.stats.spawnRate
    while (this.spawnAccumulator >= 1) {
      if (this.activePassengerCount() < this.stats.maxPassengers) {
        this.spawnPassenger()
      }
      this.spawnAccumulator -= 1
    }

    this.gates.forEach((gate) => {
      gate.flow *= Math.exp(-dt * 0.35)
    })
    this.passages.forEach((passage) => {
      passage.flow *= Math.exp(-dt * 0.35)
    })

    this.repathTimer -= dt
    this.updateNodeCounts()
    this.trains.forEach((train) => this.updateTrain(train, dt))

    for (const passenger of this.passengers) {
      if (!passenger.active) continue
      passenger.lifetime += dt
      passenger.repathCooldown -= dt

      switch (passenger.state) {
        case 'riding':
          break
        case 'waiting':
        case 'boarding':
          this.updateWaitingPassenger(passenger, dt)
          break
        case 'entering':
        case 'to_platform':
        case 'alighting':
        case 'exiting':
          this.updateWalkingPassenger(passenger, dt)
          break
        case 'lost':
          this.tryRecoverLostPassenger(passenger)
          break
      }
    }

    if (this.repathTimer <= 0) {
      this.repathTimer = 4
      this.performCrowdRepathing()
    }

    this.updateNodeCounts()
    this.refreshStats()
  }

  private activePassengerCount(): number {
    let count = 0
    for (const passenger of this.passengers) if (passenger.active) count += 1
    return count
  }

  private spawnPassenger(): void {
    const meshIndex = this.availableIndices.pop()
    if (meshIndex === undefined) return

    const passenger = this.passengers[meshIndex]
    const entranceIndex = Math.floor(Math.random() * 3)
    const targetPlatform = Math.random() < 0.5 ? 0 : 1
    const entranceNode = this.graph.nodeMap.get(`entrance-${entranceIndex}`)!
    const doorIndex = Math.floor(Math.random() * TRAIN_DOOR_X.length)
    const targetNodeId = `door-p${targetPlatform}-${doorIndex}`

    passenger.id = this.nextPassengerId++
    passenger.active = true
    passenger.visible = true
    passenger.state = 'entering'
    passenger.position.set(
      entranceNode.position[0] + THREE.MathUtils.randFloatSpread(8),
      HALL_Y,
      entranceNode.position[2] + THREE.MathUtils.randFloatSpread(3),
    )
    passenger.targetPlatform = targetPlatform
    passenger.path = this.graph.findPath(entranceNode.id, targetNodeId, this.nodeCounts)
    passenger.pathIndex = 1
    passenger.routeVersion = this.stats.routeVersion
    passenger.speed = THREE.MathUtils.randFloat(4.2, 5.2)
    passenger.waitDoor = null
    passenger.targetDoor = doorIndex
    passenger.exitId = null
    passenger.trainId = null
    passenger.laneOffset = Math.random() < 0.5 ? -1.25 - Math.random() * 0.45 : 1.25 + Math.random() * 0.45
    passenger.repathCooldown = 0
    passenger.lifetime = 0

    if (passenger.path.length === 0) {
      passenger.state = 'lost'
    } else {
      passenger.state = 'to_platform'
    }
  }

  private releasePassenger(passenger: Passenger): void {
    if (passenger.trainId !== null) {
      const train = this.trains[passenger.trainId]
      train.passengers = train.passengers.filter((item) => item !== passenger)
    }
    passenger.active = false
    passenger.visible = false
    passenger.trainId = null
    passenger.path = []
    passenger.position.set(0, -100, 0)
    const index = this.availableIndices.indexOf(passenger.meshIndex)
    if (index === -1) this.availableIndices.push(passenger.meshIndex)
  }

  private updateTrain(train: TrainState, dt: number): void {
    if (train.phase === 'inbound') {
      train.x = Math.min(0, train.x + 16 * dt)
      train.doorsOpen = false
      train.hasAlighted = false
      if (train.x >= 0) {
        train.phase = 'dwell'
        train.countdown = DWELL_DURATION
        train.doorsOpen = true
        train.passengers
          .filter((passenger) => passenger.state === 'riding')
          .forEach((passenger) => this.alightPassenger(passenger, train))
        train.hasAlighted = true
      }
      return
    }

    if (train.phase === 'dwell') {
      train.countdown -= dt
      if (train.countdown < 0.35) {
        train.doorsOpen = false
      }

      if (train.countdown <= 0) {
        train.phase = 'outbound'
        train.doorsOpen = false
      }
      return
    }

    train.x += 16 * dt
    if (train.x >= 96 + TRAIN_HALF_LENGTH * 2) {
      train.x = -96
      train.phase = 'inbound'
      train.doorsOpen = false
      train.hasAlighted = false
    }
  }

  private alightPassenger(passenger: Passenger, train: TrainState): void {
    train.passengers = train.passengers.filter((item) => item !== passenger)
    passenger.trainId = null
    passenger.visible = true
    passenger.state = 'alighting'
    passenger.targetPlatform = train.platform
    passenger.position.set(
      TRAIN_DOOR_X[passenger.targetDoor],
      PLATFORM_Y[train.platform] + 1.2,
      TRAIN_Z[train.platform] + 2.3,
    )
    passenger.laneOffset = train.platform === 0 ? -0.7 : 0.7

    const startNodeId = `door-p${train.platform}-${passenger.targetDoor}`
    const exitId = `entrance-${Math.floor(Math.random() * 3)}`
    passenger.path = this.graph.findPath(startNodeId, exitId, this.nodeCounts)
    passenger.pathIndex = 1
    passenger.exitId = exitId
    passenger.routeVersion = this.stats.routeVersion
    passenger.speed = THREE.MathUtils.randFloat(4.4, 5.4)

    if (passenger.path.length === 0) passenger.state = 'lost'
  }

  private updateWaitingPassenger(passenger: Passenger, dt: number): void {
    if (passenger.routeVersion !== this.stats.routeVersion) {
      this.planPassengerRoute(passenger)
    }

    const train = this.trains[passenger.targetPlatform]
    if (
      train.phase !== 'dwell' ||
      !train.doorsOpen ||
      train.countdown < 1.1 ||
      train.passengers.length >= train.capacity
    ) {
      if (passenger.state === 'boarding') {
        passenger.state = 'waiting'
        passenger.path = []
      }
      this.moveToward(this.waitingPosition(passenger), passenger, dt, passenger.speed * 0.8)
      return
    }

    const doorPosition = new THREE.Vector3(
      TRAIN_DOOR_X[passenger.targetDoor],
      PLATFORM_Y[passenger.targetPlatform] + 1.15,
      TRAIN_Z[passenger.targetPlatform] + 2.25,
    )
    passenger.state = 'boarding'
    passenger.path = []
    this.moveToward(doorPosition, passenger, dt, passenger.speed * 1.18)

    if (passenger.position.distanceTo(doorPosition) < 1.15) {
      passenger.visible = false
      passenger.state = 'riding'
      passenger.trainId = train.id
      train.passengers.push(passenger)
    }
  }

  private waitingPosition(passenger: Passenger): THREE.Vector3 {
    return new THREE.Vector3(
      TRAIN_DOOR_X[passenger.targetDoor] + THREE.MathUtils.clamp(passenger.laneOffset * 0.4, -1.5, 1.5),
      PLATFORM_Y[passenger.targetPlatform],
      DOOR_Z + 0.8,
    )
  }

  private updateWalkingPassenger(passenger: Passenger, dt: number): void {
    if (passenger.routeVersion !== this.stats.routeVersion) {
      this.planPassengerRoute(passenger)
      if (passenger.state === 'lost') return
    }

    if (passenger.path.length === 0 || passenger.pathIndex >= passenger.path.length) {
      this.handlePathEnd(passenger)
      return
    }

    const targetId = passenger.path[passenger.pathIndex]
    const targetNode = this.graph.nodeMap.get(targetId)
    if (!targetNode || !this.canUseNode(targetId)) {
      this.planPassengerRoute(passenger)
      return
    }

    const target = this.pathPoint(targetNode.id, passenger)
    const currentEdge = this.currentEdge(passenger)
    let speed = passenger.speed
    if (currentEdge?.kind === 'stairs') speed *= 0.68
    if (currentEdge?.kind === 'escalator') speed *= 0.95

    this.moveToward(target, passenger, dt, speed)
    if (passenger.position.distanceTo(target) < 0.9) {
      passenger.position.copy(target)
      this.registerFlow(currentEdge)
      passenger.pathIndex += 1
      if (passenger.pathIndex >= passenger.path.length) this.handlePathEnd(passenger)
    }
  }

  private currentEdge(passenger: Passenger) {
    if (passenger.pathIndex <= 0 || passenger.pathIndex >= passenger.path.length) return null
    const from = passenger.path[passenger.pathIndex - 1]
    const to = passenger.path[passenger.pathIndex]
    return (
      this.graph.edges.find((edge) => edge.from === from && edge.to === to) ??
      this.graph.edges.find((edge) => edge.from === to && edge.to === from) ??
      null
    )
  }

  private registerFlow(edge: ReturnType<MetroSimulation['currentEdge']>): void {
    if (!edge) return
    if (edge.gateId) {
      const gate = this.gates.find((item) => item.id === edge.gateId)
      if (gate) gate.flow += 1
    }
    if (edge.passageId) {
      const passage = this.passages.find((item) => item.id === edge.passageId)
      if (passage) passage.flow += 1
    }
  }

  private pathPoint(nodeId: string, passenger: Passenger): THREE.Vector3 {
    const node = this.graph.nodeMap.get(nodeId)!
    const point = new THREE.Vector3(node.position[0], node.position[1], node.position[2])
    const previousId = passenger.pathIndex > 0 ? passenger.path[passenger.pathIndex - 1] : null
    const nextId = passenger.path[Math.min(passenger.pathIndex + 1, passenger.path.length - 1)]
    const previous = previousId ? this.graph.nodeMap.get(previousId) : null
    const next = this.graph.nodeMap.get(nextId)

    let direction = new THREE.Vector3(1, 0, 0)
    if (previous && next) {
      direction.set(
        next.position[0] - previous.position[0],
        0,
        next.position[2] - previous.position[2],
      )
    }
    if (direction.lengthSq() < 0.001) direction.set(0, 0, 1)
    direction.normalize()

    if (node.kind === 'platform' || node.kind === 'unpaid' || node.kind === 'paid' || node.kind === 'landing') {
      const lateral = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(passenger.laneOffset * 0.34)
      point.add(lateral)
    }

    if (node.kind === 'door') {
      point.z = DOOR_Z + 0.8
    }

    return point
  }

  private canUseNode(nodeId: string): boolean {
    const node = this.graph.nodeMap.get(nodeId)
    if (!node) return false
    if (node.gateId) return this.gates.find((gate) => gate.id === node.gateId)?.open ?? true
    return true
  }

  private moveToward(target: THREE.Vector3, passenger: Passenger, dt: number, speed: number): void {
    const direction = new THREE.Vector3().subVectors(target, passenger.position)
    const crowdCount = this.estimateLocalCrowd(passenger.position)
    const crowdFactor = THREE.MathUtils.clamp(1 - Math.max(0, crowdCount - 10) * 0.004, 0.94, 1)
    const distanceValue = direction.length()
    if (distanceValue < 0.001) return
    direction.normalize()
    const step = Math.min(distanceValue, speed * crowdFactor * dt)
    passenger.position.addScaledVector(direction, step)
  }

  private handlePathEnd(passenger: Passenger): void {
    if (passenger.state === 'to_platform' || passenger.state === 'entering') {
      passenger.state = 'waiting'
      passenger.waitDoor = passenger.targetDoor
      return
    }

    if (passenger.state === 'alighting' || passenger.state === 'exiting') {
      this.stats.served += 1
      this.releasePassenger(passenger)
    }
  }

  private planPassengerRoute(passenger: Passenger): void {
    let startId = this.nearestNodeId(passenger.position)
    const currentNode = this.graph.nodeMap.get(startId)

    if (currentNode?.kind === 'gate') {
      const openNeighbor = (this.graph.adjacency.get(startId) ?? [])
        .map((relation) => relation.neighborId)
        .find((id) => {
          const candidate = this.graph.nodeMap.get(id)
          return candidate?.kind !== 'gate' && this.canUseNode(id)
        })
      if (openNeighbor) startId = openNeighbor
    }

    let targetId: string | null = null
    if (passenger.state === 'alighting' || passenger.state === 'exiting') {
      targetId = passenger.exitId
    } else {
      targetId = `door-p${passenger.targetPlatform}-${passenger.targetDoor}`
    }

    if (!targetId) {
      passenger.state = 'lost'
      return
    }

    const path = this.graph.findPath(startId, targetId, this.nodeCounts)
    if (path.length === 0) {
      passenger.state = 'lost'
      return
    }

    passenger.path = path
    passenger.pathIndex = 1
    passenger.routeVersion = this.stats.routeVersion
    passenger.repathCooldown = THREE.MathUtils.randFloat(3, 5)
    if (passenger.state === 'lost') {
      passenger.state = passenger.exitId ? 'exiting' : 'to_platform'
    }
  }

  private tryRecoverLostPassenger(passenger: Passenger): void {
    if (passenger.lifetime > 70) {
      this.releasePassenger(passenger)
      return
    }
    if (passenger.repathCooldown > 0) return
    if (!passenger.exitId && Math.random() < 0.08) {
      passenger.exitId = `entrance-${Math.floor(Math.random() * 3)}`
    }
    this.planPassengerRoute(passenger)
  }

  private performCrowdRepathing(): void {
    let budget = 14
    for (const passenger of this.passengers) {
      if (!passenger.active || passenger.state === 'riding' || passenger.state === 'boarding') continue
      if (budget <= 0) break
      if (passenger.repathCooldown > 0 || Math.random() > 0.08) continue
      const nearestId = this.nearestNodeId(passenger.position)
      const count = this.nodeCounts.get(nearestId) ?? 0
      if (count < 12) continue
      budget -= 1
      const previousPath = passenger.path
      this.planPassengerRoute(passenger)
      if (passenger.state === 'lost') passenger.path = previousPath
    }
  }

  private updateNodeCounts(): void {
    this.nodeCounts.clear()
    this.crowdGrid.clear()
    for (const passenger of this.passengers) {
      if (!passenger.active || !passenger.visible || passenger.state === 'boarding') continue
      const id = this.nearestNodeId(passenger.position)
      this.nodeCounts.set(id, (this.nodeCounts.get(id) ?? 0) + 1)
      const gx = Math.floor(passenger.position.x / 4)
      const gy = Math.floor(passenger.position.y / 3)
      const gz = Math.floor(passenger.position.z / 4)
      const key = `${gx}/${gy}/${gz}`
      this.crowdGrid.set(key, (this.crowdGrid.get(key) ?? 0) + 1)
    }
  }

  private nearestNodeId(position: THREE.Vector3): string {
    let bestId = ''
    let bestDistance = Number.POSITIVE_INFINITY
    for (const node of this.graph.nodes) {
      const dx = position.x - node.position[0]
      const dy = (position.y - node.position[1]) * 2.2
      const dz = position.z - node.position[2]
      const value = dx * dx + dy * dy + dz * dz
      if (value < bestDistance) {
        bestDistance = value
        bestId = node.id
      }
    }
    return bestId
  }

  private estimateLocalCrowd(position: THREE.Vector3): number {
    const gx = Math.floor(position.x / 4)
    const gy = Math.floor(position.y / 3)
    const gz = Math.floor(position.z / 4)
    let count = 0
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        count += this.crowdGrid.get(`${gx + dx}/${gy}/${gz + dz}`) ?? 0
      }
    }
    return count
  }

  private refreshStats(): void {
    let waiting = 0
    let riding = 0
    let moving = 0
    let lost = 0
    let active = 0
    for (const passenger of this.passengers) {
      if (!passenger.active) continue
      active += 1
      if (passenger.state === 'waiting') waiting += 1
      if (passenger.state === 'riding') riding += 1
      if (
        passenger.state === 'entering' ||
        passenger.state === 'to_platform' ||
        passenger.state === 'boarding' ||
        passenger.state === 'alighting' ||
        passenger.state === 'exiting'
      ) {
        moving += 1
      }
      if (passenger.state === 'lost') lost += 1
    }

    let densitySum = 0
    for (const count of this.nodeCounts.values()) densitySum += count

    this.stats.passengers = active
    this.stats.waiting = waiting
    this.stats.riding = riding
    this.stats.moving = moving
    this.stats.lost = lost
    this.stats.train1Passengers = this.trains[0].passengers.length
    this.stats.train2Passengers = this.trains[1].passengers.length
    this.stats.averageDensity = this.nodeCounts.size ? densitySum / this.nodeCounts.size : 0
  }
}

export function getPassengerColor(passenger: Passenger): THREE.Color {
  if (passenger.state === 'lost') return stateColors.lost
  if (passenger.state === 'waiting') return stateColors.waiting
  if (passenger.state === 'riding') return stateColors.riding
  if (passenger.state === 'boarding') return stateColors.boarding
  return stateColors.moving
}
