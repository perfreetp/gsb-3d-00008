import * as THREE from 'three'
import { reactive } from 'vue'
import { LAYOUT } from './layout'
import { NavGraph } from './navgraph'
import { buildStation, updatePsds, type GateView, type PassageView, type PsdView, type StationHandles } from './station'
import { Heatmap } from './heatmap'
import { Passenger, PassengerRenderer } from './passengers'
import { Train } from './train'
import type { ClosedState, NavNode, Stats } from './types'

export interface SimOptions {
  spawnRate: number
  maxPassengers: number
  heatmap: boolean
}

export class Simulation {
  scene = new THREE.Scene()
  graph = new NavGraph()
  passengers: Passenger[] = []
  trains: Train[] = []

  running = true
  time = 0
  spawnAccumulator = 0
  stats: Stats
  closed: ClosedState = { gates: {}, passages: {} }

  options: SimOptions = { spawnRate: 6, maxPassengers: 300, heatmap: true }

  private handles!: StationHandles
  private heatmap!: Heatmap
  private renderer!: PassengerRenderer
  private heatTimer = 0
  private waitingRepath = new Map<number, number>()
  private counters = { spawned: 0, boarded: 0, alighted: 0, exited: 0, blocked: 0 }

  constructor() {
    this.stats = reactive(this.freshStats()) as Stats
    this.closed = reactive({ gates: {}, passages: {} }) as ClosedState
  }

  private freshStats(): Stats {
    return {
      totalSpawned: 0,
      totalBoarded: 0,
      totalAlighted: 0,
      totalExited: 0,
      active: 0,
      waiting: 0,
      onboard: 0,
      avgHeat: 0,
      blockedRoutes: 0,
      trains: []
    }
  }

  init() {
    this.graph.build()
    const built = buildStation()
    this.scene.add(built.root)
    this.handles = built.handles

    this.trains = [
      new Train(1, 0),
      new Train(2, LAYOUT.train.headway / LAYOUT.train.speed)
    ]
    for (const t of this.trains) this.scene.add(t.group)

    this.renderer = new PassengerRenderer(this.options.maxPassengers + 40)
    this.scene.add(this.renderer.mesh)

    this.heatmap = new Heatmap([
      { xMin: LAYOUT.hall.xMin, xMax: LAYOUT.hall.xMax, zMin: LAYOUT.hall.zMin, zMax: LAYOUT.hall.zMax, cell: 1.25, y: LAYOUT.hall.floorY + 0.12 },
      ...LAYOUT.platforms.map((p) => ({ xMin: p.xMin, xMax: p.xMax, zMin: p.zMin, zMax: p.zMax, cell: 1.25, y: p.floorY + 0.12 }))
    ])
    this.scene.add(this.heatmap.group)
  }

  get gateViews(): GateView[] {
    return this.handles.gateViews
  }

  get passageViews(): PassageView[] {
    return this.handles.passageViews
  }

  get psds(): PsdView[] {
    return this.handles.psds
  }

  setSpawnRate(rate: number) {
    this.options.spawnRate = rate
  }

  setHeatmapVisible(v: boolean) {
    this.options.heatmap = v
    this.heatmap.setVisible(v)
  }

  setGateClosed(gateId: number, closed: boolean) {
    this.closed.gates[gateId] = closed
    this.graph.setGateClosed(gateId, closed)
    const view = this.handles.gateViews.find((g) => g.gateId === gateId)
    view?.setClosed(closed)
    this.repathAll('gate')
  }

  setPassageClosed(passId: string, closed: boolean) {
    this.closed.passages[passId] = closed
    this.graph.setPassageClosed(passId, closed)
    const view = this.handles.passageViews.find((p) => p.id === passId)
    view?.setClosed(closed)
    this.repathAll('passage')
  }

  toggleGate(gateId: number) {
    this.setGateClosed(gateId, !this.closed.gates[gateId])
  }

  togglePassage(passId: string) {
    this.setPassageClosed(passId, !this.closed.passages[passId])
  }

