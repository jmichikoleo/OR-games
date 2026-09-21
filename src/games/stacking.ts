import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 560
const STACKS = 4
const HEIGHT = 4
const BOXES = 10
const COL_W = 170
const BOX_H = 74
const BASE_Y = 470
const OX = (VW - STACKS * COL_W) / 2

interface Instance {
  /** yard[stack] runs bottom to top. Containers leave in numbered order. */
  start: number[][]
}
/** Each move is the stack a container was shifted to. */
type Solution = number[]

const copy = (yard: number[][]) => yard.map((s) => [...s])

/** Anything sitting on top of something it has to leave before is a blocker. */
function blockers(yard: number[][]): number {
  let n = 0
  for (const s of yard) {
    let low = Infinity
    for (const box of s) {
      if (low < box) n++
      low = Math.min(low, box)
    }
  }
  return n
}

/** Whatever is on top and ready to go, goes. */
function clearReady(yard: number[][], need: number): number {
  for (;;) {
    let moved = false
    for (const s of yard) {
      if (s.length && s[s.length - 1] === need) {
        s.pop()
        need++
        moved = true
      }
    }
    if (!moved) return need
  }
}

/** Which stack holds the container we are waiting on. */
const holder = (yard: number[][], need: number) => yard.findIndex((s) => s.includes(need))

function replay(inst: Instance, sol: Solution) {
  const yard = copy(inst.start)
  let need = clearReady(yard, 1)
  let bad = false
  for (const to of sol) {
    if (need > BOXES) break
    const from = holder(yard, need)
    if (from < 0 || to === from || yard[to].length >= HEIGHT) {
      bad = true
      break
    }
    yard[to].push(yard[from].pop()!)
    need = clearReady(yard, need)
  }
  return { yard, need, bad }
}

/**
 * Iterative deepening with the blocker count as the floor. Only the container
 * sitting on the one you want is ever worth shifting, which keeps the tree to
 * three branches a move.
 */
function fewestMoves(inst: Instance): Solution {
  const start = copy(inst.start)
  const need0 = clearReady(start, 1)

  const dig = (yard: number[][], need: number, used: number, limit: number, path: Solution): boolean => {
    if (need > BOXES) return true
    if (used + blockers(yard) > limit) return false
    const from = holder(yard, need)
    for (let to = 0; to < STACKS; to++) {
      if (to === from || yard[to].length >= HEIGHT) continue
      const next = copy(yard)
      next[to].push(next[from].pop()!)
      const after = clearReady(next, need)
      path.push(to)
      if (dig(next, after, used + 1, limit, path)) return true
      path.pop()
    }
    return false
  }

  for (let limit = blockers(start); limit <= 13; limit++) {
    const path: Solution = []
    if (dig(start, need0, 0, limit, path)) return path
  }
  return []
}

export const stacking: Minigame<Instance, Solution> = {
  id: 'stacking',
  title: 'Top of the Stack',
  problem: 'Block Relocation (Container Stacking)',
  family: 'packing',
  blurb: 'Ten containers in four stacks, and the lorries come for them in numbered order. Anything sitting on the one you want has to be shifted somewhere else first.',
  howTo: 'The lit stack is holding the container you need. Click another stack to shift whatever is on top of it. Containers leave on their own the moment they are uncovered.',
  objective: 'min',
  unit: 'moves',

  generate(rng: RNG): Instance {
    for (;;) {
      const order = Array.from({ length: BOXES }, (_, i) => i + 1)
      for (let i = order.length - 1; i > 0; i--) {
        const k = rng.int(i + 1)
        ;[order[i], order[k]] = [order[k], order[i]]
      }
      const start: number[][] = Array.from({ length: STACKS }, () => [])
      for (const box of order) {
        const room = start.map((s, i) => (s.length < HEIGHT ? i : -1)).filter((i) => i >= 0)
        start[room[rng.int(room.length)]].push(box)
      }
      const inst = { start }
      const best = fewestMoves(inst)
      // Worth playing but not a slog.
      if (best.length >= 3 && best.length <= 7) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const { need, bad } = replay(inst, sol)
    if (bad) return { value: 0, feasible: false, note: 'That shift cannot happen. Start again.' }
    if (need <= BOXES) {
      const left = BOXES - need + 1
      return { value: 0, feasible: false, note: `${left} containers still in the yard.` }
    }
    return {
      value: sol.length,
      feasible: true,
      note: `The yard is clear after ${sol.length} shift${sol.length === 1 ? '' : 's'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: fewestMoves(inst), label: 'iterative deepening', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const { yard, need } = replay(inst, sol)
      const from = need <= BOXES ? holder(yard, need) : -1

      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '500 13px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(
        need > BOXES ? 'Yard clear.' : `The lorry outside wants container ${need}.`,
        OX,
        26,
      )
      if (ref) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fillText(`It can be done in ${ref.length} shifts.`, OX, 48)
      }
      ctx.restore()

      for (let i = 0; i < STACKS; i++) {
        const x = OX + i * COL_W
        const live = i === from
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x + 10, BASE_Y - HEIGHT * BOX_H - 8, COL_W - 20, HEIGHT * BOX_H + 16, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.025)'
        ctx.fill()
        ctx.setLineDash(live ? [] : [5, 5])
        ctx.strokeStyle = live
          ? accent
          : i === hover && from >= 0
            ? 'rgba(255,255,255,0.45)'
            : 'rgba(255,255,255,0.12)'
        ctx.lineWidth = live ? 2.5 : 1.5
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        yard[i].forEach((box, h) => {
          const y = BASE_Y - (h + 1) * BOX_H
          const top = h === yard[i].length - 1
          const wanted = box === need
          const toMove = live && top && !wanted
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x + 20, y + 4, COL_W - 40, BOX_H - 8, 6)
          ctx.fillStyle = wanted ? accent : toMove ? '#ffbe3d' : 'rgba(255,255,255,0.12)'
          ctx.fill()
          if (toMove) {
            ctx.strokeStyle = '#ffbe3d'
            ctx.lineWidth = 2
            ctx.stroke()
          }
          ctx.fillStyle = wanted || toMove ? '#0a0c10' : 'rgba(255,255,255,0.75)'
          ctx.font = '700 24px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(box), x + COL_W / 2, y + BOX_H / 2)
          ctx.restore()
        })
      }

      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(OX, BASE_Y + 9.5)
      ctx.lineTo(OX + STACKS * COL_W, BASE_Y + 9.5)
      ctx.stroke()
      ctx.restore()
    }

    const stackAt = (x: number, y: number) => {
      if (y > BASE_Y + 20 || y < 70) return -1
      const i = Math.floor((x - OX) / COL_W)
      return i >= 0 && i < STACKS ? i : -1
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const next = stackAt(v.x, v.y)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const to = stackAt(v.x, v.y)
      if (to < 0) return
      const { yard, need } = replay(inst, sol)
      if (need > BOXES) return
      const from = holder(yard, need)
      if (to === from || yard[to].length >= HEIGHT) return
      api.commit([...sol, to])
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
