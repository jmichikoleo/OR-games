import type { Minigame, Reference, RNG } from '../core/types'

const PIECES = 9
const FULL = 1 << PIECES
const ROLL = 12

interface Instance {
  /** Across the roll, and along it. */
  across: number[]
  along: number[]
}
/** Which band each piece is cut in. Bands left empty cost nothing. */
type Solution = number[]

const bandsOf = (sol: Solution): number[][] => {
  const out: number[][] = Array.from({ length: PIECES }, () => [])
  sol.forEach((b, i) => out[b].push(i))
  return out
}

const widthOf = (inst: Instance, band: number[]) =>
  band.reduce((a, i) => a + inst.across[i], 0)

const depthOf = (inst: Instance, band: number[]) =>
  band.reduce((a, i) => Math.max(a, inst.along[i]), 0)

const lengthOf = (inst: Instance, sol: Solution) =>
  bandsOf(sol).reduce((a, band) => a + depthOf(inst, band), 0)

/**
 * Work through the sets of pieces. Whatever is left, the piece with the
 * lowest number has to be in some band, so try every band it could share
 * with. Three to the nine of them, which is nothing.
 */
function bestCut(inst: Instance): Solution {
  const cost = new Float64Array(FULL).fill(Infinity)
  const pick = new Int32Array(FULL).fill(0)
  cost[0] = 0
  for (let mask = 1; mask < FULL; mask++) {
    let low = 0
    while (!((mask >> low) & 1)) low++
    const rest = mask ^ (1 << low)
    // Every band that contains the lowest piece is that piece plus a subset
    // of what is left, so walk the submasks of the rest.
    for (let sub = rest; ; sub = (sub - 1) & rest) {
      const band = sub | (1 << low)
      let w = 0
      let d = 0
      for (let i = 0; i < PIECES; i++) {
        if (!((band >> i) & 1)) continue
        w += inst.across[i]
        d = Math.max(d, inst.along[i])
      }
      if (w <= ROLL) {
        const v = d + cost[mask ^ band]
        if (v < cost[mask]) {
          cost[mask] = v
          pick[mask] = band
        }
      }
      if (sub === 0) break
    }
  }
  const sol = new Array(PIECES).fill(0)
  let mask = FULL - 1
  let band = 0
  while (mask) {
    const take = pick[mask]
    for (let i = 0; i < PIECES; i++) if ((take >> i) & 1) sol[i] = band
    mask ^= take
    band++
  }
  return sol
}

/** Cut them in the order they came in, starting a new band whenever the
 *  next piece will not go across. */
function inOrder(inst: Instance): Solution {
  const sol = new Array(PIECES).fill(0)
  let band = 0
  let used = 0
  for (let i = 0; i < PIECES; i++) {
    if (used + inst.across[i] > ROLL) {
      band++
      used = 0
    }
    sol[i] = band
    used += inst.across[i]
  }
  return sol
}

export const strippack: Minigame<Instance, Solution> = {
  id: 'strippack',
  title: 'Off the Roll',
  problem: 'Strip Packing',
  family: 'packing',
  blurb: 'Nine pieces to cut from one roll twelve across. The blade only goes straight across the whole roll, so the pieces come off in bands, and a band costs whatever its longest piece costs even if everything beside it is short.',
  howTo: 'Click the right half of a piece to drop it into the band below and the left half to lift it into the one above. Pieces in a band have to fit across the roll between them. Put the long ones together.',
  objective: 'min',
  unit: 'along',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        across: Array.from({ length: PIECES }, () => 2 + rng.int(6)),
        along: Array.from({ length: PIECES }, () => 1 + rng.int(5)),
      }
      const best = lengthOf(inst, bestCut(inst))
      const plain = lengthOf(inst, inOrder(inst))
      // Only a roll where cutting them in the order they came is wasteful.
      if (best / plain < 0.86 || tries > 300) return inst
    }
  },

  initial(inst): Solution {
    return inOrder(inst)
  },

  evaluate(inst, sol) {
    const bands = bandsOf(sol).filter((b) => b.length)
    const over = bands.filter((b) => widthOf(inst, b) > ROLL)
    if (over.length) {
      const worst = over.reduce((a, b) => (widthOf(inst, b) > widthOf(inst, a) ? b : a))
      return {
        value: 0,
        feasible: false,
        note: `${over.length} band${over.length === 1 ? '' : 's'} run past the edge, the worst by ${widthOf(inst, worst) - ROLL}.`,
      }
    }
    const waste = bands.reduce(
      (a, b) => a + depthOf(inst, b) * ROLL - b.reduce((c, i) => c + inst.across[i] * inst.along[i], 0),
      0,
    )
    return {
      value: lengthOf(inst, sol),
      feasible: true,
      note: `${bands.length} band${bands.length === 1 ? '' : 's'} cut, ${waste} squares of roll thrown away.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestCut(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'stp'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const bands = bandsOf(sol)
      const last = bands.reduce((a, b, i) => (b.length ? i : a), 0)
      root.innerHTML = ''
      for (let b = 0; b <= Math.min(PIECES - 1, last + 1); b++) {
        const band = bands[b]
        const w = widthOf(inst, band)
        const d = depthOf(inst, band)
        const row = document.createElement('div')
        row.className = `stp-band${w > ROLL ? ' over' : ''}${band.length ? '' : ' empty'}`
        row.innerHTML = `<span class="stp-tag">${band.length ? `${d} along` : 'spare band'}</span><div class="stp-run"></div><span class="stp-fit">${band.length ? `${w} of ${ROLL} across` : ''}</span>`
        const run = row.querySelector('.stp-run') as HTMLElement
        run.style.height = `${18 + Math.max(d, 1) * 13}px`
        band.forEach((i) => {
          const cut = document.createElement('button')
          cut.className = `stp-piece${ref && ref[i] !== b ? ' moved' : ''}`
          cut.style.flexBasis = `${(inst.across[i] / ROLL) * 100}%`
          cut.style.height = `${(inst.along[i] / Math.max(d, 1)) * 100}%`
          cut.innerHTML = `<b>${inst.across[i]} by ${inst.along[i]}</b>`
          cut.addEventListener('click', (ev) => {
            const box = cut.getBoundingClientRect()
            const down = ev.clientX - box.left > box.width / 2
            const next = [...sol]
            next[i] = Math.max(0, Math.min(PIECES - 1, next[i] + (down ? 1 : -1)))
            if (next[i] !== sol[i]) api.commit(next)
          })
          run.appendChild(cut)
        })
        root.appendChild(row)
      }
      const total = document.createElement('div')
      total.className = 'stp-total'
      total.textContent = `${lengthOf(inst, sol)} along the roll used`
      root.appendChild(total)
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}
