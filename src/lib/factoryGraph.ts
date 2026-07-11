// Reconstructs the production graph (machines + logistics routing) from a parsed save.
//
// Connection topology lives on sub-component objects, NOT the machine actors: each
// machine/splitter/merger has `<actor>.Output#` / `.Input#` ports and each belt has two
// `.ConveyorAny#` ends, all typed FGFactoryConnectionComponent, each carrying an
// ObjectProperty `mConnectedComponent` → the mating component. Fluids use
// FGPipeConnectionComponent. Walking those links rebuilds who-feeds-whom. (See the
// "factory-connection-graph" project note for the field details.)
//
// Output is compact — a few thousand machine-level nodes + edges — so it ships in every
// ParseResult; the heavy flow analysis over it (lib/efficiency.ts) runs lazily.

import type { FactoryGraph, FactoryNode, FactoryNodeKind, FactoryEdge } from '../types';
import { parentOf, propValue, refPath, shortClass, type SaveLevel } from './saveObject';

const FACTORY_CONN = 'FGFactoryConnectionComponent';
// Pipe ports come in two flavours: FGPipeConnectionComponent on pipeline/junction
// segments, and FGPipeConnectionFactory on machine fluid ports (e.g. a refinery's
// PipeInputFactory/PipeOutputFactory). Both carry mPipeNetworkID.
const PIPE_CONN = /FGPipeConnection(Component|Factory)$/;

// Actor-class → node kind. Ordered, first match wins (specific before general). Belts,
// lifts, pipes, poles etc. are deliberately absent — they are conductors/edges, not nodes.
const KIND_RULES: [RegExp, FactoryNodeKind][] = [
  [/MinerMk|OilPump|WaterPump|FrackingSmasher|FrackingCore|FrackingExtractor/, 'extractor'],
  [
    /SmelterMk|FoundryMk|ConstructorMk|AssemblerMk|ManufacturerMk|OilRefinery|Refinery|Blender|Packager|HadronCollider|Converter|QuantumEncoder/,
    'factory',
  ],
  [/ConveyorAttachmentSplitter/, 'splitter'], // covers Smart / Programmable
  [/ConveyorAttachmentMerger/, 'merger'],
  [/StorageContainer|FluidBuffer|IndustrialTank|PipeStorageTank/, 'storage'],
  // Boundary sinks: absorb items (so upstream counts as consumed) but produce nothing we trace.
  [/ResourceSink|TrainStation|TruckStation|DroneStation|DockingStation|CentralStorage|Generator/, 'sink'],
];

function kindOf(cls: string): FactoryNodeKind | null {
  for (const [re, k] of KIND_RULES) if (re.test(cls)) return k;
  return null;
}

const num = (v: unknown, dflt: number): number => (typeof v === 'number' ? v : dflt);

interface Conn {
  parent: string;
  connected?: string; // mConnectedComponent target
  role: 'out' | 'in' | 'belt'; // belt = ConveyorAny (a conductor we pass through)
}

