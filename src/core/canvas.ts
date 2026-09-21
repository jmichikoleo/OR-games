import type { Pt } from './geom'

/**
 * Canvas games work in a fixed virtual coordinate space (so objective values
 * are resolution-independent) and this maps it to device pixels.
 */
export interface Surface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  vw: number
  vh: number
  /** Pointer position in virtual coordinates. */
  toVirtual(ev: PointerEvent | MouseEvent): Pt
  /** Re-run on every resize; the callback should redraw. */
  onResize(cb: () => void): void
  accent(): string
  destroy(): void
}

export function makeSurface(host: HTMLElement, vw: number, vh: number): Surface {
  const canvas = document.createElement('canvas')
  canvas.className = 'surface'
  // Inline wins over the stylesheet default, so each game picks its own shape.
  canvas.style.aspectRatio = `${vw} / ${vh}`
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  let cb: (() => void) | null = null

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const s = canvas.width / vw
    ctx.setTransform(s, 0, 0, s, 0, 0)
  }

  const ro = new ResizeObserver(() => {
    size()
    cb?.()
  })
  ro.observe(canvas)
  size()

  return {
    canvas,
    ctx,
    vw,
    vh,
    toVirtual(ev) {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((ev.clientX - rect.left) / rect.width) * vw,
        y: ((ev.clientY - rect.top) / rect.height) * vh,
      }
    },
    onResize(next) {
      cb = next
    },
    accent() {
      return getComputedStyle(host).getPropertyValue('--accent').trim() || '#f59e0b'
    },
    destroy() {
      ro.disconnect()
      canvas.remove()
    },
  }
}

export function clearBoard(ctx: CanvasRenderingContext2D, vw: number, vh: number) {
  ctx.clearRect(0, 0, vw, vh)
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'
  ctx.lineWidth = 1
  for (let x = 0; x <= vw; x += 50) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, vh)
    ctx.stroke()
  }
  for (let y = 0; y <= vh; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(vw, y)
    ctx.stroke()
  }
  ctx.restore()
}
