# OR-Game

An arcade of hard problems. One minigame for every problem in Operations
Research, 73 of them, grouped into ten families.

You solve an instance by hand. Then a real solver has a go at the same board.
Your score is how close you got.

That single number is the whole design. It means 73 wildly different problems,
from routing a van to staffing a call centre to loading a pallet, all read the
same way, and it means the game never has to invent a difficulty curve. The
problems already have one.

```bash
npm install
npm run dev
```

No server, no accounts, no build step beyond Vite. Everything runs in the
browser.

## How it plays

Pick a game. You get a board and a number you are trying to push up or down.
Rearrange things until you are happy, then hit **reveal solver** and see what
the optimum actually was, drawn over your attempt.

Most games open on a deliberately naive answer. The obvious opening move,
the thing anybody would do first. It is usually somewhere between 40 and 85
percent of optimal, and the gap is the lesson.

A few examples of what that gap is made of:

- **Before You Know** hands you the planting plan that wins in a normal year.
  It loses money on average, because the bad years cost more than the good
  ones pay.
- **The Back Room** starts with all the stock sent out to the shops. The right
  answer leaves every shop more likely than not to run short on its own, and
  holds the difference centrally.
- **Breaking Point** starts with the spare capacity piled onto the busiest
  queue. Queues do not work like that.
- **Keep the Lights On** starts by firing up the stations that are cheapest to
  start. They are the dearest to run.

## Scores

There are no accounts. A player is a name kept in `localStorage`, and each
player's best score on every game is kept under their own id. Several people
can share a browser and keep separate scores, and nothing leaves the machine.

That does mean scores are per browser. Play on your phone and your laptop and
you will have two sets.

## The games

### Routing

| problem | game | you are |
|---|---|---|
| Travelling Salesman Problem | **Milk Run** | minimising |
| Capacitated Vehicle Routing | **Three Vans** | minimising |
| Vehicle Routing with Time Windows | **On the Clock** | minimising |
| Pickup and Delivery | **Running Empty** | minimising |
| Dial-a-Ride | **Shared Ride** | minimising |
| Chinese Postman | **Every Street** | minimising |
| Orienteering | **Prize Run** | maximising |
| Inventory Routing | **Top Them Up** | minimising |

### Scheduling & Sequencing

| problem | game | you are |
|---|---|---|
| Single Machine Scheduling | **One Machine** | minimising |
| Parallel Machine Scheduling | **Three Lines** | minimising |
| Flow Shop Scheduling | **Assembly Line** | minimising |
| Job Shop Scheduling | **Shop Floor** | minimising |
| Open Shop Scheduling | **Any Order** | minimising |
| Resource-Constrained Project Scheduling | **One Crew** | minimising |
| Exam Timetabling | **Exam Week** | minimising |
| Crew Rostering | **Who Works When** | minimising |
| Quay Crane Scheduling | **Quayside** | minimising |
| Berth Allocation | **Alongside** | minimising |

### Location & Allocation

| problem | game | you are |
|---|---|---|
| p-Median | **Three Depots** | minimising |
| p-Center | **Worst Case** | minimising |
| Uncapacitated Facility Location | **Worth Opening** | minimising |
| Capacitated Facility Location | **Room to Ship** | minimising |
| Maximal Covering Location | **In Range** | maximising |
| Hub Location | **Spokes** | minimising |
| Location-Routing | **Yards and Rounds** | minimising |
| Districting | **Fair Shares** | minimising |

### Cutting, Packing & Loading

| problem | game | you are |
|---|---|---|
| 0-1 Knapsack | **The Heist** | maximising |
| Multi-Dimensional Knapsack | **Two Limits** | maximising |
| Bin Packing | **Tetris Logistics** | minimising |
| Cutting Stock | **Roll Cutter** | minimising |
| Strip Packing | **Off the Roll** | minimising |
| 3D Container Loading | **Deep Stack** | maximising |
| Pallet Loading | **Stack It** | maximising |
| Block Relocation (Container Stacking) | **Top of the Stack** | minimising |