export function buildFactoryGraph(levels: SaveLevel[]): FactoryGraph {
  const nodes = new Map<string, FactoryNode>();
  const conns = new Map<string, Conn>();        // solid connection components
  const beltEnds = new Map<string, string[]>(); // belt/lift actor → its ConveyorAny component names
  // Fluid network id → set of node ids on it. A pipe connection component carries
  // mPipeNetworkID; nodes sharing one are on the same fluid pool.
  const pipeNets = new Map<number, Set<string>>();
  // Open fluid ports per actor: counts of PipeInputFactory# and PipeOutputFactory# with no network.
  const openFluid = new Map<string, { in: number; out: number }>();
  // Connected fluid ports per actor: same ports but WITH a valid pipe network id.
  const connectedFluid = new Map<string, { in: number; out: number }>();
  // Actors that have at least one power cable attached. Built from power line special properties:
  // each power line actor exposes source/target ObjectReferences to the connection component on
  // each end; parentOf(pathName) gives the machine actor. This is more reliable than reading
  // mPowerCircuit on FGPowerConnectionComponent objects, which isn't consistently serialized.
  const poweredActors = new Set<string>();

  for (const level of levels) {
    for (const o of level.objects ?? []) {
      const inst = o.instanceName;
      const tp = o.typePath;
      if (!inst || !tp) continue;

      // --- power line actor: collect both endpoints as powered ---
      const sp = o.specialProperties;
      if (sp?.type === 'PowerLineSpecialProperties') {
        if (sp.source?.pathName) poweredActors.add(parentOf(sp.source.pathName));
        if (sp.target?.pathName) poweredActors.add(parentOf(sp.target.pathName));
        continue;
      }

      // --- solid connection component ---
      if (tp.endsWith(FACTORY_CONN)) {
        const suffix = inst.slice(inst.lastIndexOf('.') + 1);
        const role = suffix.startsWith('Output') ? 'out' : suffix.startsWith('Input') ? 'in' : 'belt';
        const parent = parentOf(inst);
        const connected = refPath(propValue(o, 'mConnectedComponent'));
        conns.set(inst, { parent, connected, role });
        if (role === 'belt') {
          const list = beltEnds.get(parent);
          if (list) list.push(inst);
          else beltEnds.set(parent, [inst]);
        }
        continue;
      }

      // --- fluid connection component: group its owning node by pipe network id ---
      if (PIPE_CONN.test(tp)) {
        const netId = propValue(o, 'mPipeNetworkID');
        const parent = parentOf(inst);
        // PipeInputFactory# / PipeOutputFactory# suffixes identify machine-side fluid ports.
        const suffix = inst.slice(inst.lastIndexOf('.') + 1).toLowerCase();
        const isMachinePort =
          suffix.startsWith('pipeinputfactory') || suffix.startsWith('pipeoutputfactory');
        if (typeof netId === 'number' && netId >= 0) {
          const set = pipeNets.get(netId) ?? new Set<string>();
          // Only the owning node matters; pipeline/junction parents are added then filtered below.
          set.add(parent);
          pipeNets.set(netId, set);
          if (isMachinePort) {
            const entry = connectedFluid.get(parent) ?? { in: 0, out: 0 };
            if (suffix.startsWith('pipeinputfactory')) entry.in++;
            else entry.out++;
            connectedFluid.set(parent, entry);
          }
        } else if (isMachinePort) {
          // Not on any network — open machine-side fluid port.
          const entry = openFluid.get(parent) ?? { in: 0, out: 0 };
          if (suffix.startsWith('pipeinputfactory')) entry.in++;
          else entry.out++;
          openFluid.set(parent, entry);
        }
        continue;
      }

      // --- machine-level node actor ---
      const cls = shortClass(tp);
      const kind = kindOf(cls);
      if (!kind || !o.transform?.translation) continue;
      const produce = propValue(o, 'mCurrentProductivityMeasurementProduceDuration');
      const dur = propValue(o, 'mCurrentProductivityMeasurementDuration');
      const durN = typeof dur === 'number' ? dur : 0;
      nodes.set(inst, {
        id: inst,
        cls,
        kind,
        x: o.transform.translation.x,
        y: o.transform.translation.y,
        z: o.transform.translation.z ?? 0,
        recipePath: refPath(propValue(o, 'mCurrentRecipe')),
        clock: num(propValue(o, 'mCurrentPotential'), 1),
        boost: num(propValue(o, 'mProductionBoost'), 1),
        productivity: durN > 0 ? Math.min(1, num(produce, 0) / durN) : null,
        resourceNodeId: refPath(propValue(o, 'mExtractableResource')),
        openInputs: 0,
        openOutputs: 0,
        connectedInputs: 0,
        connectedOutputs: 0,
        hasPower: false, // set in second pass below from power line data
      });
    }
  }

  // --- directed conveyor edges: walk from every node Output through belts to a node Input ---
  const edgeSet = new Set<string>();
  const edges: FactoryEdge[] = [];
  const addEdge = (from: string, to: string) => {
    if (from === to) return;
    const key = `${from}\0${to}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to });
  };

  for (const [name, c] of conns) {
    if (c.role !== 'out' || !nodes.has(c.parent)) continue;
    // Follow mConnectedComponent, hopping across belt/lift conductors, to the terminal port.
    let cur = c.connected;
    const seen = new Set<string>([name]);
    for (let steps = 0; cur && steps < 1000; steps++) {
      if (seen.has(cur)) break; // cycle guard
      seen.add(cur);
      const next = conns.get(cur);
      if (!next) break;
      if (next.role === 'belt') {
        // Hop to the conductor's other end, then continue out of it.
        const ends = beltEnds.get(next.parent);
        const sibling = ends?.find((e) => e !== cur);
        cur = sibling ? conns.get(sibling)?.connected : undefined;
        continue;
      }
      // Terminal port (Input on a consumer, or an Output we shouldn't normally hit).
      if (next.role === 'in' && nodes.has(next.parent)) addEdge(c.parent, next.parent);
      break;
    }
  }

  // --- fluid networks: keep only the machine-level members of each pipe network ---
  const pipeNetworks: string[][] = [];
  for (const members of pipeNets.values()) {
    const nodeMembers = [...members].filter((id) => nodes.has(id));
    if (nodeMembers.length > 1) pipeNetworks.push(nodeMembers);
  }

  // --- second pass: solid port counts (in/out role, connected vs open) ---
  for (const [, c] of conns) {
    if (c.role === 'belt') continue; // conductors, not machine ports
    const node = nodes.get(c.parent);
    if (!node) continue;
    if (c.connected) {
      if (c.role === 'in') node.connectedInputs++;
      else node.connectedOutputs++;
    } else {
      if (c.role === 'in') node.openInputs++;
      else node.openOutputs++;
    }
  }

  // --- open and connected fluid ports on machine actors ---
  for (const [actorId, ports] of openFluid) {
    const node = nodes.get(actorId);
    if (node) {
      node.openInputs += ports.in;
      node.openOutputs += ports.out;
    }
  }
  for (const [actorId, ports] of connectedFluid) {
    const node = nodes.get(actorId);
    if (node) {
      node.connectedInputs += ports.in;
      node.connectedOutputs += ports.out;
    }
  }

  // --- power status: true only when at least one power cable is wired to this machine ---
  for (const node of nodes.values()) {
    node.hasPower = poweredActors.has(node.id);
  }

  return { nodes: [...nodes.values()], edges, pipeNetworks };
}
