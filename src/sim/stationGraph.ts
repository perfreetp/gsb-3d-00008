import type { GateInfo, GraphEdge, GraphNode, PassageInfo, Vec3 } from './types'

export const HALL_Y = 0
export const PLATFORM_Y: [number, number] = [-6.5, -13]
export const HALL_Z = 18
export const PLATFORM_LANDING_Z = 12
export const DOOR_Z = 4
export const FAR_PLATFORM_Z = -2
export const TRAIN_Z: [number, number] = [-8, -20]
export const TRAIN_DOOR_X = [-40, -20, 0, 20, 40]

export const gateDefinitions = [
  { id: 'gate-1', x: -35 },
  { id: 'gate-2', x: -21 },
  { id: 'gate-3', x: -7 },
  { id: 'gate-4', x: 7 },
  { id: 'gate-5', x: 21 },
  { id: 'gate-6', x: 35 },
]

export const passageDefinitions = [
  { id: 'p0-escalator', label: '1号站台 · 西扶梯', platform: 0 as const, x: -36, type: 'escalator' as const },
  { id: 'p0-stairs', label: '1号站台 · 东楼梯', platform: 0 as const, x: 36, type: 'stairs' as const },
  { id: 'p1-escalator', label: '2号站台 · 中扶梯', platform: 1 as const, x: -18, type: 'escalator' as const },
  { id: 'p1-stairs', label: '2号站台 · 中楼梯', platform: 1 as const, x: 18, type: 'stairs' as const },
]

export function createGates(): GateInfo[] {
  return gateDefinitions.map((gate, index) => ({
    id: gate.id,
    label: `闸机 ${index + 1}`,
    position: [gate.x, HALL_Y, 33],
    open: true,
    flow: 0,
  }))
}

export function createPassages(): PassageInfo[] {
  return passageDefinitions.map((passage) => ({
    ...passage,
    open: true,
    flow: 0,
  }))
}

function node(
  id: string,
  kind: GraphNode['kind'],
  position: Vec3,
  extra: Partial<GraphNode> = {},
): GraphNode {
  return { id, kind, position, ...extra }
}

