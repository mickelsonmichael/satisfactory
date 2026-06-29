// Factory efficiency / bottleneck analysis.
//
// Given the FactoryGraph (lib/factoryGraph.ts) plus recipe rates and resource purity,
// estimates how fully each miner/factory is utilized and why.
//
// Model (deliberately approximate — see the plan): conveyor/pipe networks reach a
// steady-state where, within one connected network carrying an item, total supply
// balances total demand; the exact per-belt split through splitters/mergers doesn't
// change that balance, so each connected network is treated as a shared pool:
//   - solid items: a connected component of the directed edges (taken undirected)
//   - fluids: a pipe network (grouped by mPipeNetworkID)
// For each (pool, item): supplyFraction = demand/supply (producers throttled when they
// out-produce demand → "blocked"); demandFraction = supply/demand (consumers throttled
// when undersupplied → "starved"). A single pass on base rates is used rather than
// iterating cascades: it is stable, and the save's own productivity measurement is shown
// alongside as the ground-truth uptime.

import type {
  EfficiencyNeighbor,
  EfficiencyReport,
  EfficiencyResult,
  EfficiencyStatus,
  FactoryGraph,
  FactoryNode,
  RecipeData,
  ResourceData,
  ResourcePurity,
} from '../types';
import { humanize } from './buildings';
import { extractorRatePerMin, inputsPerMin, outputsPerMin, type ItemRate } from './productionRates';

const FULL = 0.95; // ≥ this fraction counts as fully utilized

// Per-node production/consumption at full clock (base rates), plus role flags.
interface NodeIO {
  produces: ItemRate[];
  consumes: ItemRate[];
  isSink: boolean;
  primaryItem?: string; // representative output/extracted item for the headline rate
  primaryMax: number;   // its per-minute rate at full clock
  recipeName?: string;  // display name of the running recipe (factories)
}

// Object class name (with the "_C" suffix) from a full path. shortClass() drops the
// suffix because it splits on the first dot; recipe keys in recipes.json keep it, so the
// real class name is the segment after the LAST dot:
// "/Game/…/Recipe_IngotIron.Recipe_IngotIron_C" → "Recipe_IngotIron_C".
const classNameOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);

const itemName = (data: RecipeData, item: string): string =>
  data.items[item]?.name ?? humanize(item.replace(/^Desc_/, '').replace(/_C$/, ''));
const isLiquid = (data: RecipeData, item: string): boolean => data.items[item]?.liquid ?? false;

// Map a resource-node id (from a miner's mExtractableResource) to the item + purity it
// yields, using the static resource-node database.
function buildResourceInfo(
  resourceData: ResourceData | null,
): Map<string, { item: string; purity: ResourcePurity | null }> {
  const m = new Map<string, { item: string; purity: ResourcePurity | null }>();
  for (const layer of resourceData?.layers ?? []) {
    for (const marker of layer.markers) m.set(marker.id, { item: layer.type, purity: marker.purity });
  }
  return m;
}

// What an extractor pulls and how fast. Water/oil are known from the building; solid ores
// come from the resource node it sits on.
function extractorIO(
  node: FactoryNode,
  resInfo: Map<string, { item: string; purity: ResourcePurity | null }>,
): NodeIO {
  let item: string | undefined;
  let purity: ResourcePurity | null = null;
  if (/WaterPump/.test(node.cls)) item = 'Desc_Water_C';
  else if (/OilPump/.test(node.cls)) {
    item = 'Desc_LiquidOil_C';
    purity = resInfo.get(node.resourceNodeId ?? '')?.purity ?? null;
  } else {
    const info = node.resourceNodeId ? resInfo.get(node.resourceNodeId) : undefined;
    item = info?.item;
    purity = info?.purity ?? null;
  }
  const rate = extractorRatePerMin(node.cls, purity, node.clock);
  const produces = item && rate != null ? [{ item, perMin: rate }] : [];
  return { produces, consumes: [], isSink: false, primaryItem: item, primaryMax: rate ?? 0 };
}

// Recipe-driven consumption/production for a factory at its clock (+ somersloop boost).
function factoryIO(node: FactoryNode, data: RecipeData): NodeIO {
  const recipe = node.recipePath ? data.recipes[classNameOf(node.recipePath)] : undefined;
  if (!recipe) return { produces: [], consumes: [], isSink: false, primaryMax: 0 };
  const produces = outputsPerMin(recipe, node.clock, node.boost);
  const consumes = inputsPerMin(recipe, node.clock);
  const primary = produces[0];
  return {
    produces,
    consumes,
    isSink: false,
    primaryItem: primary?.item,
    primaryMax: primary?.perMin ?? 0,
    recipeName: recipe.name,
  };
}

