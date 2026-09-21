import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 420

const NODES = [
  { name: 'A', x: 110, y: 130 },
  { name: 'B', x: 110, y: 330 },
  { name: 'C', x: 390, y: 70 },
  { name: 'D', x: 390, y: 225 },
  { name: 'E', x: 390, y: 375 },
  { name: 'F', x: 680, y: 135 },
  { name: 'G', x: 680, y: 320 },
  { name: 'H', x: 900, y: 120 },
  { name: 'I', x: 900, y: 335 },
]
const LINKS: [number, number][] = [
  [0, 2], [0, 3], [1, 3], [1, 4],
  [2, 5], [2, 6], [3, 5], [3, 6], [4, 5], [4, 6],
  [5, 7], [5, 8], [6, 7], [6, 8],
]
const ORDERS: { from: number; to: number; units: number }[] = [
  { from: 0, to: 7, units: 3 },
  { from: 1, to: 8, units: 3 },
  { from: 0, to: 8, units: 2 },
]
const LOAD_COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  cap: number[]
  cost: number[]
  /** Every route an order could take, as a list of link ids. */
  routes: number[][][]
  /** Same routes as node chains, for the label. */
  chains: number[][][]
}
/** Units on each route of each order. */
type Solution = number[][]

function allRoutes(from: number, to: number): { links: number[]; chain: number[] }[] {
  const out: { links: number[]; chain: number[] }[] = []
  const walk = (at: number, links: number[], chain: number[]) => {
    if (at === to) {
      out.push({ links: [...links], chain: [...chain] })
      return
    }
    LINKS.forEach(([u, v], id) => {
      if (u !== at) return
      walk(v, [...links, id], [...chain, v])
    })
  }
  walk(from, [], [from])
  return out
}

function loadOf(inst: Instance, sol: Solution): number[] {
  const load = LINKS.map(() => 0)
  sol.forEach((units, k) => {
    units.forEach((n, r) => {
      if (!n) return
      inst.routes[k][r].forEach((id) => (load[id] += n))
    })
  })
  return load
}

const routeCost = (inst: Instance, k: number, r: number) =>
  inst.routes[k][r].reduce((a, id) => a + inst.cost[id], 0)

const billOf = (inst: Instance, sol: Solution) =>
  sol.reduce((a, units, k) => a + units.reduce((b, n, r) => b + n * routeCost(inst, k, r), 0), 0)

const overBy = (inst: Instance, sol: Solution) =>
  loadOf(inst, sol).filter((n, id) => n > inst.cap[id]).length

/** Every split of every order across its routes. Four thousand of them. */
function bestPlan(inst: Instance): Solution | null {
  const splits = ORDERS.map((o, k) => {
    const lanes = inst.routes[k].length
    const out: number[][] = []
    const walk = (r: number, left: number, acc: number[]) => {
      if (r === lanes - 1) {
        out.push([...acc, left])
        return
      }
      for (let n = 0; n <= left; n++) walk(r + 1, left - n, [...acc, n])
    }
    walk(0, o.units, [])
    return out
  })

  let best: Solution | null = null
  let bestVal = Infinity
  for (const a of splits[0]) {
    for (const b of splits[1]) {
      for (const c of splits[2]) {
        const sol = [a, b, c]
        if (overBy(inst, sol) > 0) continue
        const v = billOf(inst, sol)
        if (v < bestVal) {
          bestVal = v
          best = sol
        }
      }
    }
  }
  return best
}

const cheapestFirst = (inst: Instance): Solution =>
  ORDERS.map((o, k) => {
    const lanes = inst.routes[k]
    let pick = 0
    lanes.forEach((_, r) => {
      if (routeCost(inst, k, r) < routeCost(inst, k, pick)) pick = r
    })
    return lanes.map((_, r) => (r === pick ? o.units : 0))
  })