### Network Flow & Design

| problem | game | you are |
|---|---|---|
| Shortest Path | **Toll Roads** | minimising |
| Maximum Flow | **Full Pressure** | maximising |
| Minimum-Cost Flow | **Best Value** | minimising |
| Multicommodity Flow | **Shared Pipes** | minimising |
| Minimum Spanning Tree | **Wire It Up** | minimising |
| Steiner Tree | **Four Villages** | minimising |
| Network Design | **Which Roads** | minimising |

### Assignment & Matching

| problem | game | you are |
|---|---|---|
| Linear Assignment | **Crew Call** | minimising |
| Generalized Assignment | **Split the Work** | minimising |
| Quadratic Assignment (Facility Layout) | **Floor Plan** | minimising |
| Stable Matching | **The Match** | minimising |
| Transportation Problem | **Freight** | minimising |
| Assembly Line Balancing | **Balance the Line** | minimising |

### Inventory & Supply Chain

| problem | game | you are |
|---|---|---|
| Economic Order Quantity | **Reorder** | minimising |
| Newsvendor | **Morning Papers** | maximising |
| Wagner-Whitin Lot Sizing | **Batch Run** | minimising |
| Capacitated Lot Sizing | **Make to Fit** | minimising |
| Joint Replenishment | **One Lorry** | minimising |
| Multi-Echelon Inventory | **The Back Room** | minimising |
| Safety Stock Placement | **Where the Buffer Goes** | minimising |

### Stochastic & Dynamic

| problem | game | you are |
|---|---|---|
| M/M/1 Queue Staffing | **Breaking Point** | minimising |
| Erlang Call-Centre Staffing | **On the Phones** | minimising |
| Markov Decision Process | **Slippery Floor** | maximising |
| Multi-Armed Bandit | **Six Levers** | maximising |
| Two-Stage Stochastic Program | **Before You Know** | maximising |
| Secretary Problem | **Hire or Pass** | maximising |

### Covering & Graph Combinatorics

| problem | game | you are |
|---|---|---|
| Set Covering | **Fire Stations** | minimising |
| Set Partitioning | **One Each** | minimising |
| Graph Colouring | **Colour Clash** | minimising |
| Frequency Assignment | **Radio Silence** | minimising |
| Maximum Clique | **Round Table** | maximising |
| Vertex Cover | **Guard Posts** | minimising |
| Minimum Cut | **Clean Break** | minimising |

### Pricing, Markets & Decisions

| problem | game | you are |
|---|---|---|
| Dynamic Pricing | **Clearance** | maximising |
| Seat Inventory Control | **Hold Back** | maximising |
| Overbooking | **One More Seat** | maximising |
| Combinatorial Auction | **Going Once** | maximising |
| Unit Commitment | **Keep the Lights On** | minimising |
| Blending Problem | **The Mix** | minimising |

## For anybody reading the code

One file per game, one interface, no framework.

```
src/core/     engine. nothing problem specific lives here
  types.ts      the Minigame contract
  shell.ts      page chrome, scoring, reveal, seeds, best score
  registry.ts   the ten families and their games
  canvas.ts     virtual coordinate canvas surface, DPR aware, per game aspect
  geom.ts       points, distances, tour length, scatter, union find
  graph.ts      planar map builder and adjacency
  flow.ts       min cost flow, shared by four games
  rng.ts        seeded RNG so instances are shareable
  profile.ts    local player profiles
  ui.ts         top bar, sign in sheet, tutorial
src/games/    73 files, one per problem
```

A game implements seven things and the shell does the rest. It never scores
itself.

| member | does |
|---|---|
| `generate(rng)` | build an instance from a seed |
| `initial(inst)` | the starting solution, usually a deliberate mistake |
| `evaluate(inst, sol)` | objective value, feasibility, and a line for the HUD |
| `solve(inst)` | reference solution, its algorithm, and whether it is exact |
| `mount(host, inst, api)` | render and take input, call `api.commit(next)` on change |
| `objective` / `unit` | `'min'` or `'max'`, and the label for the number |
| `title` / `problem` / `family` | arcade name, formal name, family |

