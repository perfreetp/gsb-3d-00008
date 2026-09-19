import * as THREE from 'three'

export function makeTextSprite(text: string, options: { bg?: string; fg?: string; scale?: number; fontSize?: number } = {}): THREE.Sprite {
  const { bg = 'rgba(8,20,40,0.85)', fg = '#ffffff', scale = 1, fontSize = 44 } = options
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const pad = 18
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`
  const metrics = ctx.measureText(text)
  canvas.width = Math.ceil(metrics.width + pad * 2)
  canvas.height = fontSize + pad * 2
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`
  if (bg.startsWith('rgba(8')) {
    ctx.fillStyle = bg
    const r = 14
    const w = canvas.width
    const h = canvas.height
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(w - r, 0)
    ctx.quadraticCurveTo(w, 0, w, r)
    ctx.lineTo(w, h - r)
    ctx.quadraticCurveTo(w, h, w - r, h)
    ctx.lineTo(r, h)
    ctx.quadraticCurveTo(0, h, 0, h - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(material)
  const aspect = canvas.width / canvas.height
  sprite.scale.set(3.2 * scale * aspect, 3.2 * scale, 1)
  sprite.renderOrder = 20
  return sprite
}