  private repathAll(reason: 'gate' | 'passage') {
    let blocked = 0
    for (const p of this.passengers) {
      if (p.state === 'boarding' || p.state === 'alighting' || p.state === 'exiting') continue
      const ok = this.planRoute(p, true)
      if (!ok) blocked++
    }
    if (reason) this.counters.blocked += blocked
  }

  private nodeNear(x: number, z: number, floor: number) {
    return this.graph.nearestNodeTo(x, z, floor as 0 | 1 | 2, (n) => n.kind === 'grid')
  }

  private floorOf(p: Passenger): 0 | 1 | 2 {
    if (p.pos.y > 4) return 0
    return p.targetPlatform
  }

  private routeStart(p: Passenger): number {
    const floor = this.floorOf(p)
    return this.nodeNear(p.pos.x, p.pos.z, floor)
  }

  private planRoute(p: Passenger, fromCurrent = false): boolean {
    const start = fromCurrent ? this.routeStart(p) : p.startNodeId
    if (p.state === 'toExit' || p.state === 'exiting' || p.state === 'alighting') {
      return this.planToNearest(p, start, this.graph.entrances.map((e) => e.node))
    }

    if (p.pos.y > 4) {
      const goals = this.graph.passages.filter((ps) => ps.platformId === p.targetPlatform).map((ps) => ps.bottom.node)
      const ok = this.planToNearest(p, start, goals)
      if (ok) {
        if (p.slotId) {
          const old = this.graph.slots.find((sl) => sl.id === p.slotId)
          if (old) old.occupiedBy = null
        }
        p.slotId = null
        p.setState(fromCurrent && p.state === 'toPlatform' ? 'toPlatform' : 'toGate')
        p.repathTimer = 1
      }
      return ok
    }

    const slot = this.graph.nearestFreeSlot(p.targetPlatform, p.pos.x, p.pos.z)
    if (slot) {
      const path = this.graph.findPath(start, slot.node)
      if (path) {
        p.setPath(path, 0)
        p.slotId = slot.id
        slot.occupiedBy = p.id
        p.setState('toPlatform')
        return true
      }
    }

    const goals = this.graph.passages
      .filter((ps) => ps.platformId === p.targetPlatform)
      .map((ps) => ps.bottom.node)
    const ok = this.planToNearest(p, start, goals)
    if (ok) {
      p.slotId = null
      p.setState('toPlatform')
      p.repathTimer = 0.6
    }
    return ok
  }

  private planToNearest(p: Passenger, start: number, goals: number[]): boolean {
    let best: NavNode[] | null = null
    for (const g of goals) {
      const path = this.graph.findPath(start, g)
      if (path && (best === null || path.length < best.length)) best = path
    }
    if (!best) return false
    p.setPath(best, 0)
    return true
  }

  private spawnPassenger() {
    const entrance = this.graph.entrances[Math.floor(Math.random() * this.graph.entrances.length)]
    const startNode = this.graph.nodes[entrance.node]
    const targetPlatform = (Math.random() < 0.5 ? 1 : 2) as 1 | 2
    const p = new Passenger(startNode, targetPlatform)
    const planned = this.planRoute(p, false)
    if (!planned) return
    this.passengers.push(p)
    this.counters.spawned++
  }

  update(dt: number) {
    if (!this.running) return
    this.time += dt

    this.spawnAccumulator += dt * this.options.spawnRate
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1
      if (this.passengers.length < this.options.maxPassengers) this.spawnPassenger()
    }

    for (const train of this.trains) {
      const event = train.update(dt)
      const psd = this.handles.psds.find((pv) => pv.platformId === train.platformId)
      if (psd) {
        for (const panel of psd.panels) panel.target = train.doorsProgress
      }
      if (event.arrived) this.onTrainArrived(train)
      if (event.depart) this.onTrainDepart(train)
      if (train.isPastEnd) train.reset(0)
    }
    updatePsds(this.handles.psds, dt)

