import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 620
const TOWNS = 10
const HUBS = 3
/** What a leg between two hubs costs compared to a leg out to a town. */
const ALPHA = 0.35
const NAMES = 'ABCDEFGHIJ'

interface Instance {
  towns: Pt[]
  /** Parcels a day between every pair of towns. */
  flow: number[][]
}
/** The towns you turned into hubs. */
type Solution = number[]

function feedsInto(inst: Instance, sol: Solution): number[] {
  return inst.towns.map((p, i) => {
    let best = sol[0]
    let bestD = Infinity
    for (const h of sol) {
      const d = dist(p, inst.towns[h])
      if (d < bestD) {
        bestD = d
        best = h
      }
    }
    return best
  })
}

function billOf(inst: Instance, sol: Solution): number {
  const via = feedsInto(inst, sol)
  let total = 0
  for (let i = 0; i < TOWNS; i++) {
    for (let j = i + 1; j < TOWNS; j++) {
      const w = inst.flow[i][j]
      if (!w) continue
      const a = via[i]
      const b = via[j]
      const trunk = a === b ? 0 : ALPHA * dist(inst.towns[a], inst.towns[b])
      total += w * (dist(inst.towns[i], inst.towns[a]) + trunk + dist(inst.towns[b], inst.towns[j]))
    }
  }
  return Math.round(total / 1000)
}

/** Every way of picking three of the ten. A hundred and twenty of them. */
function bestHubs(inst: Instance): Solution {
  let best: Solution = [0, 1, 2]
  let bestVal = Infinity
  for (let a = 0; a < TOWNS; a++) {
    for (let b = a + 1; b < TOWNS; b++) {
      for (let c = b + 1; c < TOWNS; c++) {
        const v = billOf(inst, [a, b, c])
        if (v < bestVal) {
          bestVal = v
          best = [a, b, c]
        }
      }
    }
  }
  return best
}

export const hublocation: Minigame<Instance, Solution> = {
  id: 'hublocation',
  title: 'Spokes',
  problem: 'Hub Location',
  family: 'location',
  blurb: 'Parcels stop going town to town. Everything runs into a hub, across the trunk to another hub, then out again. Trunk miles are cheap, so the hubs want to sit where the parcels are, not where the map looks tidy.',
  howTo: 'Click a town to turn it into a hub. You get three, so a fourth pick pushes out the one you chose first. Every town then feeds its nearest hub.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      // Keep asking until the board actually holds ten towns at that spacing.
      let towns = scatter(TOWNS, VW, VH, 80, 115, rng.next)
      while (towns.length < TOWNS) towns = scatter(TOWNS, VW, VH, 80, 115, rng.next)
      const flow = Array.from({ length: TOWNS }, () => new Array(TOWNS).fill(0))
      for (let i = 0; i < TOWNS; i++) {
        for (let j = i + 1; j < TOWNS; j++) {
          const w = 1 + rng.int(4)
          flow[i][j] = flow[j][i] = w
        }
      }
      // A handful of heavy lanes, so raw geography is the wrong answer.
      for (let k = 0; k < 5; k++) {
        const i = rng.int(TOWNS)
        let j = rng.int(TOWNS)
        while (j === i) j = rng.int(TOWNS)
        const w = 14 + rng.int(16)
        flow[i][j] = flow[j][i] = w
      }
      const inst = { towns, flow }
      // Keep only maps where the three towns you start on are a bad answer.
      if (billOf(inst, bestHubs(inst)) / billOf(inst, [0, 1, 2]) < 0.86 || tries > 200) return inst
    }
  },

  initial(): Solution {
    // The first three on the list, which knows nothing about the parcels.
    return [0, 1, 2]
  },

  evaluate(inst, sol) {
    if (sol.length !== HUBS) {
      const left = HUBS - sol.length
      return {
        value: 0,
        feasible: false,
        note: left > 0 ? `${left} more hub${left === 1 ? '' : 's'} to place.` : 'Too many hubs.',
      }
    }
    const via = feedsInto(inst, sol)
    const sizes = sol.map((h) => via.filter((v) => v === h).length)
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `Towns per hub ${sizes.join(', ')}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestHubs(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    const weightOf = (i: number) => inst.flow[i].reduce((a, w) => a + w, 0)
    const heaviest = Math.max(...inst.towns.map((_, i) => weightOf(i)))

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const via = feedsInto(inst, sol)

      if (ref) {
        ctx.save()
        ref.forEach((h) => {
          const p = inst.towns[h]
          ctx.beginPath()
          ctx.arc(p.x, p.y, 34, 0, Math.PI * 2)
          ctx.setLineDash([5, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
        })
        ctx.restore()
      }

      // The heavy lanes go down first, so you can see what the map is for.
      ctx.save()
      ctx.setLineDash([2, 6])
      ctx.lineCap = 'round'
      for (let i = 0; i < TOWNS; i++) {
        for (let j = i + 1; j < TOWNS; j++) {
          const w = inst.flow[i][j]
          if (w < 10) continue
          ctx.beginPath()
          ctx.moveTo(inst.towns[i].x, inst.towns[i].y)
          ctx.lineTo(inst.towns[j].x, inst.towns[j].y)
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'
          ctx.lineWidth = 1 + (w / 30) * 5
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
      ctx.restore()

      // Spokes next, then the trunk over the top of them.
      ctx.save()
      inst.towns.forEach((p, i) => {
        if (sol.includes(i)) return
        const h = inst.towns[via[i]]
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(h.x, h.y)
        ctx.strokeStyle = 'rgba(255,255,255,0.24)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
      ctx.restore()

      ctx.save()
      ctx.lineCap = 'round'
      for (let a = 0; a < sol.length; a++) {
        for (let b = a + 1; b < sol.length; b++) {
          const P = inst.towns[sol[a]]
          const Q = inst.towns[sol[b]]
          ctx.beginPath()
          ctx.moveTo(P.x, P.y)
          ctx.lineTo(Q.x, Q.y)
          ctx.strokeStyle = accent
          ctx.globalAlpha = 0.5
          ctx.lineWidth = 6
          ctx.stroke()
        }
      }
      ctx.restore()

      inst.towns.forEach((p, i) => {
        const isHub = sol.includes(i)
        const r = 10 + Math.pow(weightOf(i) / heaviest, 1.6) * 15
        ctx.save()
        if (i === hover && !isHub) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 12, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, isHub ? r + 6 : r, 0, Math.PI * 2)
        ctx.fillStyle = isHub ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = isHub ? accent : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        ctx.fillStyle = isHub ? '#0b0d11' : 'rgba(255,255,255,0.8)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(NAMES[i], p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.towns, 40)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.towns, 40)
      if (hit < 0) return
      if (sol.includes(hit)) {
        api.commit(sol.filter((x) => x !== hit))
        return
      }
      const next = [...sol, hit]
      api.commit(next.length > HUBS ? next.slice(next.length - HUBS) : next)
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
