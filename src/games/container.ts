import type { Minigame, Reference, RNG } from '../core/types'

const FLOORS = ['floor', 'second', 'third', 'fourth']
const HUES = ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d', '#8b7bff', '#3ddbd9', '#ff8c42', '#ff5c7a']

/**
 * Containers and box sizes where the boxes provably cannot fill the space, so
 * the volume is a promise nobody can keep, and where the search settles in a
 * few milliseconds. Picked over the whole range beforehand.
 */
const SHAPES: number[][] = [
  [4, 3, 3, 2, 2, 1], [4, 4, 4, 3, 3, 1], [4, 5, 4, 2, 2, 2], [4, 6, 3, 2, 2, 2],
  [5, 3, 3, 2, 2, 1], [5, 3, 3, 4, 1, 1], [5, 4, 4, 2, 2, 2], [5, 5, 3, 4, 2, 1],
  [5, 5, 4, 3, 3, 1], [5, 6, 2, 2, 2, 2], [5, 6, 3, 3, 2, 2], [5, 6, 3, 4, 2, 1],
  [5, 6, 4, 3, 3, 1], [5, 6, 4, 4, 2, 2], [6, 3, 3, 2, 2, 1], [6, 3, 4, 2, 2, 2],
  [6, 4, 3, 2, 2, 2], [6, 5, 2, 2, 2, 2], [6, 5, 3, 3, 2, 2], [6, 5, 3, 4, 2, 1],
  [6, 5, 4, 3, 3, 1], [6, 5, 4, 4, 2, 2], [6, 6, 2, 4, 2, 1], [6, 6, 3, 4, 2, 1],
  [6, 6, 3, 4, 3, 1], [6, 6, 4, 4, 4, 1], [7, 3, 4, 3, 2, 2], [7, 4, 2, 2, 2, 2],
  [7, 4, 3, 3, 2, 2], [7, 4, 4, 2, 2, 2], [7, 4, 4, 3, 2, 2], [7, 4, 4, 3, 3, 1],
  [7, 4, 4, 4, 2, 2], [7, 5, 2, 2, 2, 2], [7, 5, 3, 4, 2, 1], [7, 5, 4, 3, 3, 2],
  [7, 6, 2, 2, 2, 2], [7, 6, 2, 3, 3, 1], [7, 6, 2, 4, 3, 1], [7, 6, 4, 3, 3, 2],
  [7, 6, 4, 4, 2, 2], [8, 3, 3, 4, 2, 1], [8, 4, 4, 3, 3, 1], [8, 4, 4, 3, 3, 2],
  [8, 5, 3, 4, 4, 1], [8, 5, 4, 3, 3, 2], [8, 6, 2, 3, 3, 1], [8, 6, 3, 4, 2, 2],
  [8, 6, 3, 4, 4, 1],
]

interface Instance {
  /** Container across, back and up, in box units. */
  wide: number
  deep: number
  tall: number
  /** The three sides of the box, longest first. */
  box: [number, number, number]
}
interface Box {
  x: number
  y: number
  z: number
  /** Which way up, as an index into the list of distinct turns. */
  turn: number
}
type Solution = Box[]

