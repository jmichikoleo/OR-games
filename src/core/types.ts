// The contract every minigame implements. Keep it small: the whole point is
// that adding problem #31 means writing one file, not touching the shell.

export type FamilyId =
  | 'routing'
  | 'scheduling'
  | 'location'
  | 'packing'
  | 'flow'
  | 'assignment'
  | 'inventory'
  | 'stochastic'
  | 'covering'
  | 'markets'

export interface Family {
  id: FamilyId
  name: string
  accent: string
  /** Formal problem names in this family — the backlog, rendered on the home page. */
  problems: string[]
}

export interface RNG {
  /** float in [0, 1) */
  next(): number
  /** int in [0, n) */
  int(n: number): number
  /** float in [lo, hi) */
  range(lo: number, hi: number): number
  pick<T>(xs: readonly T[]): T
}

export interface Evaluation {
  /** Objective value of the player's solution. */
  value: number
  /** A solution that breaks a hard constraint scores nothing. */
  feasible: boolean
  /** Shown in the HUD: why it's infeasible, or what's left to do. */
  note: string
}

export interface Reference<S> {
  solution: S
  /** Algorithm that produced it, e.g. "nearest neighbour + 2-opt". */
  label: string
  /** True when this is provably optimal, not just a good heuristic. */
  exact: boolean
}

export interface GameApi<S> {
  /** Push a new solution. The shell re-evaluates, re-scores and redraws. */
  commit(solution: S): void
  /** Current solution, for games that mutate incrementally. */
  current(): S
}

export interface GameView<S> {
  /** Called by the shell on every state change. `ref` is non-null once revealed. */
  draw(solution: S, ref: S | null): void
  destroy(): void
}

export interface Minigame<I = unknown, S = unknown> {
  id: string
  /** The arcade name. */
  title: string
  /** The formal name, so the site doubles as a map of the field. */
  problem: string
  family: FamilyId
  /** One line: what you're optimising. */
  blurb: string
  /** One line: what to do with the mouse. */
  howTo: string
  objective: 'min' | 'max'
  /** Unit label for the objective, e.g. "km", "bins", "hours". */
  unit: string

  generate(rng: RNG): I
  initial(instance: I): S
  evaluate(instance: I, solution: S): Evaluation
  solve(instance: I): Reference<S>
  mount(host: HTMLElement, instance: I, api: GameApi<S>): GameView<S>
}