export const multiflow: Minigame<Instance, Solution> = {
  id: 'multiflow',
  title: 'Shared Pipes',
  problem: 'Multicommodity Flow',
  family: 'flow',
  blurb: 'Three orders crossing the same network. Each one on its own would take the cheap road. Together they do not fit, so somebody has to take the long way and you decide who.',
  howTo: 'Every order lists the routes it could take. Add and remove units until all three orders are fully sent and no pipe is carrying more than it holds.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const routes = ORDERS.map((o) => allRoutes(o.from, o.to).map((r) => r.links))
    const chains = ORDERS.map((o) => allRoutes(o.from, o.to).map((r) => r.chain))
    for (;;) {
      const cap = LINKS.map(() => 2 + rng.int(3))
      const cost = LINKS.map(() => 2 + rng.int(8))
      const inst = { cap, cost, routes, chains }
      const best = bestPlan(inst)
      if (!best) continue
      const naive = cheapestFirst(inst)
      // Worth playing only if piling onto the cheap roads actually breaks.
      if (overBy(inst, naive) > 0) return inst
    }
  },

  initial(inst): Solution {
    return cheapestFirst(inst)
  },

  evaluate(inst, sol) {
    const short = ORDERS.map((o, k) => o.units - sol[k].reduce((a, n) => a + n, 0)).filter((n) => n > 0)
    if (short.length) {
      const left = short.reduce((a, n) => a + n, 0)
      return { value: 0, feasible: false, note: `${left} unit${left === 1 ? '' : 's'} still not sent.` }
    }
    const over = overBy(inst, sol)
    if (over > 0) {
      return {
        value: 0,
        feasible: false,
        note:
          over === 1
            ? '1 pipe is carrying more than it holds.'
            : `${over} pipes are carrying more than they hold.`,
      }
    }
    const load = loadOf(inst, sol)
    const full = load.filter((n, id) => n === inst.cap[id]).length
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `All three sent. ${full} pipe${full === 1 ? ' is' : 's are'} completely full.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst)!, label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const panel = document.createElement('div')
    panel.className = 'mcm'
    host.appendChild(panel)

    let sol: Solution = api.current()
    let ref: Solution | null = null

    function paint() {
      const { ctx } = s
      clearBoard(ctx, VW, VH)
      const load = loadOf(inst, sol)

      LINKS.forEach(([u, v], id) => {
        const A = NODES[u]
        const B = NODES[v]
        const n = load[id]
        const over = n > inst.cap[id]
        ctx.save()
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        if (over) {
          ctx.strokeStyle = '#ff5c7a'
          ctx.lineWidth = 7
        } else if (n > 0) {
          ctx.strokeStyle = s.accent()
          ctx.lineWidth = 2 + (n / inst.cap[id]) * 6
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.13)'
          ctx.lineWidth = 2
        }
        ctx.stroke()

        const t = 0.42
        const lx = A.x + (B.x - A.x) * t
        const ly = A.y + (B.y - A.y) * t
        ctx.font = '700 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const tag = `${n}/${inst.cap[id]}`
        const w = ctx.measureText(tag).width + 10
        ctx.fillStyle = '#0b090e'
        ctx.beginPath()
        ctx.roundRect(lx - w / 2, ly - 9, w, 18, 5)
        ctx.fill()
        ctx.fillStyle = over ? '#ff5c7a' : n > 0 ? '#ffffff' : 'rgba(255,255,255,0.35)'
        ctx.fillText(tag, lx, ly + 0.5)
        ctx.fillStyle = 'rgba(255,255,255,0.32)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(`${inst.cost[id]} a unit`, lx, ly + 19)
        ctx.restore()
      })

      NODES.forEach((p, i) => {
        const role = ORDERS.findIndex((o) => o.from === i || o.to === i)
        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 17, 0, Math.PI * 2)
        ctx.fillStyle = '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = role >= 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)'
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.name, p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    function steppers() {
      panel.innerHTML = ''
      ORDERS.forEach((o, k) => {
        const sent = sol[k].reduce((a, n) => a + n, 0)
        const block = document.createElement('div')
        block.className = 'mcm-order'
        block.style.setProperty('--who', LOAD_COLORS[k])
        block.innerHTML = `<div class="mcm-head"><b>${NODES[o.from].name} to ${NODES[o.to].name}</b><span>${sent} of ${o.units} sent</span></div>`
        inst.routes[k].forEach((_, r) => {
          const row = document.createElement('div')
          const want = ref ? ref[k][r] : -1
          row.className = `mcm-lane${sol[k][r] > 0 ? ' on' : ''}${want > 0 ? ' opt' : ''}`
          row.innerHTML = `
            <span class="mcm-path">${inst.chains[k][r].map((n) => NODES[n].name).join(' ')}</span>
            <span class="mcm-cost">${routeCost(inst, k, r)} a unit</span>
            ${want >= 0 ? `<em class="mcm-want">solver ${want}</em>` : ''}
            <button class="mcm-step" data-d="-1">-</button>
            <span class="mcm-n">${sol[k][r]}</span>
            <button class="mcm-step" data-d="1">+</button>`
          row.querySelectorAll('.mcm-step').forEach((b) =>
            b.addEventListener('click', () => {
              const d = Number((b as HTMLElement).dataset.d)
              const n = sol[k][r] + d
              if (n < 0 || (d > 0 && sent >= o.units)) return
              const next = sol.map((row2) => [...row2])
              next[k][r] = n
              api.commit(next)
            }),
          )
          block.appendChild(row)
        })
        panel.appendChild(block)
      })
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      paint()
      steppers()
    }

    s.onResize(paint)

    return {
      draw,
      destroy() {
        panel.remove()
        s.destroy()
      },
    }
  },
}
