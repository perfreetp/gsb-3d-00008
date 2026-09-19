import { LAYOUT } from './layout'
import type { FloorId, NavEdge, NavNode, NodeKind } from './types'

const H = LAYOUT.hall
const GATE_Z = LAYOUT.gateRow.z
const STEP = LAYOUT.gridStep

interface GateMeta {
  id: number
  x: number
  node: number
}

interface PassageMeta {
  id: string
  platformId: number
  type: 'escalator' | 'stairs'
  top: { x: number; z: number; node: number }
  bottom: { x: number; z: number; node: number }
}

interface SlotMeta {
  id: string
  platformId: number
  doorZ: number
  node: number
  occupiedBy: number | null
}

const dirs = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
]

export class NavGraph {
  nodes: NavNode[] = []
  edges: NavEdge[] = []
  adjacency = new Map<number, NavEdge[]>()

  gates: GateMeta[] = []
  passages: PassageMeta[] = []
  slots: SlotMeta[] = []
  entrances: { id: number; node: number }[] = []

  private closedGates = new Set<number>()
  private closedPassages = new Set<string>()

  private addNode(x: number, y: number, z: number, floor: FloorId, kind: NodeKind, extra: Partial<NavNode> = {}): number {
    const id = this.nodes.length
    this.nodes.push({ id, x, y, z, floor, kind, ...extra })
    return id
  }

  private addEdge(a: number, b: number, kind: NavEdge['kind'], gateId?: number, passId?: string, costOverride?: number) {
    const na = this.nodes[a]
    const nb = this.nodes[b]
    const dx = na.x - nb.x
    const dz = na.z - nb.z
    let cost = costOverride ?? Math.sqrt(dx * dx + dz * dz)
    if (kind === 'gate') cost = Math.max(cost, 2.5)
    const edge: NavEdge = { a, b, cost, kind, gateId, passId }
    this.edges.push(edge)
    this.pushEdge(a, edge)
    this.pushEdge(b, edge)
  }

  private pushEdge(nodeId: number, edge: NavEdge) {
    let list = this.adjacency.get(nodeId)
    if (!list) {
      list = []
      this.adjacency.set(nodeId, list)
    }
    list.push(edge)
  }

  isClosed(edge: NavEdge): boolean {
    if (edge.gateId !== undefined && this.closedGates.has(edge.gateId)) return true
    if (edge.passId !== undefined && this.closedPassages.has(edge.passId)) return true
    return false
  }

  setGateClosed(gateId: number, closed: boolean) {
    if (closed) this.closedGates.add(gateId)
    else this.closedGates.delete(gateId)
  }

  setPassageClosed(passId: string, closed: boolean) {
    if (closed) this.closedPassages.add(passId)
    else this.closedPassages.delete(passId)
  }

  build() {
    this.buildHall()
    for (const p of LAYOUT.platforms) {
      this.buildPlatform(p)
    }
  }

