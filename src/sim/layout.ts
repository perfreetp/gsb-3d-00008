export const LAYOUT = {
  hall: {
    width: 40,
    depth: 24,
    floorY: 8,
    thickness: 0.4,
    ceilingY: 11.5,
    xMin: -20,
    xMax: 20,
    zMin: -12,
    zMax: 12,
    cutout: { xMin: -17, xMax: 17, zMin: -10, zMax: -1 }
  },
  gridStep: 2,
  entrances: [
    { id: 0, x: -12, z: 12 },
    { id: 1, x: 0, z: 12 },
    { id: 2, x: 12, z: 12 }
  ],
  gateRow: { z: 3 },
  gateXs: [-15, -10, -5, 0, 5, 10, 15],
  platforms: [
    {
      id: 1,
      xCenter: -11,
      zCenter: 0,
      length: 72,
      width: 10,
      floorY: 0,
      xMin: -16,
      xMax: -6,
      zMin: -36,
      zMax: 36,
      trackX: -3,
      edgeX: -6,
      slotX: -6.9,
      doorSide: -1
    },
    {
      id: 2,
      xCenter: 11,
      zCenter: 0,
      length: 72,
      width: 10,
      floorY: 0,
      xMin: 6,
      xMax: 16,
      zMin: -36,
      zMax: 36,
      trackX: 3,
      edgeX: 6,
      slotX: 6.9,
      doorSide: 1
    }
  ],
  escalators: [
    { id: 'esc1', platformId: 1, topX: -11, topZ: -9, botX: -8, botZ: -2 },
    { id: 'esc2', platformId: 2, topX: 11, topZ: -9, botX: 8, botZ: -2 }
  ],
  stairs: [
    { id: 'stair1', platformId: 1, topX: -15, topZ: -9, botX: -14, botZ: -2 },
    { id: 'stair2', platformId: 2, topX: 15, topZ: -9, botX: 14, botZ: -2 }
  ],
  train: {
    cars: 4,
    carLength: 8,
    width: 3.2,
    height: 3.6,
    speed: 9,
    dwell: 12,
    headway: 30,
    perCar: 40,
    doorSpacing: 4,
    doorsPerCar: 2,
    halfTrain: 16,
    trackY: 0.6,
    stopZ: 0,
    spawnZ: -52,
    endZ: 72
  }
} as const

export type Layout = typeof LAYOUT
