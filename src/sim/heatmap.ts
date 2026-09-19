import * as THREE from 'three'

interface FloorDef {
  xMin: number
  xMax: number
  zMin: number
  zMax: number
  cell: number
  y: number
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 heatColor(float t) {
    vec3 c1 = vec3(0.0, 0.35, 1.0);
    vec3 c2 = vec3(0.0, 0.9, 0.5);
    vec3 c3 = vec3(1.0, 0.85, 0.1);
    vec3 c4 = vec3(1.0, 0.15, 0.05);
    if (t < 0.4) return mix(c1, c2, t / 0.4);
    if (t < 0.72) return mix(c2, c3, (t - 0.4) / 0.32);
    return mix(c3, c4, (t - 0.72) / 0.28);
  }

  void main() {
    float v = texture2D(uMap, vUv).r;
    float a = smoothstep(0.12, 0.95, v) * uOpacity;
    gl_FragColor = vec4(heatColor(clamp(v, 0.0, 1.0)), a);
  }
`

export class Heatmap {
  group = new THREE.Group()
  private layers: {
    def: FloorDef
    cols: number
    rows: number
    data: Uint8Array
    texture: THREE.DataTexture
  }[] = []
  private maxCount = 14

  constructor(private floors: FloorDef[]) {
    for (const def of floors) {
      const cols = Math.ceil((def.xMax - def.xMin) / def.cell)
      const rows = Math.ceil((def.zMax - def.zMin) / def.cell)
      const data = new Uint8Array(cols * rows)
      const texture = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.UnsignedByteType)
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.needsUpdate = true

      const material = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: texture }, uOpacity: { value: 0.85 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
      const width = cols * def.cell
      const depth = rows * def.cell
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
      plane.rotation.x = -Math.PI / 2
      plane.position.set((def.xMin + def.xMax) / 2, def.y, (def.zMin + def.zMax) / 2)
      plane.renderOrder = 5
      this.group.add(plane)
      this.layers.push({ def, cols, rows, data, texture })
    }
    this.group.visible = true
  }

  setVisible(v: boolean) {
    this.group.visible = v
  }

  clear() {
    for (const layer of this.layers) layer.data.fill(0)
  }

  addPoint(x: number, y: number, z: number, weight = 1) {
    void y
    for (const layer of this.layers) {
      const def = layer.def
      if (x < def.xMin || x >= def.xMax || z < def.zMin || z >= def.zMax) continue
      const col = Math.floor((x - def.xMin) / def.cell)
      const row = Math.floor((z - def.zMin) / def.cell)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cc = col + dx
          const rr = row + dz
          if (cc < 0 || cc >= layer.cols || rr < 0 || rr >= layer.rows) continue
          const falloff = dx === 0 && dz === 0 ? 1.4 : dx === 0 || dz === 0 ? 0.7 : 0.35
          const idx = rr * layer.cols + cc
          layer.data[idx] = Math.min(255, layer.data[idx] + weight * falloff * 6)
        }
      }
      return
    }
  }

  averageIntensity(): number {
    let sum = 0
    let n = 0
    for (const layer of this.layers) {
      for (const v of layer.data) {
        sum += v / 255
        n++
      }
    }
    return n === 0 ? 0 : sum / n
  }

  publish(decay: number) {
    void this.maxCount
    for (const layer of this.layers) {
      for (let i = 0; i < layer.data.length; i++) {
        layer.data[i] = Math.max(0, Math.round(layer.data[i] * decay))
      }
      layer.texture.needsUpdate = true
    }
  }
}
