import type { Family, Minigame } from './types'
import { tsp } from '../games/tsp'
import { pmedian } from '../games/pmedian'
import { binpacking } from '../games/binpacking'
import { orienteering } from '../games/orienteering'
import { chinesepostman } from '../games/chinesepostman'
import { singlemachine } from '../games/singlemachine'
import { knapsack } from '../games/knapsack'
import { shortestpath } from '../games/shortestpath'
import { assignment } from '../games/assignment'
import { mst } from '../games/mst'
import { colouring } from '../games/colouring'
import { setcover } from '../games/setcover'
import { newsvendor } from '../games/newsvendor'
import { bandit } from '../games/bandit'
import { overbooking } from '../games/overbooking'
import { parallel } from '../games/parallel'
import { secretary } from '../games/secretary'
import { vertexcover } from '../games/vertexcover'
import { jobshop } from '../games/jobshop'
import { maxflow } from '../games/maxflow'
import { stablematch } from '../games/stablematch'
import { cuttingstock } from '../games/cuttingstock'
import { pcenter } from '../games/pcenter'
import { transportation } from '../games/transportation'
import { dialaride } from '../games/dialaride'
import { qap } from '../games/qap'
import { lotsizing } from '../games/lotsizing'
import { maxclique } from '../games/maxclique'
import { steiner } from '../games/steiner'
import { seatinventory } from '../games/seatinventory'
import { auction } from '../games/auction'
import { flowshop } from '../games/flowshop'
import { maxcover } from '../games/maxcover'
import { ufl } from '../games/ufl'
import { mincut } from '../games/mincut'
import { mdp } from '../games/mdp'
import { setpartition } from '../games/setpartition'
import { eoq } from '../games/eoq'
import { freqassign } from '../games/freqassign'
import { pricing } from '../games/pricing'
import { cfl } from '../games/cfl'
import { gap } from '../games/gap'
import { lineblance } from '../games/lineblance'
import { cvrp } from '../games/cvrp'
import { stacking } from '../games/stacking'
import { berth } from '../games/berth'
import { mcf } from '../games/mcf'
import { erlang } from '../games/erlang'
import { clsp } from '../games/clsp'
import { blending } from '../games/blending'
import { unitcommit } from '../games/unitcommit'
import { openshop } from '../games/openshop'
import { hublocation } from '../games/hublocation'
import { multiflow } from '../games/multiflow'
import { netdesign } from '../games/netdesign'
import { rcpsp } from '../games/rcpsp'
import { queuestaff } from '../games/queuestaff'
import { twostage } from '../games/twostage'
import { districting } from '../games/districting'
import { vrptw } from '../games/vrptw'
import { locrouting } from '../games/locrouting'
import { jointrep } from '../games/jointrep'
import { pallet } from '../games/pallet'
import { timetable } from '../games/timetable'
import { rostering } from '../games/rostering'
import { strippack } from '../games/strippack'
import { container } from '../games/container'
import { stacker } from '../games/stacker'
import { invrouting } from '../games/invrouting'
import { backroom } from '../games/backroom'
import { safetystock } from '../games/safetystock'
import { quaycrane } from '../games/quaycrane'
import { mdknapsack } from '../games/mdknapsack'

/**
 * The ten families of Operations Research, and the named problems inside them.
 * Every entry here is a minigame slot: the home page renders the whole field
 * and marks the ones that are playable. Adding a game means writing one file
 * and appending it to GAMES — the problem string links it to its slot.
 */