function turnsOf(inst: Instance): [number, number, number][] {
  const [a, b, c] = inst.box
  const seen = new Set<string>()
  const out: [number, number, number][] = []
  for (const p of [
    [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
  ] as [number, number, number][]) {
    const key = p.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

const volumeCap = (inst: Instance) =>
  Math.floor((inst.wide * inst.deep * inst.tall) / (inst.box[0] * inst.box[1] * inst.box[2]))

const cellAt = (inst: Instance, x: number, y: number, z: number) =>
  (z * inst.deep + y) * inst.wide + x

/** Which box, if any, holds each cell. Null if two of them overlap. */
function fillOf(inst: Instance, sol: Solution): Int8Array | null {
  const turns = turnsOf(inst)
  const grid = new Int8Array(inst.wide * inst.deep * inst.tall).fill(-1)
  for (let n = 0; n < sol.length; n++) {
    const { x, y, z, turn } = sol[n]
    const [w, d, h] = turns[turn]
    if (x + w > inst.wide || y + d > inst.deep || z + h > inst.tall) return null
    for (let k = z; k < z + h; k++) {
      for (let j = y; j < y + d; j++) {
        for (let i = x; i < x + w; i++) {
          if (grid[cellAt(inst, i, j, k)] >= 0) return null
          grid[cellAt(inst, i, j, k)] = n
        }
      }
    }
  }
  return grid
}

/**
 * Take the first corner nobody has claimed, working across then back then up,
 * and either start a box there any way up or give that corner up for lost.
 * The bound is what the space left could hold if it packed perfectly.
 */
function bestLoad(inst: Instance): Solution {
  const { wide, deep, tall } = inst
  const cells = wide * deep * tall
  const vol = inst.box[0] * inst.box[1] * inst.box[2]
  const turns = turnsOf(inst)
  const grid = new Uint8Array(cells)
  const here: Solution = []
  let best: Solution = []
  let free = cells
  let put = 0

  const room = (x: number, y: number, z: number, w: number, d: number, h: number) => {
    if (x + w > wide || y + d > deep || z + h > tall) return false
    for (let k = z; k < z + h; k++) {
      for (let j = y; j < y + d; j++) {
        for (let i = x; i < x + w; i++) if (grid[cellAt(inst, i, j, k)]) return false
      }
    }
    return true
  }
  const paint = (x: number, y: number, z: number, w: number, d: number, h: number, v: number) => {
    for (let k = z; k < z + h; k++) {
      for (let j = y; j < y + d; j++) {
        for (let i = x; i < x + w; i++) grid[cellAt(inst, i, j, k)] = v
      }
    }
  }

  const walk = (from: number) => {
    if (put + Math.floor(free / vol) <= best.length) return
    let n = from
    while (n < cells && grid[n]) n++
    if (n === cells) {
      if (put > best.length) best = here.map((b) => ({ ...b }))
      return
    }
    const x = n % wide
    const y = Math.floor(n / wide) % deep
    const z = Math.floor(n / (wide * deep))
    turns.forEach(([w, d, h], t) => {
      if (!room(x, y, z, w, d, h)) return
      paint(x, y, z, w, d, h, 1)
      free -= vol
      put++
      here.push({ x, y, z, turn: t })
      walk(n + 1)
      here.pop()
      put--
      free += vol
      paint(x, y, z, w, d, h, 0)
    })
    grid[n] = 2
    free--
    walk(n + 1)
    free++
    grid[n] = 0
  }
  walk(0)
  return best
}

export const container: Minigame<Instance, Solution> = {
  id: 'container',
  title: 'Deep Stack',
  problem: '3D Container Loading',
  family: 'packing',
  blurb: 'The same box over and over and one container to get them into. You are looking down through it a floor at a time, and a box you lay flat on the floor is a box standing in the way of the one above.',
  howTo: 'Click an empty square to start a box in that corner. Click a box to turn it the next way up, and once it will not turn any further the next click takes it out.',
  objective: 'max',
  unit: 'boxes',

  generate(rng: RNG): Instance {
    const pick = SHAPES[rng.int(SHAPES.length)]
    return {
      wide: pick[0],
      deep: pick[1],
      tall: pick[2],
      box: [pick[3], pick[4], pick[5]],
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const grid = fillOf(inst, sol)
    if (!grid) return { value: 0, feasible: false, note: 'Two boxes want the same space.' }
    let bare = 0
    for (let i = 0; i < grid.length; i++) if (grid[i] < 0) bare++
    return {
      value: sol.length,
      feasible: true,
      note: `${sol.length} loaded, ${bare} square${bare === 1 ? '' : 's'} of air left. The volume alone says ${volumeCap(inst)} ought to go in.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestLoad(inst), label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const turns = turnsOf(inst)
    const root = document.createElement('div')
    root.className = 'cnt'
    root.innerHTML = `<div class="cnt-floors" id="mine"></div>
      <div class="cnt-ghost" id="ghost" hidden><div class="cnt-ghost-tag">what the solver did</div><div class="cnt-floors" id="theirs"></div></div>`
    host.appendChild(root)
    const mine = root.querySelector('#mine') as HTMLElement
    const ghost = root.querySelector('#ghost') as HTMLElement
    const theirs = root.querySelector('#theirs') as HTMLElement

    function floors(into: HTMLElement, which: Solution, live: boolean) {
      const grid = fillOf(inst, which)
      into.innerHTML = ''
      for (let z = 0; z < inst.tall; z++) {
        const plan = document.createElement('div')
        plan.className = 'cnt-floor'
        plan.innerHTML = `<span class="cnt-name">${FLOORS[z] ?? `level ${z + 1}`}</span><div class="cnt-plan"></div>`
        const cells = plan.querySelector('.cnt-plan') as HTMLElement
        cells.style.gridTemplateColumns = `repeat(${inst.wide}, 1fr)`
        for (let y = 0; y < inst.deep; y++) {
          for (let x = 0; x < inst.wide; x++) {
            const n = grid ? grid[cellAt(inst, x, y, z)] : -1
            const cell = document.createElement(live ? 'button' : 'div')
            cell.className = `cnt-cell${n >= 0 ? ' full' : ''}`
            if (n >= 0) cell.style.background = HUES[n % HUES.length]
            if (live) {
              cell.addEventListener('click', () => place(x, y, z))
            }
            cells.appendChild(cell)
          }
        }
        into.appendChild(plan)
      }
    }

    function place(x: number, y: number, z: number) {
      const sol = api.current()
      const grid = fillOf(inst, sol)
      if (!grid) return
      const on = grid[cellAt(inst, x, y, z)]
      if (on >= 0) {
        // Next way up that will actually go, and off the lorry after the last.
        const b = sol[on]
        const rest = sol.filter((_, i) => i !== on)
        for (let t = b.turn + 1; t < turns.length; t++) {
          const swung = { ...b, turn: t }
          if (fillOf(inst, [...rest, swung])) {
            api.commit([...rest, swung])
            return
          }
        }
        api.commit(rest)
        return
      }
      for (let t = 0; t < turns.length; t++) {
        const box = { x, y, z, turn: t }
        if (fillOf(inst, [...sol, box])) {
          api.commit([...sol, box])
          return
        }
      }
    }

    function draw(sol: Solution, ref: Solution | null) {
      floors(mine, sol, true)
      ghost.hidden = !ref
      if (ref) floors(theirs, ref, false)
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}
