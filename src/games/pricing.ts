import type { Minigame, Reference, RNG } from '../core/types'

const WEEKS = 8
const STOCK = 60
const SALVAGE = 12
const TAGS = [0, 1, 2, 3]

interface Instance {
  prices: number[]
  /** Roughly how many people buy at each price. */
  pull: number[]
  /** What actually turns up each week at each price, fixed by the seed. */
  turnout: number[][]
}
/** The price tag you hung each week. */
type Solution = number[]

function play(inst: Instance, sol: Solution) {
  let left = STOCK
  let take = 0
  const rows: { tag: number; wanted: number; sold: number; cash: number }[] = []
  sol.forEach((tag, w) => {
    const wanted = inst.turnout[w][tag]
    const sold = Math.min(wanted, left)
    left -= sold
    const cash = sold * inst.prices[tag]
    take += cash
    rows.push({ tag, wanted, sold, cash })
  })
  return { rows, left, take: take + (sol.length === WEEKS ? left * SALVAGE : 0) }
}

/**
 * Backwards through the season knowing exactly who turns up. Not a fair fight,
 * since you are guessing and it is not, so a good run lands short of it.
 */
function hindsight(inst: Instance): Solution {
  const V: number[][] = Array.from({ length: WEEKS + 1 }, () => new Array(STOCK + 1).fill(0))
  const pick: number[][] = Array.from({ length: WEEKS }, () => new Array(STOCK + 1).fill(0))
  for (let x = 0; x <= STOCK; x++) V[WEEKS][x] = x * SALVAGE
  for (let w = WEEKS - 1; w >= 0; w--) {
    for (let x = 0; x <= STOCK; x++) {
      let best = -Infinity
      for (const tag of TAGS) {
        const sold = Math.min(inst.turnout[w][tag], x)
        const val = sold * inst.prices[tag] + V[w + 1][x - sold]
        if (val > best) {
          best = val
          pick[w][x] = tag
        }
      }
      V[w][x] = best
    }
  }
  const out: Solution = []
  let left = STOCK
  for (let w = 0; w < WEEKS; w++) {
    const tag = pick[w][left]
    out.push(tag)
    left -= Math.min(inst.turnout[w][tag], left)
  }
  return out
}

export const pricing: Minigame<Instance, Solution> = {
  id: 'pricing',
  title: 'Clearance',
  problem: 'Dynamic Pricing',
  family: 'markets',
  blurb: 'Sixty units and eight weeks to shift them. Drop the price and they fly out at a loss, hold it high and you are left with a pile worth scrap.',
  howTo: 'Hang a price tag on the week and see who turns up. Prices are listed with how many people usually buy at each one. Whatever is left at the end goes for scrap.',
  objective: 'max',
  unit: 'takings',

  generate(rng: RNG): Instance {
    const top = 80 + rng.int(40)
    const prices = [
      Math.round(top * 0.45),
      Math.round(top * 0.62),
      Math.round(top * 0.8),
      top,
    ]
    const pull = [15 + rng.int(7), 10 + rng.int(6), 7 + rng.int(5), 4 + rng.int(4)]
    return {
      prices,
      pull,
      turnout: Array.from({ length: WEEKS }, () =>
        pull.map((m) => Math.max(0, Math.round(m + (rng.next() * 2 - 1) * 5))),
      ),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const left = WEEKS - sol.length
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} week${left === 1 ? '' : 's'} of the season left to price.` }
    }
    const run = play(inst, sol)
    return {
      value: run.take,
      feasible: true,
      note: run.left === 0
        ? 'Sold out before the season ended.'
        : `${run.left} units went for scrap at the end.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: hindsight(inst), label: 'best in hindsight', exact: false }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'prc'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const run = play(inst, sol)
      const week = sol.length
      const done = week >= WEEKS
      const refRun = ref ? play(inst, ref) : null

      const rows = Array.from({ length: WEEKS }, (_, w) => {
        const r = run.rows[w]
        const cls = w === week ? ' now' : r ? ' done' : ''
        const mine = r
          ? `<b>${inst.prices[r.tag]}</b><span>${r.sold} sold</span><em>${r.cash}</em>`
          : `<b>--</b><span></span><em></em>`
        const best = refRun
          ? `<u>${inst.prices[refRun.rows[w].tag]}</u>`
          : ''
        return `<div class="prc-week${cls}"><span class="prc-no">wk ${w + 1}</span>${mine}${best}</div>`
      }).join('')

      const tags = inst.prices
        .map(
          (p, i) =>
            `<button class="prc-tag" data-tag="${i}"${done ? ' disabled' : ''}>
               <b>${p}</b><span>about ${inst.pull[i]} buyers</span>
             </button>`,
        )
        .join('')

      root.innerHTML = `
        <div class="prc-top">
          <div class="prc-stock">
            <span class="prc-label">stock left</span>
            <b>${run.left}</b>
            <i style="width:${(run.left / STOCK) * 100}%"></i>
          </div>
          <div class="prc-take"><span class="prc-label">taken so far</span><b>${run.rows.reduce((a, r) => a + r.cash, 0)}</b></div>
        </div>
        <div class="prc-weeks">${rows}</div>
        ${done ? `<p class="prc-done">Season over. Scrap pays ${SALVAGE} a unit.</p>` : `<div class="prc-tags">${tags}</div>`}`

      root.querySelectorAll<HTMLElement>('.prc-tag').forEach((el) => {
        el.addEventListener('click', () => {
          if (sol.length >= WEEKS) return
          api.commit([...sol, Number(el.dataset.tag)])
        })
      })
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}