Adding one means writing `src/games/<id>.ts` and appending it to `GAMES` in
`registry.ts`. Set `problem` to the exact string in that family's list and the
home page lights the slot up by itself.

### Seeds

Every instance comes from a seeded RNG, and the seed is printed under the
board. Two people on the same seed are solving the same board, so a score is
comparable and a hard instance can be passed around.

### Instance filters

Most `generate` bodies throw an instance away when the obvious opening move is
already close to the answer, because a game that opens at 97 percent is not a
game. Every one of those loops carries a `tries` cap that drops the bar away,
so a filter that turns out to be unsatisfiable degrades to a weaker instance
rather than locking the tab.

### Randomness

Games involving uncertainty are scored on **expected value or a fixed pre drawn
outcome, never on a live dice roll**, otherwise the score would measure luck
instead of the decision. `newsvendor`, `overbooking`, `backroom` and
`twostage` score expected value under the stated distribution. `bandit`,
`secretary` and `pricing` pre draw their whole outcome table from the seed, so
the benchmark is exactly computable and two players on the same seed face
identical instances. Those three are marked **not exact** on purpose, because
the benchmark is a hindsight one and a sharp run can beat it.

### Reference solvers

Exact wherever the instance is small enough. The HUD then says "optimal"
instead of naming an algorithm, and the score is a true optimality gap. Where
a solver is a heuristic, the HUD names it and a player who beats it scores
above 100 percent, which is deliberate.

- `tsp` Held-Karp at n=13, exact
- `orienteering` Held-Karp over subsets, best-scoring set inside the budget, exact
- `chinesepostman` Floyd-Warshall, min-weight matching on odd corners (DP over
  subsets), then Hierholzer for the Euler circuit, exact
- `singlemachine` DP over subsets for `1 || sum w_j T_j`, exact at n=9
- `knapsack` capacity DP with a take-table, exact
- `shortestpath` Dijkstra, exact
- `assignment` Hungarian (shortest augmenting path), exact; fuzz-checked
  against brute force on 3000 random matrices at n=2..8
- `mst` Kruskal, exact
- `colouring` backtracking k-colouring with a symmetry break, searched from
  k=1 up, so the reference is the true chromatic number
- `setcover` exhaustive over 2^10 subsets, exact
- `newsvendor` shelf-space DP over the four titles, exact; fuzz-checked
  against brute force on 120 generated instances
- `overbooking` expected profit enumerated over every booking limit, exact
- `bandit` best fixed arm in hindsight. Deliberately NOT exact: a clairvoyant
  could cherry-pick across arms, so a lucky run can score above 100
- `parallel` every assignment of 12 jobs to 3 machines, with job A pinned to
  the first machine (identical machines, so the symmetry break is free), exact
- `vertexcover` exhaustive over 2^14 subsets, exact
- `secretary` best "pass k, then take the next record" rule on the six drawn
  shuffles. Like `bandit`, NOT exact: a clairvoyant would take the best every
  round, so a sharp run can beat it
- `jobshop` every combination of machine orders (24 per machine, three
  machines, 13,824 in all), scheduled by longest path through the disjunctive
  graph; combinations that deadlock are discarded. Exact
- `maxflow` Edmonds-Karp, exact; the reveal draws the min cut rather than
  just the number
- `stablematch` all 120 pairings, keep the stable ones, take the lowest total
  regret. Exact, and it is the *fairest* stable match, not the Gale-Shapley one
  that favours whichever side proposes
- `cuttingstock` enumerate every way one roll can be cut, then DP over the
  outstanding-order vector (~1300 states). Exact
- `pcenter` exhaustive over C(10,3). Exact, and note this minimises the
  *worst* trip, where `pmedian` on the same board minimises the total
- `transportation` min-cost flow by successive shortest paths; fuzz-checked
  against brute force on 400 small instances, row and column totals included
