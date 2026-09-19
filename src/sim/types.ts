export type PassengerState =
  | 'toGate'
  | 'toPlatform'
  | 'waiting'
  | 'boarding'
  | 'alighting'
  | 'toExit'
  | 'exiting'

export type FloorId = 0 | 1 | 2

export type NodeKind =
  | 'grid'
  | 'entrance'
  | 'gate'
  | 'landing'
  | 'slot'
  | 'door'

export interface NavNode {
  id: number
  x: number
  y: number
  z: number
  floor: FloorId
  kind: NodeKind
  gateId?: number
  passId?: string
  slotId?: string
}

export interface NavEdge {
  a: number
  b: number
  cost: number
  kind: 'walk' | 'gate' | 'passage'
  gateId?: number
  passId?: string
}

export interface Stats {
  totalSpawned: number
  totalBoarded: number
  totalAlighted: number
  totalExited: number
  active: number
  waiting: number
  onboard: number
  avgHeat: number
  blockedRoutes: number
  trains: { platformId: number; onboard: number; state: string; tta: number }[]
}

export interface ClosedState {
  gates: Record<number, boolean>
  passages: Record<string, boolean>
}
