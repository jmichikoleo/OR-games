import type { Minigame, Reference, RNG } from '../core/types'
import { type Arc, minCostFlow } from '../core/flow'
import { pointSegmentDistance } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 440
const DEMAND = 8

const NODES = [
  { name: 'S', x: 95, y: 220 },
  { name: 'a', x: 300, y: 95 },
  { name: 'b', x: 300, y: 345 },
  { name: 'c', x: 520, y: 60 },
  { name: 'd', x: 520, y: 220 },
  { name: 'e', x: 520, y: 380 },
  { name: 'f', x: 745, y: 130 },
  { name: 'g', x: 745, y: 310 },
  { name: 'T', x: 915, y: 220 },
]
const LINKS: [number, number][] = [
  [0, 1], [0, 2], [0, 4],
  [1, 3], [1, 4], [2, 4], [2, 5],
  [3, 6], [4, 6], [4, 7], [5, 7],
  [6, 8], [7, 8],
]
const SOURCE = 0
const SINK = 8

interface Instance {
  /** What it costs just to have the road there at all. */
  build: number[]
  cap: number[]
  ship: number[]
}
/** Which roads you paid for. */
type Solution = number[]

interface Plan {
  flow: number[]
  moved: number
  bill: number
}

function planOf(inst: Instance, built: Solution): Plan {
  const ids = [...built].sort((a, b) => a - b)
  const arcs: Arc[] = ids.map((id) => ({
    from: LINKS[id][0],
    to: LINKS[id][1],
    cap: inst.cap[id],
    cost: inst.ship[id],
  }))
  const got = arcs.length ? minCostFlow(NODES.length, arcs, SOURCE, SINK, DEMAND) : []
  const flow = LINKS.map(() => 0)
  ids.forEach((id, i) => (flow[id] = got[i] ?? 0))
  const moved = LINKS.reduce((a, [u], id) => a + (u === SOURCE ? flow[id] : 0), 0)
  const bill = ids.reduce((a, id) => a + inst.build[id] + flow[id] * inst.ship[id], 0)
  return { flow, moved, bill }
}

/** All 8,192 sets of roads, with the cheapest run over each. The build bill
 *  alone throws most of them out before any routing happens. */
function bestNetwork(inst: Instance): Solution | null {
  let best: Solution | null = null
  let bestVal = Infinity
  for (let mask = 1; mask < 1 << LINKS.length; mask++) {
    const built: number[] = []
    let fixed = 0
    for (let id = 0; id < LINKS.length; id++) {
      if (!((mask >> id) & 1)) continue
      built.push(id)
      fixed += inst.build[id]
    }
    if (fixed >= bestVal) continue
    const plan = planOf(inst, built)
    if (plan.moved < DEMAND) continue
    if (plan.bill < bestVal) {
      bestVal = plan.bill
      best = built
    }
  }
  return best
}

export const netdesign: Minigame<Instance, Solution> = {
  id: 'netdesign',
  title: 'Which Roads',
  problem: 'Network Design',
  family: 'flow',
  blurb: 'Eight loads have to reach the far side. Every road costs money to have at all, before a single load rolls down it, so a short road you barely use can cost more than a long one you fill.',
  howTo: 'Click a road to pay for it or tear it up. The loads then take the cheapest way through whatever you left standing. You start with everything built.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        build: LINKS.map(() => 25 + rng.int(70)),
        cap: LINKS.map(() => 3 + rng.int(5)),
        ship: LINKS.map(() => 1 + rng.int(6)),
      }
      const all = LINKS.map((_, id) => id)
      if (planOf(inst, all).moved < DEMAND) continue
      const best = bestNetwork(inst)
      if (!best) continue
      // Building the lot has to be a clearly bad answer, or there is no game.
      if (planOf(inst, best).bill / planOf(inst, all).bill < 0.72 || tries > 100) return inst
    }
  },

  initial(): Solution {
    return LINKS.map((_, id) => id)
  },

  evaluate(inst, sol) {
    const plan = planOf(inst, sol)
    if (plan.moved < DEMAND) {
      return {
        value: 0,
        feasible: false,
        note: `Only ${plan.moved} of ${DEMAND} loads get through.`,
      }
    }
    const idle = sol.filter((id) => plan.flow[id] === 0).length
    return {
      value: plan.bill,
      feasible: true,
      note: idle > 0
        ? `${idle} road${idle === 1 ? '' : 's'} paid for and carrying nothing.`
        : 'Every road you built is doing work.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestNetwork(inst)!, label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const plan = planOf(inst, sol)

      LINKS.forEach(([u, v], id) => {
        const A = NODES[u]
        const B = NODES[v]
        const on = sol.includes(id)
        const n = plan.flow[id]
        ctx.save()
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        if (!on) {
          ctx.setLineDash([3, 7])
          ctx.strokeStyle = id === hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.13)'
          ctx.lineWidth = 2
        } else if (n > 0) {
          ctx.strokeStyle = accent
          ctx.lineWidth = 2.5 + (n / inst.cap[id]) * 6
        } else {
          ctx.strokeStyle = '#ff5c7a'
          ctx.lineWidth = 3
        }
        ctx.stroke()
        ctx.setLineDash([])

        if (ref && ref.includes(id)) {
          ctx.setLineDash([6, 6])
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
          ctx.setLineDash([])
        }

        const t = 0.44
        const lx = A.x + (B.x - A.x) * t
        const ly = A.y + (B.y - A.y) * t
        const tag = on ? `${n}/${inst.cap[id]}` : `build ${inst.build[id]}`
        ctx.font = '700 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const w = ctx.measureText(tag).width + 10
        ctx.fillStyle = '#0b090e'
        ctx.beginPath()
        ctx.roundRect(lx - w / 2, ly - 9, w, 18, 5)
        ctx.fill()
        ctx.fillStyle = on ? (n > 0 ? '#ffffff' : '#ff5c7a') : 'rgba(255,255,255,0.4)'
        ctx.fillText(tag, lx, ly + 0.5)
        if (on) {
          ctx.fillStyle = 'rgba(255,255,255,0.32)'
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.fillText(`${inst.build[id]} plus ${inst.ship[id]}`, lx, ly + 19)
        }
        ctx.restore()
      })

      NODES.forEach((p, i) => {
        const end = i === SOURCE || i === SINK
        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, end ? 20 : 15, 0, Math.PI * 2)
        ctx.fillStyle = end ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = end ? accent : 'rgba(255,255,255,0.35)'
        ctx.stroke()
        ctx.fillStyle = end ? '#0b090e' : 'rgba(255,255,255,0.75)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.name, p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const pick = (ev: PointerEvent) => {
      const p = s.toVirtual(ev)
      let hit = -1
      let near = 22
      LINKS.forEach(([u, v], id) => {
        const d = pointSegmentDistance(p, NODES[u], NODES[v])
        if (d < near) {
          near = d
          hit = id
        }
      })
      return hit
    }

    const onMove = (ev: PointerEvent) => {
      const next = pick(ev)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = pick(ev)
      if (hit < 0) return
      api.commit(sol.includes(hit) ? sol.filter((x) => x !== hit) : [...sol, hit])
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
