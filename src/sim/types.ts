import * as THREE from 'three'

export type Vec3 = [number, number, number]

export type GraphNodeKind =
  | 'entrance'
  | 'unpaid'
  | 'gate'
  | 'paid'
  | 'landing'
  | 'door'
  | 'platform'

export type PassengerState =
  | 'entering'
  | 'to_platform'
  | 'waiting'
  | 'boarding'
  | 'riding'
  | 'alighting'
  | 'exiting'
  | 'lost'

export type TrainPhase = 'inbound' | 'dwell' | 'outbound'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  position: Vec3
  gateId?: string
  passageId?: string
  platform?: 0 | 1
  doorIndex?: number
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  weight: number
  kind: 'walk' | 'gate' | 'escalator' | 'stairs'
  gateId?: string
  passageId?: string
}

export interface GateInfo {
  id: string
  label: string
  position: Vec3
  open: boolean
  flow: number
}

export interface PassageInfo {
  id: string
  label: string
  type: 'escalator' | 'stairs'
  platform: 0 | 1
  open: boolean
  flow: number
}

export interface Passenger {
  id: number
  meshIndex: number
  active: boolean
  state: PassengerState
  position: THREE.Vector3
  targetPlatform: 0 | 1
  path: string[]
  pathIndex: number
  routeVersion: number
  speed: number
  waitDoor: number | null
  targetDoor: number
  exitId: string | null
  trainId: number | null
  laneOffset: number
  repathCooldown: number
  lifetime: number
  visible: boolean
}

export interface TrainSnapshot {
  id: number
  platform: 0 | 1
  phase: TrainPhase
  position: Vec3
  doorsOpen: boolean
  passengers: number
  capacity: number
  countdown: number
}

export interface SimulationStats {
  passengers: number
  waiting: number
  riding: number
  moving: number
  lost: number
  served: number
  train1Passengers: number
  train2Passengers: number
  averageDensity: number
  routeVersion: number
  running: boolean
  speed: number
  spawnRate: number
  maxPassengers: number
}

export interface SimulationOptions {
  spawnRate: number
  maxPassengers: number
  speed: number
  running: boolean
}