export const FAMILIES: Family[] = [
  {
    id: 'routing',
    name: 'Routing',
    accent: '#ff8c42',
    problems: [
      'Travelling Salesman Problem',
      'Capacitated Vehicle Routing',
      'Vehicle Routing with Time Windows',
      'Pickup and Delivery',
      'Dial-a-Ride',
      'Chinese Postman',
      'Orienteering',
      'Inventory Routing',
    ],
  },
  {
    id: 'scheduling',
    name: 'Scheduling & Sequencing',
    accent: '#d264ff',
    problems: [
      'Single Machine Scheduling',
      'Parallel Machine Scheduling',
      'Flow Shop Scheduling',
      'Job Shop Scheduling',
      'Open Shop Scheduling',
      'Resource-Constrained Project Scheduling',
      'Exam Timetabling',
      'Crew Rostering',
      'Quay Crane Scheduling',
      'Berth Allocation',
    ],
  },
  {
    id: 'location',
    name: 'Location & Allocation',
    accent: '#3ddbd9',
    problems: [
      'p-Median',
      'p-Center',
      'Uncapacitated Facility Location',
      'Capacitated Facility Location',
      'Maximal Covering Location',
      'Hub Location',
      'Location-Routing',
      'Districting',
    ],
  },
  {
    id: 'packing',
    name: 'Cutting, Packing & Loading',
    accent: '#52e68a',
    problems: [
      '0-1 Knapsack',
      'Multi-Dimensional Knapsack',
      'Bin Packing',
      'Cutting Stock',
      'Strip Packing',
      '3D Container Loading',
      'Pallet Loading',
      'Block Relocation (Container Stacking)',
    ],
  },
  {
    id: 'flow',
    name: 'Network Flow & Design',
    accent: '#5b8cff',
    problems: [
      'Shortest Path',
      'Maximum Flow',
      'Minimum-Cost Flow',
      'Multicommodity Flow',
      'Minimum Spanning Tree',
      'Steiner Tree',
      'Network Design',
    ],
  },
  {
    id: 'assignment',
    name: 'Assignment & Matching',
    accent: '#ff4d9d',
    problems: [
      'Linear Assignment',
      'Generalized Assignment',
      'Quadratic Assignment (Facility Layout)',
      'Stable Matching',
      'Transportation Problem',
      'Assembly Line Balancing',
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory & Supply Chain',
    accent: '#ffbe3d',
    problems: [
      'Economic Order Quantity',
      'Newsvendor',
      'Wagner-Whitin Lot Sizing',
      'Capacitated Lot Sizing',
      'Joint Replenishment',
      'Multi-Echelon Inventory',
      'Safety Stock Placement',
    ],
  },
  {
    id: 'stochastic',
    name: 'Stochastic & Dynamic',
    accent: '#8b7bff',
    problems: [
      'M/M/1 Queue Staffing',
      'Erlang Call-Centre Staffing',
      'Markov Decision Process',
      'Multi-Armed Bandit',
      'Two-Stage Stochastic Program',
      'Secretary Problem',
    ],
  },
  {
    id: 'covering',
    name: 'Covering & Graph Combinatorics',
    accent: '#ff5c7a',
    problems: [
      'Set Covering',
      'Set Partitioning',
      'Graph Colouring',
      'Frequency Assignment',
      'Maximum Clique',
      'Vertex Cover',
      'Minimum Cut',
    ],
  },
  {
    id: 'markets',
    name: 'Pricing, Markets & Decisions',
    accent: '#b4e84a',
    problems: [
      'Dynamic Pricing',
      'Seat Inventory Control',
      'Overbooking',
      'Combinatorial Auction',
      'Unit Commitment',
      'Blending Problem',
    ],
  },
]

/** Every playable game. Append here; the home page picks it up automatically. */
export const GAMES: Minigame<any, any>[] = [
  tsp,
  cvrp,
  vrptw,
  stacker,
  invrouting,
  orienteering,
  chinesepostman,
  dialaride,
  singlemachine,
  flowshop,
  berth,
  quaycrane,
  openshop,
  rcpsp,
  timetable,
  rostering,
  pmedian,
  hublocation,
  districting,
  locrouting,
  pcenter,
  maxcover,
  ufl,
  cfl,
  knapsack,
  mdknapsack,
  cuttingstock,
  stacking,
  binpacking,
  pallet,
  strippack,
  container,
  shortestpath,
  mst,
  steiner,
  assignment,
  setcover,
  colouring,
  maxclique,
  mincut,
  setpartition,
  freqassign,
  newsvendor,
  bandit,
  mdp,
  erlang,
  queuestaff,
  twostage,
  secretary,
  overbooking,
  seatinventory,
  auction,
  pricing,
  blending,
  unitcommit,
  parallel,
  jobshop,
  maxflow,
  mcf,
  multiflow,
  netdesign,
  stablematch,
  qap,
  gap,
  lineblance,
  transportation,
  lotsizing,
  eoq,
  jointrep,
  backroom,
  safetystock,
  clsp,
  vertexcover,
]

export const familyById = (id: string): Family | undefined => FAMILIES.find((f) => f.id === id)

export const gameById = (id: string): Minigame<any, any> | undefined =>
  GAMES.find((g) => g.id === id)

export const gameForProblem = (problem: string): Minigame<any, any> | undefined =>
  GAMES.find((g) => g.problem === problem)

export const totalProblems = (): number =>
  FAMILIES.reduce((n, f) => n + f.problems.length, 0)