function computeIO(
  node: FactoryNode,
  data: RecipeData,
  resInfo: Map<string, { item: string; purity: ResourcePurity | null }>,
): NodeIO {
  if (node.kind === 'extractor') return extractorIO(node, resInfo);
  if (node.kind === 'factory') return factoryIO(node, data);
  // splitter/merger/storage are transparent; sinks absorb anything.
  return { produces: [], consumes: [], isSink: node.kind === 'sink', primaryMax: 0 };
}

export function analyzeEfficiency(
  graph: FactoryGraph,
  recipeData: RecipeData,
  resourceData: ResourceData | null,
): EfficiencyReport {
  const resInfo = buildResourceInfo(resourceData);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // --- Solid pools: connected components over the (undirected) conveyor edges ---
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  };
  for (const e of graph.edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  const solidComp = new Map<string, number>();
  let comp = 0;
  for (const n of graph.nodes) {
    if (solidComp.has(n.id) || !adj.has(n.id)) continue;
    const stack = [n.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (solidComp.has(cur)) continue;
      solidComp.set(cur, comp);
      for (const nb of adj.get(cur) ?? []) if (!solidComp.has(nb)) stack.push(nb);
    }
    comp++;
  }

  // --- Fluid pools: one per pipe network ---
  const fluidPools = new Map<string, string[]>(); // node id → pool keys
  graph.pipeNetworks.forEach((members, i) => {
    const key = `f${i}`;
    for (const id of members) (fluidPools.get(id) ?? fluidPools.set(id, []).get(id)!).push(key);
  });

  // Pool keys a node belongs to for a given item phase.
  const poolsFor = (id: string, item: string): string[] => {
    if (isLiquid(recipeData, item)) return fluidPools.get(id) ?? [];
    const c = solidComp.get(id);
    return c === undefined ? [] : [`s${c}`];
  };

  // --- Aggregate base supply/demand per pool/item, and which pools have a sink ---
  const ios = new Map<string, NodeIO>();
  const supply = new Map<string, Map<string, number>>();
  const demand = new Map<string, Map<string, number>>();
  const sinkPools = new Set<string>();
  const add = (m: Map<string, Map<string, number>>, pool: string, item: string, v: number) => {
    const inner = m.get(pool) ?? m.set(pool, new Map()).get(pool)!;
    inner.set(item, (inner.get(item) ?? 0) + v);
  };
  for (const node of graph.nodes) {
    const io = computeIO(node, recipeData, resInfo);
    ios.set(node.id, io);
    for (const r of io.produces) for (const p of poolsFor(node.id, r.item)) add(supply, p, r.item, r.perMin);
    for (const r of io.consumes) for (const p of poolsFor(node.id, r.item)) add(demand, p, r.item, r.perMin);
    if (io.isSink) {
      const c = solidComp.get(node.id);
      if (c !== undefined) sinkPools.add(`s${c}`);
      for (const f of fluidPools.get(node.id) ?? []) sinkPools.add(f);
    }
  }
  const sup = (pool: string, item: string) => supply.get(pool)?.get(item) ?? 0;
  const dem = (pool: string, item: string) => demand.get(pool)?.get(item) ?? 0;

  // Fraction of a consumer's need that the network can meet (picks the pool actually
  // carrying the item — important for fluids where a machine is on multiple networks).
  const consumerFraction = (id: string, item: string): number => {
    const pools = poolsFor(id, item);
    if (pools.length === 0) return 1; // unconnected — don't penalize
    let best = pools[0];
    for (const p of pools) if (sup(p, item) > sup(best, item)) best = p;
    const s = sup(best, item);
    const d = dem(best, item);
    return d > 0 ? Math.min(1, s / d) : 1;
  };
  // Fraction of a producer's output the network can absorb (picks the pool with the most
  // demand / a sink). < 1 means over-production — output backs up ("blocked").
  const producerFraction = (id: string, item: string): number => {
    const pools = poolsFor(id, item);
    if (pools.length === 0) return 1;
    let best = pools[0];
    const weight = (p: string) => dem(p, item) + (sinkPools.has(p) ? Infinity : 0);
    for (const p of pools) if (weight(p) > weight(best)) best = p;
    const s = sup(best, item);
    if (s <= 0) return 1;
    const eff = sinkPools.has(best) ? Math.max(dem(best, item), s) : dem(best, item);
    return eff > 0 ? Math.min(1, eff / s) : 1;
  };

  // --- Neighbor resolution: hop through transparent routing to the next real machine ---
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const e of graph.edges) {
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    (inc.get(e.to) ?? inc.set(e.to, []).get(e.to)!).push(e.from);
  }
  const transparent = (k: FactoryNode['kind']) => k === 'splitter' || k === 'merger' || k === 'storage';
  const resolveNeighbors = (id: string, dir: 'in' | 'out'): EfficiencyNeighbor[] => {
    const map = dir === 'out' ? out : inc;
    const found = new Map<string, EfficiencyNeighbor>();
    const seen = new Set<string>([id]);
    const stack = [...(map.get(id) ?? [])];
    while (stack.length && found.size < 12) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const node = byId.get(cur);
      if (!node) continue;
      if (transparent(node.kind)) {
        for (const nb of map.get(cur) ?? []) if (!seen.has(nb)) stack.push(nb);
      } else if (!found.has(cur)) {
        found.set(cur, { id: cur, label: neighborLabel(node) });
      }
    }
    return [...found.values()];
  };
  const neighborLabel = (node: FactoryNode): string => {
    const name = humanize(node.cls);
    const io = ios.get(node.id);
    const detail = node.recipePath
      ? itemName(recipeData, io?.primaryItem ?? '')
      : io?.primaryItem
        ? itemName(recipeData, io.primaryItem)
        : '';
    return detail ? `${name} — ${detail}` : name;
  };

  // --- Per-machine results (factories + extractors only) ---
  const results: Record<string, EfficiencyResult> = {};
  let underutilized = 0;
  let starved = 0;
  let blocked = 0;
  let machines = 0;

  for (const node of graph.nodes) {
    if (node.kind !== 'factory' && node.kind !== 'extractor') continue;
    const io = ios.get(node.id)!;
    machines++;

    const inputSat = io.consumes.length
      ? Math.min(...io.consumes.map((r) => consumerFraction(node.id, r.item)))
      : 1;
    const outputAcc = io.produces.length
      ? Math.min(...io.produces.map((r) => producerFraction(node.id, r.item)))
      : 1;

    const hasRecipe = node.kind === 'extractor' ? io.produces.length > 0 : !!node.recipePath;
    let utilization: number;
    let status: EfficiencyStatus;
    if (node.kind === 'factory' && !node.recipePath) {
      utilization = 0;
      status = 'idle';
    } else if (node.kind === 'extractor' && io.produces.length === 0) {
      utilization = 1;
      status = 'unknown'; // fracking / unmodelled rate
    } else {
      utilization = Math.min(inputSat, outputAcc);
      if (utilization >= FULL) status = 'full';
      else if (inputSat <= outputAcc) status = 'starved';
      else status = 'blocked';
    }

    const maxPerMin = io.primaryMax;
    const actualPerMin = maxPerMin * (status === 'idle' ? 0 : utilization);
    const wastedPerMin = node.kind === 'extractor' ? Math.max(0, maxPerMin - actualPerMin) : 0;

    if (status === 'starved') starved++;
    if (status === 'blocked') blocked++;
    if (hasRecipe && status !== 'idle' && status !== 'unknown' && utilization < FULL) underutilized++;

    results[node.id] = {
      id: node.id,
      cls: node.cls,
      kind: node.kind,
      recipeName: io.recipeName,
      item: io.primaryItem ? itemName(recipeData, io.primaryItem) : undefined,
      clock: node.clock,
      maxPerMin,
      actualPerMin,
      utilization,
      measuredProductivity: node.productivity,
      status,
      wastedPerMin,
      neighborsIn: resolveNeighbors(node.id, 'in'),
      neighborsOut: resolveNeighbors(node.id, 'out'),
    };
  }

  // Worst flow-utilization first; bigger machines break ties (a stalled manufacturer
  // matters more than a stalled constructor). Idle/unmodelled machines drop off the list.
  const ranked = Object.values(results)
    .filter((r) => r.status !== 'idle' && r.status !== 'unknown')
    .sort((a, b) => (a.utilization !== b.utilization ? a.utilization - b.utilization : b.maxPerMin - a.maxPerMin))
    .map((r) => r.id);

  return { results, ranked, summary: { machines, underutilized, starved, blocked } };
}