  private nearestGrid(x: number, z: number, grid: Map<string, number>): number {
    let best = -1
    let bestD = Infinity
    for (const [key, id] of grid) {
      const [gx, gz] = key.split(',').map(Number)
      const d = (gx - x) ** 2 + (gz - z) ** 2
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }

  private connectGrid(grid: Map<string, number>, xMin: number, xMax: number, zMin: number, zMax: number) {
    const xs: number[] = []
    for (let x = xMin; x <= xMax + 1e-6; x += STEP) xs.push(x)
    const zList: number[] = []
    for (let z = zMin; z <= zMax + 1e-6; z += STEP) zList.push(z)

    for (const x of xs) {
      for (const z of zList) {
        const id = grid.get(`${x},${z}`)!
        for (const [dx, dz] of dirs) {
          const neighbor = grid.get(`${x + dx * STEP},${z + dz * STEP}`)
          if (neighbor === undefined || neighbor <= id) continue
          const cost = dx !== 0 && dz !== 0 ? STEP * Math.SQRT2 : STEP
          this.addEdge(id, neighbor, 'walk', undefined, undefined, cost)
        }
      }
    }
  }

  private buildHall() {
    const paid = new Map<string, number>()
    const unpaid = new Map<string, number>()

    const paidZMin = H.zMin
    const paidZMax = GATE_Z - STEP
    const unpaidZMin = GATE_Z + STEP
    const unpaidZMax = H.zMax

    const inPaid = (x: number, z: number) =>
      z <= paidZMax && !(x > H.cutout.xMin && x < H.cutout.xMax && z > H.cutout.zMin && z < H.cutout.zMax)

    for (let x = H.xMin; x <= H.xMax + 1e-6; x += STEP) {
      for (let z = paidZMin; z <= paidZMax + 1e-6; z += STEP) {
        if (!inPaid(x, z)) continue
        paid.set(`${x},${z}`, this.addNode(x, H.floorY + 0.05, z, 0, 'grid'))
      }
      for (let z = unpaidZMin; z <= unpaidZMax + 1e-6; z += STEP) {
        unpaid.set(`${x},${z}`, this.addNode(x, H.floorY + 0.05, z, 0, 'grid'))
      }
    }

    const paidXs = [H.xMin, H.xMax]
    void paidXs
    this.connectGridFiltered(paid)
    this.connectGrid(unpaid, H.xMin, H.xMax, unpaidZMin, unpaidZMax)

    for (let i = 0; i < LAYOUT.gateXs.length; i++) {
      const x = LAYOUT.gateXs[i]
      const gateId = i
      const node = this.addNode(x, H.floorY + 0.05, GATE_Z, 0, 'gate', { gateId })
      this.gates.push({ id: gateId, x, node })
      const paidLink = this.nearestGrid(x, paidZMax, paid)
      const unpaidLink = this.nearestGrid(x, unpaidZMin, unpaid)
      this.addEdge(paidLink, node, 'gate', gateId)
      this.addEdge(node, unpaidLink, 'walk')
    }

    for (const e of LAYOUT.entrances) {
      const node = this.addNode(e.x, H.floorY + 0.05, e.z, 0, 'entrance')
      this.entrances.push({ id: e.id, node })
      const link = this.nearestGrid(e.x, unpaidZMax, unpaid)
      this.addEdge(node, link, 'walk')
    }

    for (const esc of LAYOUT.escalators) {
      const top = this.addNode(esc.topX, H.floorY + 0.05, esc.topZ, 0, 'landing', { passId: esc.id })
      const bottom = this.addNode(esc.botX, 0.05, esc.botZ, esc.platformId as FloorId, 'landing', { passId: esc.id })
      this.addEdge(top, bottom, 'passage', undefined, esc.id, 12)
      this.passages.push({
        id: esc.id,
        platformId: esc.platformId,
        type: 'escalator',
        top: { x: esc.topX, z: esc.topZ, node: top },
        bottom: { x: esc.botX, z: esc.botZ, node: bottom }
      })
    }
    for (const st of LAYOUT.stairs) {
      const top = this.addNode(st.topX, H.floorY + 0.05, st.topZ, 0, 'landing')
      const bottom = this.addNode(st.botX, 0.05, st.botZ, st.platformId as FloorId, 'landing')
      this.addEdge(top, bottom, 'passage', undefined, st.id, 16)
      this.passages.push({
        id: st.id,
        platformId: st.platformId,
        type: 'stairs',
        top: { x: st.topX, z: st.topZ, node: top },
        bottom: { x: st.botX, z: st.botZ, node: bottom }
      })
    }

    for (const pass of this.passages) {
      const link = this.nearestGrid(pass.top.x, pass.top.z, paid)
      this.addEdge(pass.top.node, link, 'walk')
    }
  }

  private connectGridFiltered(grid: Map<string, number>) {
    for (const [key, id] of grid) {
      const [x, z] = key.split(',').map(Number)
      for (const [dx, dz] of dirs) {
        const neighbor = grid.get(`${x + dx * STEP},${z + dz * STEP}`)
        if (neighbor === undefined || neighbor <= id) continue
        const cost = dx !== 0 && dz !== 0 ? STEP * Math.SQRT2 : STEP
        this.addEdge(id, neighbor, 'walk', undefined, undefined, cost)
      }
    }
  }

  private buildPlatform(platform: (typeof LAYOUT.platforms)[number]) {
    const { id: platformId, xMin, xMax, zMin, zMax, floorY, slotX } = platform
    const grid = new Map<string, number>()
    const floor = platformId as FloorId
    for (let x = xMin; x <= xMax + 1e-6; x += STEP) {
      for (let z = zMin; z <= zMax + 1e-6; z += STEP) {
        grid.set(`${x},${z}`, this.addNode(x, floorY + 0.05, z, floor, 'grid'))
      }
    }
    this.connectGrid(grid, xMin, xMax, zMin, zMax)

    const doorZs = this.trainDoorZs()
    doorZs.forEach((doorZ, doorIndex) => {
      if (doorZ < zMin + 1 || doorZ > zMax - 1) return
      const node = this.addNode(slotX, floorY + 0.05, doorZ, floor, 'slot', { slotId: `${platformId}-${doorIndex}` })
      const link = this.nearestGrid(slotX, doorZ, grid)
      this.addEdge(link, node, 'walk', undefined, undefined, 1.2)
      this.slots.push({ id: `${platformId}-${doorIndex}`, platformId, doorZ, node, occupiedBy: null })
    })

    for (const pass of this.passages.filter((p) => p.platformId === platformId)) {
      const link = this.nearestGrid(pass.bottom.x, pass.bottom.z, grid)
      this.addEdge(pass.bottom.node, link, 'walk')
    }
  }

  trainDoorZs(): number[] {
    const t = LAYOUT.train
    const zs: number[] = []
    for (let z = -t.halfTrain + 2; z <= t.halfTrain - 2; z += 2) zs.push(z)
    return zs
  }

  trainRealDoorZs(): number[] {
    const t = LAYOUT.train
    const zs: number[] = []
    for (let c = 0; c < t.cars; c++) {
      const carStart = -t.halfTrain + c * t.carLength
      zs.push(carStart + t.carLength / 2 - t.doorSpacing / 2)
      zs.push(carStart + t.carLength / 2 + t.doorSpacing / 2)
    }
    return zs
  }

  freeSlotsFor(platformId: number): SlotMeta[] {
    return this.slots.filter((s) => s.platformId === platformId && s.occupiedBy === null)
  }

  nearestFreeSlot(platformId: number, x: number, z: number): SlotMeta | undefined {
    const free = this.freeSlotsFor(platformId)
    if (free.length === 0) return undefined
    let best: SlotMeta | undefined
    let bestD = Infinity
    for (const s of free) {
      const n = this.nodes[s.node]
      const d = (n.x - x) ** 2 + (n.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  nearestNodeTo(x: number, z: number, floor: FloorId, predicate?: (n: NavNode) => boolean): number {
    let best = -1
    let bestD = Infinity
    for (const n of this.nodes) {
      if (n.floor !== floor) continue
      if (predicate && !predicate(n)) continue
      const d = (n.x - x) ** 2 + (n.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = n.id
      }
    }
    return best
  }

  private heapPush(heap: number[], key: Float64Array, node: number) {
    heap.push(node)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (key[heap[parent]] <= key[heap[i]]) break
      ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    }
  }

  private heapPop(heap: number[], key: Float64Array): number {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      const n = heap.length
      while (true) {
        const l = i * 2 + 1
        const r = l + 1
        let smallest = i
        if (l < n && key[heap[l]] < key[heap[smallest]]) smallest = l
        if (r < n && key[heap[r]] < key[heap[smallest]]) smallest = r
        if (smallest === i) break
        ;[heap[i], heap[smallest]] = [heap[smallest], heap[i]]
        i = smallest
      }
    }
    return top
  }

  findPath(start: number, goal: number): NavNode[] | null {
    if (start === goal) return [this.nodes[start]]
    const count = this.nodes.length
    const gScore = new Float64Array(count).fill(Infinity)
    const fScore = new Float64Array(count).fill(Infinity)
    const cameFrom = new Int32Array(count).fill(-1)
    const closed = new Uint8Array(count)
    const inOpen = new Uint8Array(count)
    gScore[start] = 0

    const heuristic = (id: number): number => {
      const a = this.nodes[id]
      const b = this.nodes[goal]
      const dx = a.x - b.x
      const dz = a.z - b.z
      const dy = Math.abs(a.y - b.y) * 0.3
      return Math.sqrt(dx * dx + dz * dz) + dy
    }
    fScore[start] = heuristic(start)
    const heap: number[] = [start]
    inOpen[start] = 1

    while (heap.length > 0) {
      const current = this.heapPop(heap, fScore)
      inOpen[current] = 0
      if (current === goal) {
        const path = [this.nodes[goal]]
        let cur = current
        while (cameFrom[cur] !== -1) {
          cur = cameFrom[cur]
          path.unshift(this.nodes[cur])
        }
        return path
      }
      if (closed[current]) continue
      closed[current] = 1
      const neighbors = this.adjacency.get(current) ?? []
      for (const edge of neighbors) {
        if (this.isClosed(edge)) continue
        const next = edge.a === current ? edge.b : edge.a
        if (closed[next]) continue
        const tentative = gScore[current] + edge.cost
        if (tentative < gScore[next]) {
          cameFrom[next] = current
          gScore[next] = tentative
          fScore[next] = tentative + heuristic(next)
          if (!inOpen[next]) {
            this.heapPush(heap, fScore, next)
            inOpen[next] = 1
          } else {
            this.heapPush(heap, fScore, next)
          }
        }
      }
    }
    return null
  }
}