- `dialaride` Held-Karp over subsets of the ten stops. A subset is reachable
  only if every drop-off in it has its pickup, and the van was never over
  capacity, both readable straight off the subset, so the DP stays exact
- `qap` all 8! = 40,320 layouts. Exact
- `lotsizing` Wagner-Whitin, the classic O(T^2) DP. Exact
- `maxclique` all 2^14 groups checked. Exact
- `steiner` every subset of the spare towns, with a minimum spanning tree
  over each. Exact
- `seatinventory` expected revenue worked out for every pair of protection
  levels. Exact
- `auction` all 2^12 combinations of bids, rejecting any that want the same
  lot. Exact
- `flowshop` all 6! queues run through the line. Exact
- `maxcover` exhaustive over C(12,3) placements. Exact
- `ufl` all 2^12 subsets of depots costed out, rent plus deliveries. Exact
- `mincut` every split of twelve nodes into two non-empty sides, with node 1
  pinned to kill the mirror-image duplicates. Exact
- `mdp` value iteration on the thirty square grid, then the greedy policy that
  falls out of it. Exact to well inside a tenth of a point
- `setpartition` all 2^12 combinations of rosters, keeping only the ones that
  hit every flight exactly once. Exact
- `eoq` order sizes are multiples of five, so a shelf-space DP settles it. Exact
- `freqassign` backtracking that walks the top channel up from one until every
  mast fits. Exact
- `cfl` all 2^7 subsets of depots, and for each one the shipping is a plain
  transportation problem that `core/flow.ts` settles exactly
- `pricing` backwards through the season knowing exactly who turns up. NOT
  exact, since you are guessing and it is not, so a good run lands short of it
- `gap` all 4^9 ways of handing the jobs out, rejecting any that book a
  contractor past their hours. Exact
- `lineblance` DP over which tasks are already done. From any finished set a
  station can take any group whose prerequisites are behind it and that fits
  the cycle time. Exact
- `cvrp` the best round trip for every group of drops a van could legally
  carry, by Held-Karp, then the cheapest way to split nine drops into at most
  three of those groups. Exact
- `stacking` iterative deepening with the blocker count as the floor, and only
  the container sitting on the one you want is ever worth shifting. Exact
- `berth` every way of slotting six ships into three ordered queues, 20,160 of
  them. Exact
- `mcf` successive shortest paths from `core/flow.ts`, stopped at the ordered
  amount. Exact
- `erlang` Erlang C through the Erlang B recursion gives the requirement each
  half hour, then a pruned search over the five shifts. Exact
- `clsp` DP over the week and the stock carried into it, on a ten unit grid.
  Exact
- `blending` every way of making twenty sacks out of five things, 10,626 of
  them. Exact
- `stacker` Held-Karp over the loads. The lorry only ever carries one thing,
  so the order is the whole decision and the loaded miles are a constant.
  Exact, and the score is the empty miles alone
- `invrouting` walk the sets of shops day by day, dropping any week that has
  already cost more than the best found or has let a tank run dry, with a
  last-minute roster as the opening incumbent. Exact
- `backroom` every way of splitting the stock four ways, each one costed
  across every day the three shops could have between them. Exact
- `safetystock` the Graves and Willems service-time model on a serial chain.
  All that matters at a stage is what the one above it promised, so a walk
  down the chain settles it. Exact
- `timetable` hand the papers out one at a time, dropping any branch that has
  already cost more than the best week found so far. Exact
- `rostering` every rota for every one of the six, 262,144 of them, with the
  branch dropped as soon as the wages alone beat the best week. Exact
- `strippack` **the banded variant**, and the game says so in as many words.
  The blade only goes straight across the roll, so the pieces come off in
  bands and a band costs whatever its longest piece costs. That makes it a
  subset DP over which pieces share a band, 3^9 of them, and exact. Full two
  dimensional strip packing at nine pieces ran to seconds in testing, which is
  why the banded problem is the one being played rather than a heuristic
  pretending to be exact
