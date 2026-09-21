import type { Minigame, Reference, RNG } from '../core/types'

const CAP = 100
const ITEMS = 14

interface Instance {
  sizes: number[]
  capacity: number
  bins: number
}
/** solution[i] = bin index holding item i, or -1 when it's still in the tray. */
type Solution = number[]

const loads = (inst: Instance, sol: Solution): number[] => {
  const l = new Array(inst.bins).fill(0)
  sol.forEach((b, i) => {
    if (b >= 0) l[b] += inst.sizes[i]
  })
  return l
}

const binsUsed = (l: number[]) => l.filter((v) => v > 0).length

/** First-fit decreasing: the classic 11/9-approximation, and usually very good. */
function firstFitDecreasing(inst: Instance): Solution {
  const order = inst.sizes.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)
  const sol: Solution = new Array(inst.sizes.length).fill(-1)
  const load = new Array(inst.bins).fill(0)
  for (const { s, i } of order) {
    for (let b = 0; b < inst.bins; b++) {
      if (load[b] + s <= inst.capacity) {
        load[b] += s
        sol[i] = b
        break
      }
    }
  }
  return sol
}

export const binpacking: Minigame<Instance, Solution> = {
  id: 'binpacking',
  title: 'Tetris Logistics',
  problem: 'Bin Packing',
  family: 'packing',
  blurb: 'Fit every crate into as few containers as you can. Each container holds 100 units.',
  howTo: 'Click a crate to pick it up, then click a container to drop it in. Click a packed crate to send it back to the yard.',
  objective: 'min',
  unit: 'bins',

  generate(rng: RNG): Instance {
    const sizes = Array.from({ length: ITEMS }, () => 18 + rng.int(29))
    const total = sizes.reduce((a, b) => a + b, 0)
    return { sizes, capacity: CAP, bins: Math.ceil(total / CAP) + 2 }
  },

  initial(inst): Solution {
    return new Array(inst.sizes.length).fill(-1)
  },

  evaluate(inst, sol) {
    const unplaced = sol.filter((b) => b < 0).length
    if (unplaced > 0) {
      return { value: 0, feasible: false, note: `${unplaced} crate${unplaced === 1 ? '' : 's'} still in the yard.` }
    }
    const l = loads(inst, sol)
    const over = l.filter((v) => v > inst.capacity).length
    if (over > 0) {
      return { value: 0, feasible: false, note: `${over} container${over === 1 ? ' is' : 's are'} over capacity.` }
    }
    return { value: binsUsed(l), feasible: true, note: 'All crates loaded, nothing overflowing.' }
  },

  solve(inst): Reference<Solution> {
    const sol = firstFitDecreasing(inst)
    const used = binsUsed(loads(inst, sol))
    const bound = Math.ceil(inst.sizes.reduce((a, b) => a + b, 0) / inst.capacity)
    // When FFD matches the material lower bound, no packing can do better.
    return {
      solution: sol,
      label: 'first-fit decreasing',
      exact: used === bound,
    }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'bp'
    root.innerHTML = `
      <div class="bp-yard">
        <h3>yard</h3>
        <div class="bp-tray" id="tray"></div>
      </div>
      <div class="bp-bins" id="bins"></div>
      <div class="bp-solver" id="solver" hidden></div>`
    host.appendChild(root)

    const tray = root.querySelector('#tray') as HTMLElement
    const binsEl = root.querySelector('#bins') as HTMLElement
    const solverEl = root.querySelector('#solver') as HTMLElement

    let held = -1
    let sol: Solution = api.current()

    const chip = (i: number, inBin: boolean) => {
      const el = document.createElement('button')
      el.className = `crate${held === i ? ' held' : ''}${inBin ? ' packed' : ''}`
      el.style.setProperty('--size', String(inst.sizes[i]))
      el.textContent = String(inst.sizes[i])
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (inBin) {
          const next = [...sol]
          next[i] = -1
          held = i
          api.commit(next)
        } else {
          held = held === i ? -1 : i
          render()
        }
      })
      return el
    }

    function render() {
      const l = loads(inst, sol)

      tray.innerHTML = ''
      const yard = sol.map((b, i) => ({ b, i })).filter((x) => x.b < 0)
      if (!yard.length) tray.innerHTML = '<p class="bp-empty">yard clear</p>'
      yard.forEach(({ i }) => tray.appendChild(chip(i, false)))

      binsEl.innerHTML = ''
      for (let b = 0; b < inst.bins; b++) {
        const el = document.createElement('div')
        const pct = Math.min(100, (l[b] / inst.capacity) * 100)
        el.className = `bin${l[b] > inst.capacity ? ' over' : ''}${l[b] > 0 ? ' active' : ''}`
        el.innerHTML = `
          <div class="bin-fill" style="height:${pct}%"></div>
          <div class="bin-items"></div>
          <span class="bin-load">${l[b]}<i>/${inst.capacity}</i></span>`
        const items = el.querySelector('.bin-items') as HTMLElement
        sol.forEach((bin, i) => {
          if (bin === b) items.appendChild(chip(i, true))
        })
        el.addEventListener('click', () => {
          if (held < 0) return
          const next = [...sol]
          next[held] = b
          held = -1
          api.commit(next)
        })
        binsEl.appendChild(el)
      }
    }

    function draw(next: Solution, ref: Solution | null) {
      sol = next
      render()
      if (!ref) {
        solverEl.hidden = true
        return
      }
      solverEl.hidden = false
      const refLoads = loads(inst, ref)
      const groups = refLoads
        .map((load, b) => ({
          load,
          items: ref.map((x, i) => (x === b ? inst.sizes[i] : null)).filter((x) => x !== null),
        }))
        .filter((g) => g.load > 0)
      solverEl.innerHTML =
        `<h3>first-fit decreasing fits it on ${groups.length} bins</h3>` +
        groups
          .map(
            (g) =>
              `<div class="bp-refbin"><b>${g.load}</b><span>${g.items.join(' · ')}</span></div>`,
          )
          .join('')
    }

    const clearHeld = () => {
      if (held >= 0) {
        held = -1
        render()
      }
    }
    root.addEventListener('click', clearHeld)

    return {
      draw,
      destroy() {
        root.removeEventListener('click', clearHeld)
        root.remove()
      },
    }
  },
}
