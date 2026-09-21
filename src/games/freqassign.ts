import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const MASTS = 10
const CHANNELS = 9
const CLOSE = 250
const NEAR = 370
const SW = 46
const SH = 34
const SY = 574

const DIAL = [
  '#ff4d9d', '#ff8c42', '#ffbe3d', '#b4e84a', '#52e68a',
  '#3ddbd9', '#5b8cff', '#8b7bff', '#d264ff',
]

interface Link {
  a: number
  b: number
  /** How far apart on the dial these two have to sit. */
  sep: number
}
interface Instance {
  nodes: Pt[]
  links: Link[]
  near: number[][]
}
/** Channel on each mast, or 0 for one still switched off. */
type Solution = number[]

const clashes = (inst: Instance, sol: Solution) =>
  inst.links.filter(
    (l) => sol[l.a] > 0 && sol[l.b] > 0 && Math.abs(sol[l.a] - sol[l.b]) < l.sep,
  )

const topChannel = (sol: Solution) => Math.max(0, ...sol)

/** Try to fit every mast below a given top channel. */
function fit(inst: Instance, top: number): Solution | null {
  const n = inst.nodes.length
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => inst.near[b].length - inst.near[a].length,
  )
  const f = new Array(n).fill(0)
  const walk = (i: number): boolean => {
    if (i === n) return true
    const v = order[i]
    for (let c = 1; c <= top; c++) {
      let ok = true
      for (const l of inst.links) {
        const other = l.a === v ? l.b : l.b === v ? l.a : -1
        if (other < 0 || f[other] === 0) continue
        if (Math.abs(c - f[other]) < l.sep) {
          ok = false
          break
        }
      }
      if (!ok) continue
      f[v] = c
      if (walk(i + 1)) return true
      f[v] = 0
    }
    return false
  }
  return walk(0) ? [...f] : null
}

/** Walk the top channel up from one until everything fits. */
function lowestDial(inst: Instance): Solution {
  for (let top = 1; top <= CHANNELS; top++) {
    const f = fit(inst, top)
    if (f) return f
  }
  return inst.nodes.map((_, i) => i + 1)
}

export const freqassign: Minigame<Instance, Solution> = {
  id: 'freqassign',
  title: 'Radio Silence',
  problem: 'Frequency Assignment',
  family: 'covering',
  blurb: 'Every mast needs a channel. Two masts close together have to sit at least two apart on the dial, and two merely nearby just have to differ. Keep the top channel as low as you can.',
  howTo: 'Pick a channel from the strip and click a mast to tune it. Thick lines are the strict pairs and thin ones the loose pairs. A line turns red when the two are too close on the dial.',
  objective: 'min',
  unit: 'channels',

  generate(rng: RNG): Instance {
    const nodes = scatter(MASTS, VW, VH, 95, 155, rng.next)
    let links: Link[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = dist(nodes[i], nodes[j])
        if (d < CLOSE) links.push({ a: i, b: j, sep: 2 })
        else if (d < NEAR) links.push({ a: i, b: j, sep: 1 })
      }
    }

    const build = (ls: Link[]) => {
      const near: number[][] = nodes.map(() => [])
      ls.forEach((l) => {
        near[l.a].push(l.b)
        near[l.b].push(l.a)
      })
      return { nodes, links: ls, near }
    }

    // Trim the longest link until the board fits comfortably on the dial.
    let inst = build(links)
    while (links.length > 1 && !fit(inst, CHANNELS - 2)) {
      let worst = 0
      let worstD = -1
      links.forEach((l, i) => {
        const d = dist(nodes[l.a], nodes[l.b])
        if (d > worstD) {
          worstD = d
          worst = i
        }
      })
      links = links.filter((_, i) => i !== worst)
      inst = build(links)
    }
    return inst
  },

  initial(): Solution {
    return new Array(MASTS).fill(0)
  },

  evaluate(inst, sol) {
    const off = sol.filter((c) => c === 0).length
    if (off > 0) {
      return { value: 0, feasible: false, note: `${off} mast${off === 1 ? ' is' : 's are'} still off air.` }
    }
    const bad = clashes(inst, sol)
    if (bad.length > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad.length} pair${bad.length === 1 ? '' : 's'} sitting too close together on the dial.`,
      }
    }
    return {
      value: topChannel(sol),
      feasible: true,
      note: `Everything on air with nothing above channel ${topChannel(sol)}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: lowestDial(inst), label: 'exhaustive by dial width', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let brush = 1
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    const swatchX = (i: number) => VW / 2 - (CHANNELS * (SW + 6)) / 2 + i * (SW + 6) + 3

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      clearBoard(ctx, VW, VH)
      const bad = new Set(clashes(inst, sol).map((l) => `${l.a}-${l.b}`))

      inst.links.forEach((l) => {
        const A = inst.nodes[l.a]
        const B = inst.nodes[l.b]
        const hot = bad.has(`${l.a}-${l.b}`)
        ctx.save()
        ctx.strokeStyle = hot ? '#ff5c7a' : 'rgba(255,255,255,0.14)'
        ctx.lineWidth = hot ? 3.5 : l.sep === 2 ? 3 : 1.4
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const ch = sol[i]
        ctx.save()
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 33, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        if (ref && ref[i] > 0) {
          ctx.beginPath()
          ctx.setLineDash([5, 5])
          ctx.arc(p.x, p.y, 30, 0, Math.PI * 2)
          ctx.strokeStyle = DIAL[ref[i] - 1]
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 23, 0, Math.PI * 2)
        ctx.fillStyle = ch > 0 ? DIAL[ch - 1] : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = ch > 0 ? DIAL[ch - 1] : 'rgba(255,255,255,0.4)'
        ctx.stroke()
        ctx.fillStyle = ch > 0 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.5)'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch > 0 ? String(ch) : '', p.x, p.y + 0.5)
        ctx.restore()
      })

      DIAL.forEach((col, i) => {
        const x = swatchX(i)
        const on = i + 1 === brush
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x, SY, SW, SH, 8)
        ctx.fillStyle = col
        ctx.globalAlpha = on ? 1 : 0.38
        ctx.fill()
        ctx.globalAlpha = 1
        if (on) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(i + 1), x + SW / 2, SY + SH / 2)
        ctx.restore()
      })
    }

    const swatchAt = (p: Pt) => {
      if (p.y < SY || p.y > SY + SH) return -1
      for (let i = 0; i < CHANNELS; i++) {
        const x = swatchX(i)
        if (p.x >= x && p.x <= x + SW) return i + 1
      }
      return -1
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const next = nearestIndex(v, inst.nodes, 34)
      const sw = swatchAt(v) > 0
      if (next !== hover) {
        hover = next
        draw(sol, ref)
      }
      s.canvas.style.cursor = next >= 0 || sw ? 'pointer' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const sw = swatchAt(v)
      if (sw > 0) {
        brush = sw
        draw(sol, ref)
        return
      }
      const i = nearestIndex(v, inst.nodes, 34)
      if (i < 0) return
      const next = [...sol]
      next[i] = sol[i] === brush ? 0 : brush
      api.commit(next)
    }

    s.canvas.addEventListener('pointermove', onMove)
    s.canvas.addEventListener('pointerdown', onClick)
    s.onResize(() => draw(sol, ref))

    return {
      draw,
      destroy() {
        s.canvas.removeEventListener('pointermove', onMove)
        s.canvas.removeEventListener('pointerdown', onClick)
        s.destroy()
      },
    }
  },
}