- `container` take the first corner nobody has claimed, working across then
  back then up, and either start a box there any way up or give that corner up
  for lost. The bound is what the space left could hold if it packed
  perfectly. Exact. Container and box sizes come from a list picked beforehand
  where the boxes provably cannot fill the space and the search settles in a
  few milliseconds
- `locrouting` one Held-Karp out of each yard, kept for every set of shops
  rather than just the full one, then all 19,683 ways of handing nine shops to
  three yards. Exact
- `jointrep` once the lorry's cycle is fixed each line settles on its own, so
  walking the twelve cycles settles the lot. Exact. A line waits at most eight
  lorries, and the numbers are picked so that cap never binds on the answer
- `pallet` take the top left square nobody has claimed and either start a box
  there, either way up, or give the square up for lost. That covers every
  packing there is, and the bound is what the space left could hold if it were
  perfect. Exact. Pallet and box sizes come from a list picked beforehand where
  the boxes provably cannot tile the pallet and the search settles in well
  under a millisecond
- `vrptw` Held-Karp where the number held is the earliest you can be finished
  at that stop having called on that set. Turning up early only ever means
  waiting, so earliest is always at least as good and the search stays exact
- `districting` every way of cutting twelve wards into three seats, written in
  a form that never counts the same map twice under different seat numbers,
  around 88,000 of them, with the ones that come apart thrown out. Exact, and
  checked against a plain 3^12 enumeration
- `twostage` all 23,426 ways of splitting the land, each scored on the average
  of the three years. Exact. The plan that wins in a normal year is kept as the
  starting point precisely because it is not the plan that wins on average
- `netdesign` all 8,192 sets of roads, each one routed by `core/flow.ts`. The
  build bill alone throws most sets out before any routing happens. Exact
- `rcpsp` depth first over the orders the nine jobs could go out in, each order
  run through the serial schedule generator, cut off by the longest run of work
  still ahead of whatever is left. Exact, since every active schedule comes out
  of some order
- `queuestaff` all 10,626 ways of splitting twenty modules five ways, each one
  costed with the M/M/1 queue length. Exact
- `openshop` depth first over the orders you could feed the nine operations
  in, cut off by the work each machine and each job still has left. Exact, and
  checked against an independent run over all 46,656 orientations of the
  disjunctive graph on 120 instances
- `hublocation` all C(10,3) sets of hubs, each one costed with every town
  feeding its nearest. Exact
- `multiflow` every split of every order across its four routes, 4,000 in all,
  rejecting any that overfills a pipe. Exact
- `unitcommit` DP across the eight hours over which stations are lit, 16 by 16
  transitions an hour, with the dispatch inside an hour settled by merit order.
  Exact. Instances are only kept when the obvious hour-by-hour start is at
  least ten percent off the answer, so there is always something to find
- `quaycrane` cranes share one rail and cannot pass, so a plan is two cuts.
  All 66 of them checked. Exact
- `mdknapsack` all 2^14 loadings against both limits. Exact
- `pmedian` exhaustive over C(10,3), exact
- `binpacking` first-fit decreasing, marked exact only when it ties the
  material lower bound `ceil(sum / capacity)`

One game is solved exactly for a **stated restriction** rather than the
textbook problem, and it says so in the game itself rather than burying it
here. `strippack` is the banded variant, because the blade only cuts straight
across the roll. Full two dimensional strip packing at nine pieces ran to
seconds in testing, and a heuristic labelled "optimal" would have been worse
than an honest restriction.

Two games, `pallet` and `container`, pick their sizes from a list worked out
beforehand. Those solves are exact for the real problem. The list exists so
that every instance is one where the boxes provably cannot fill the space and
the search still settles in milliseconds.

## Built

All 73, across all ten families. Every game was played to completion in a
browser before it shipped, and in almost all of them the optimum was reached
through the interface rather than argued for on paper. The exceptions are
`locrouting`, `rcpsp` and `timetable`, where hill climbing stalls short but
the player's solution space is provably the same set the solver enumerates
under the same cost function, so a hundred percent is reachable.