function connect(
  edges: GraphEdge[],
  from: string,
  to: string,
  kind: GraphEdge['kind'],
  idOverride?: string,
): void {
  const id = idOverride ?? `${from}--${to}`
  if (edges.some((edge) => edge.id === id)) return
  edges.push({ id, from, to, weight: 1, kind })
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function buildStationGraph(gates: GateInfo[], passages: PassageInfo[]) {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const entranceXs = [-36, 0, 36]
  entranceXs.forEach((x, index) => {
    nodes.push(node(`entrance-${index}`, 'entrance', [x, HALL_Y, 54]))
  })

  const unpaidXs = [-50, -25, 0, 25, 50]
  unpaidXs.forEach((x) => {
    nodes.push(node(`unpaid-${x}`, 'unpaid', [x, HALL_Y, 44]))
  })

  for (let index = 0; index < unpaidXs.length - 1; index += 1) {
    connect(edges, `unpaid-${unpaidXs[index]}`, `unpaid-${unpaidXs[index + 1]}`, 'walk')
  }

  entranceXs.forEach((x, entranceIndex) => {
    const nearest = [...unpaidXs].sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0]
    connect(edges, `entrance-${entranceIndex}`, `unpaid-${nearest}`, 'walk')
  })

  gates.forEach((gate) => {
    const definition = gateDefinitions.find((item) => item.id === gate.id)!
    nodes.push(node(gate.id, 'gate', [definition.x, HALL_Y, 33], { gateId: gate.id }))

    const southNearest = [...unpaidXs].sort(
      (a, b) => Math.abs(a - definition.x) - Math.abs(b - definition.x),
    )[0]
    connect(edges, `unpaid-${southNearest}`, gate.id, 'walk')
  })

  const paidXs = [-50, -25, 0, 25, 50]
  paidXs.forEach((x) => {
    nodes.push(node(`paid-${x}`, 'paid', [x, HALL_Y, 24]))
  })

  for (let index = 0; index < paidXs.length - 1; index += 1) {
    connect(edges, `paid-${paidXs[index]}`, `paid-${paidXs[index + 1]}`, 'walk')
  }

  gates.forEach((gate) => {
    const definition = gateDefinitions.find((item) => item.id === gate.id)!
    const northNearest = [...paidXs].sort(
      (a, b) => Math.abs(a - definition.x) - Math.abs(b - definition.x),
    )[0]
    const edgeId = `${gate.id}--paid-${northNearest}`
    connect(edges, gate.id, `paid-${northNearest}`, 'gate', edgeId)
    const gateEdge = edges.find((edge) => edge.id === edgeId)!
    gateEdge.gateId = gate.id
  })

  passageDefinitions.forEach((passage) => {
    const hallId = `hall-landing-${passage.platform}-${passage.type}`
    const platformLandingId = `platform-landing-${passage.platform}-${passage.type}`
    nodes.push(node(hallId, 'landing', [passage.x, HALL_Y, HALL_Z], { passageId: passage.id }))
    nodes.push(
      node(platformLandingId, 'landing', [passage.x, PLATFORM_Y[passage.platform], PLATFORM_LANDING_Z], {
        passageId: passage.id,
        platform: passage.platform,
      }),
    )

    const hallPaid = passage.x < 0 ? -50 : 50
    connect(edges, `paid-${hallPaid}`, hallId, 'walk')

    const edgeKind = passage.type === 'escalator' ? 'escalator' : 'stairs'
    connect(edges, hallId, platformLandingId, edgeKind, passage.id)
    const passageEdge = edges.find((edge) => edge.id === passage.id)!
    passageEdge.passageId = passage.id

    nodes.push(
      node(
        `corridor-${passage.platform}-${passage.type}-side`,
        'platform',
        [passage.x, PLATFORM_Y[passage.platform], 4],
        { platform: passage.platform },
      ),
    )
    connect(edges, platformLandingId, `corridor-${passage.platform}-${passage.type}-side`, 'walk')
  })

  for (const platform of [0, 1] as const) {
    TRAIN_DOOR_X.forEach((x, doorIndex) => {
      nodes.push(
        node(`door-p${platform}-${doorIndex}`, 'door', [x, PLATFORM_Y[platform], DOOR_Z], {
          platform,
          doorIndex,
        }),
      )
    })

    const farXs = [-50, -25, 0, 25, 50]
    farXs.forEach((x) => {
      nodes.push(
        node(`far-p${platform}-${x}`, 'platform', [x, PLATFORM_Y[platform], FAR_PLATFORM_Z], {
          platform,
        }),
      )
    })

    for (let index = 0; index < farXs.length - 1; index += 1) {
      connect(edges, `far-p${platform}-${farXs[index]}`, `far-p${platform}-${farXs[index + 1]}`, 'walk')
    }

    TRAIN_DOOR_X.forEach((x, doorIndex) => {
      const alignedFar = [...farXs].sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0]
      connect(edges, `door-p${platform}-${doorIndex}`, `far-p${platform}-${alignedFar}`, 'walk')
    })

    for (let doorIndex = 0; doorIndex < TRAIN_DOOR_X.length - 1; doorIndex += 1) {
      connect(edges, `door-p${platform}-${doorIndex}`, `door-p${platform}-${doorIndex + 1}`, 'walk')
    }

    connect(edges, `corridor-${platform}-escalator-side`, `door-p${platform}-0`, 'walk')
    if (platform === 1) connect(edges, `corridor-${platform}-escalator-side`, 'door-p1-1', 'walk')
    connect(edges, `corridor-${platform}-stairs-side`, `door-p${platform}-${TRAIN_DOOR_X.length - 1}`, 'walk')
    if (platform === 1) connect(edges, `corridor-${platform}-stairs-side`, 'door-p1-3', 'walk')
  }

  const nodeMap = new Map(nodes.map((item) => [item.id, item]))
  edges.forEach((edge) => {
    const from = nodeMap.get(edge.from)!
    const to = nodeMap.get(edge.to)!
    edge.weight = distance(from.position, to.position)
    if (edge.kind === 'escalator') edge.weight *= 1.08
    if (edge.kind === 'stairs') edge.weight *= 1.45
  })

  const adjacency = new Map<string, Array<{ edge: GraphEdge; neighborId: string }>>()
  nodes.forEach((item) => adjacency.set(item.id, []))
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push({ edge, neighborId: edge.to })
    adjacency.get(edge.to)?.push({ edge, neighborId: edge.from })
  })

  function edgeOpen(edge: GraphEdge): boolean {
    if (edge.gateId) return gates.find((gate) => gate.id === edge.gateId)?.open ?? true
    if (edge.passageId) {
      return passages.find((passage) => passage.id === edge.passageId)?.open ?? true
    }
    return true
  }

  function findPath(
    startId: string,
    targetId: string,
    congestion: ReadonlyMap<string, number> = new Map(),
  ): string[] {
    if (!nodeMap.has(startId) || !nodeMap.has(targetId)) return []
    const distances = new Map<string, number>([[startId, 0]])
    const previous = new Map<string, string>()
    const visited = new Set<string>()

    while (visited.size < nodes.length) {
      let currentId: string | null = null
      let currentDistance = Number.POSITIVE_INFINITY
      for (const [id, value] of distances) {
        if (!visited.has(id) && value < currentDistance) {
          currentId = id
          currentDistance = value
        }
      }
      if (currentId === null) break
      if (currentId === targetId) break
      visited.add(currentId)

      for (const relation of adjacency.get(currentId) ?? []) {
        if (!edgeOpen(relation.edge)) continue
        const targetNode = nodeMap.get(relation.neighborId)!
        const crowdFactor = 1 + Math.min(1.8, (congestion.get(targetNode.id) ?? 0) / 7)
        const candidate = currentDistance + relation.edge.weight * crowdFactor
        if (candidate < (distances.get(relation.neighborId) ?? Number.POSITIVE_INFINITY)) {
          distances.set(relation.neighborId, candidate)
          previous.set(relation.neighborId, currentId)
        }
      }
    }

    if (!previous.has(targetId) && startId !== targetId) return []
    const result: string[] = []
    let cursor: string | undefined = targetId
    while (cursor) {
      result.unshift(cursor)
      cursor = previous.get(cursor)
    }
    return result[0] === startId ? result : []
  }

  return { nodes, edges, nodeMap, adjacency, findPath, edgeOpen }
}

export type StationGraph = ReturnType<typeof buildStationGraph>