    this.updatePassengers(dt)
    for (const train of this.trains) this.boardWaitingPassengers(dt, train)
    this.updateHeatmap(dt)
    this.updateStats()
  }

  private updatePassengers(dt: number) {
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i]
      if (p.done) {
        this.passengers.splice(i, 1)
        continue
      }

      p.repathTimer -= dt
      if (p.repathTimer <= 0 && (p.state === 'toGate' || p.state === 'toPlatform' || p.state === 'toExit')) {
        p.repathTimer = 1.2 + Math.random() * 1.5
        if (this.currentPathBlocked(p)) this.planRoute(p, true)
      }

      if (p.state === 'alighting') {
        p.stateTimer -= dt
        if (p.stateTimer <= 0) p.setState('toExit')
        p.update(dt)
        if (p.pathIndex >= p.path.length) this.handlePathEnd(p, null)
        continue
      }

      if (p.state === 'waiting') {
        const key = p.id
        const nextT = (this.waitingRepath.get(key) ?? 0) - dt
        if (nextT <= 0) {
          const train = this.trains.find((t) => t.platformId === p.targetPlatform)
          if (!train || train.state !== 'dwell' || train.doorsOpen < 0.6) {
            this.tryAssignSlot(p)
          }
          this.waitingRepath.set(key, 1 + Math.random())
        } else {
          this.waitingRepath.set(key, nextT)
        }
        continue
      }

      const before = p.pathIndex
      const res = p.update(dt)
      void before
      if (res.crossedPassage) {
        if (p.state === 'toGate' && p.pos.y < 4) p.setState('toPlatform')
        if (p.state === 'toExit' && p.pos.y > 4) p.setState('toExit')
      }
      if (p.pathIndex >= p.path.length) {
        this.handlePathEnd(p, res.arrivedAtNode)
      }
    }
  }

  private currentPathBlocked(p: Passenger): boolean {
    for (let i = Math.max(0, p.pathIndex - 1); i < p.path.length - 1; i++) {
      const a = p.path[i].id
      const b = p.path[i + 1].id
      const edges = this.graph.adjacency.get(a) ?? []
      const edge = edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))
      if (edge && this.graph.isClosed(edge)) return true
    }
    return false
  }

  private tryAssignSlot(p: Passenger) {
    const slot = this.graph.nearestFreeSlot(p.targetPlatform, p.pos.x, p.pos.z)
    if (!slot) return
    const start = this.nodeNear(p.pos.x, p.pos.z, p.targetPlatform)
    const path = this.graph.findPath(start, slot.node)
    if (!path) return
    if (p.slotId) {
      const old = this.graph.slots.find((s) => s.id === p.slotId)
      if (old) old.occupiedBy = null
    }
    p.slotId = slot.id
    slot.occupiedBy = p.id
    p.setPath(path, 0)
    p.setState('toPlatform')
  }

  private handlePathEnd(p: Passenger, end: NavNode | null) {
    if (!end) return
    if (end.kind === 'entrance' && (p.state === 'toExit' || p.state === 'exiting')) {
      p.done = true
      this.counters.exited++
      return
    }
    if (end.kind === 'slot') {
      p.setState('waiting')
      return
    }
    if (p.state === 'toGate' || p.state === 'toPlatform') {
      if (!this.planRoute(p, true)) {
        p.repathTimer = 1
      }
    }
  }

  private onTrainArrived(train: Train) {
    const platform = LAYOUT.platforms.find((p) => p.id === train.platformId)!
    const alightCount = train.onboard > 0 ? Math.floor(train.onboard * (0.45 + Math.random() * 0.35)) : 0
    for (let i = 0; i < alightCount; i++) {
      this.spawnAlighting(train, platform)
    }
    train.onboard = Math.max(0, train.onboard - alightCount)
    this.counters.alighted += alightCount
  }

  private spawnAlighting(train: Train, platform: (typeof LAYOUT.platforms)[number]) {
    const doorZ = train.doorZs[Math.floor(Math.random() * train.doorZs.length)]
    const spawnX = platform.edgeX + (platform.id === 1 ? -1.2 : 1.2)
    const startNode = this.graph.nearestNodeTo(spawnX, doorZ, platform.id as 1 | 2, (n) => n.kind === 'grid')
    const exitEntrances = this.graph.entrances.map((e) => e.node)
    let best: NavNode[] | null = null
    for (const g of exitEntrances) {
      const path = this.graph.findPath(startNode, g)
      if (path && (best === null || path.length < best.length)) best = path
    }
    if (!best) return
    const startNav = this.graph.nodes[startNode]
    const p = new Passenger(startNav, platform.id as 1 | 2)
    p.pos.set(startNav.x, 0.05, doorZ)
    p.setPath(best, 0)
    p.setState('alighting')
    p.stateTimer = 0.5
    this.passengers.push(p)
  }

  private onTrainDepart(train: Train) {
    for (const p of [...this.passengers]) {
      if (p.state !== 'waiting' || p.targetPlatform !== train.platformId) continue
      if (p.slotId) {
        const slot = this.graph.slots.find((s) => s.id === p.slotId)
        if (slot) slot.occupiedBy = null
        p.slotId = null
      }
      this.tryAssignSlot(p)
    }
  }

  private boardWaitingPassengers(dt: number, train: Train) {
    if (train.state !== 'dwell' || train.doorsOpen < 0.55) return
    const platform = LAYOUT.platforms.find((p) => p.id === train.platformId)!
    const capacityLeft = train.capacity - train.onboard
    let budget = Math.min(capacityLeft, Math.ceil(dt * 26))
    for (const p of this.passengers) {
      if (budget <= 0) break
      if (p.state !== 'waiting' || p.targetPlatform !== train.platformId || !p.slotId) continue
      const slot = this.graph.slots.find((s) => s.id === p.slotId)
      if (!slot) continue
      const atDoor = Math.abs(p.pos.z - slot.doorZ) < 0.9 && Math.abs(p.pos.x - platform.slotX) < 1.2
      if (!atDoor) continue
      slot.occupiedBy = null
      p.slotId = null
      p.done = true
      train.onboard++
      this.counters.boarded++
      budget--
    }
  }

  private updateHeatmap(dt: number) {
    this.heatTimer -= dt
    this.heatmap.publish(0.8)
    if (this.options.heatmap) {
      for (const p of this.passengers) {
        if (p.state === 'waiting') this.heatmap.addPoint(p.pos.x, p.pos.y, p.pos.z, 1.4)
        else this.heatmap.addPoint(p.pos.x, p.pos.y, p.pos.z, 0.7)
      }
    }
  }

  private updateStats() {
    const waiting = this.passengers.filter((p) => p.state === 'waiting').length
    this.stats.totalSpawned = this.counters.spawned
    this.stats.totalBoarded = this.counters.boarded
    this.stats.totalAlighted = this.counters.alighted
    this.stats.totalExited = this.counters.exited
    this.stats.active = this.passengers.length
    this.stats.waiting = waiting
    this.stats.onboard = this.trains.reduce((sum, t) => sum + t.onboard, 0)
    this.stats.avgHeat = this.heatmap.averageIntensity()
    this.stats.blockedRoutes = this.counters.blocked
    this.stats.trains = this.trains.map((t) => ({
      platformId: t.platformId,
      onboard: t.onboard,
      state: t.state === 'dwell' ? '停靠中' : t.state === 'inbound' ? '进站中' : '离站中',
      tta: Number.isFinite(t.tta) ? Math.max(0, t.tta) : -1
    }))
  }

  syncRender() {
    this.renderer.sync(this.passengers)
  }

  pickGate(raycaster: THREE.Raycaster): number | null {
    const meshes: THREE.Object3D[] = []
    this.handles.gateViews.forEach((g) => g.group.traverse((o) => meshes.push(o)))
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length === 0) return null
    let obj: THREE.Object3D | null = hits[0].object
    while (obj && obj.userData.gateId === undefined) obj = obj.parent
    return obj && obj.userData.gateId !== undefined ? (obj.userData.gateId as number) : null
  }

  pickPassage(raycaster: THREE.Raycaster): string | null {
    const banners = this.handles.passageViews.map((p) => p.banner)
    const hits = raycaster.intersectObjects(banners, false)
    if (hits.length === 0) return null
    const found = this.handles.passageViews.find((p) => p.banner === hits[0].object)
    return found ? found.id : null
  }

  dispose() {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
  }
}
