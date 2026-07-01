export type CollectibleType =
  | 'hardDrive'
  | 'mercerSphere'
  | 'somersloop'
  | 'slugBlue'
  | 'slugYellow'
  | 'slugPurple'
  | 'cassetteTape'
  | 'helmet';

export interface CollectibleMarker {
  id: string;   // pathName — stable game actor identifier
  type: CollectibleType;
  x: number;   // game X in cm (east-west, positive = east)
  y: number;   // game Y in cm (north-south, positive = south in Unreal convention)
  z: number;   // game Z in cm (elevation)
  collected: boolean;
  // Hard drives only: items required to open the drop pod (mActivationCost).
  cost?: Array<{ item: string; amount: number }>;
  // Hard drives only: minimum power supply (MW) required to open the pod.
  power?: number;
}

export interface StaticMarker {
  id: string;
  type: CollectibleType;
  x: number;
  y: number;
  z: number;
  // Hard drives only: items required to open the drop pod (mActivationCost).
  // Stored here as static data because the cost is a Blueprint default, not
  // serialized into the save file.
  cost?: Array<{ item: string; amount: number }>;
  // Hard drives only: minimum power supply (MW) required to open the pod.
  power?: number;
}

export interface StaticCollectibles {
  version: number;
  source: string;
  gameVersion: string;
  generated: string;
  markers: StaticMarker[];
}

export interface LayerState {
  type: CollectibleType;
  label: string;
  color: string;
  visible: boolean;
  uncollectedCount: number;
  collectedCount: number;
}

// --- Resource nodes (static world geology, independent of the save file) ---

export type ResourcePurity = 'impure' | 'normal' | 'pure';

export interface ResourceNodeMarker {
  id: string;   // pathName — stable game actor identifier
  x: number;
  y: number;
  z: number;
  purity: ResourcePurity | null;
}

export interface ResourceLayer {
  id: string;            // e.g. 'node-ironOre', 'well-water'
  name: string;          // 'Iron Ore'
  group: 'node' | 'well';
  type: string;          // game class, e.g. 'Desc_OreIron_C'
  icon: string;          // local icon filename under public/icons/resources/
  iconUrl: string;       // source URL (used by the icon download script)
  markers: ResourceNodeMarker[];
}

export interface ResourceData {
  version: number;
  source: string;
  gameVersion: string;
  generated: string;
  layers: ResourceLayer[];
}

export interface ResourceLayerState {
  id: string;
  visible: boolean;
}

// --- Buildings (placed structures, derived live from the save file) ---

export type BuildingCategory =
  | 'foundation'
  | 'wall'
  | 'production'
  | 'power'
  | 'logistics'
  | 'storage'
  | 'vehicle'
  | 'misc';

// One placed building footprint. Lean by design — a megabase yields ~75k of these.
export interface Building {
  cls: string;             // shortClass, e.g. 'Build_Foundation_8x4_01'
  category: BuildingCategory;
  x: number;               // game X (cm) of the building's pivot
  y: number;               // game Y (cm)
  z: number;               // game Z (cm), elevation
  yaw: number;             // rotation about Z, radians
  w: number;               // footprint width (cm) along local X before rotation
  d: number;               // footprint depth (cm) along local Y before rotation
  recipe?: string;         // humanized recipe name (machines only)
  // Actor instanceName, set only for full Build_* objects (machines/extractors/etc.) —
  // links a clicked footprint to its node in the FactoryGraph. Undefined for the bulk
  // lightweight foundations/walls, keeping those lean.
  id?: string;
}

export interface BuildingCategoryDef {
  id: BuildingCategory;
  label: string;
  color: string;
}

// A spline-based building (conveyor belt, pipe, hypertube, rail) drawn as a connected
// polyline so the network is visible, rather than a single footprint dot.
export interface BuildingLine {
  cls: string;
  category: BuildingCategory;
  // Flattened world game coords in cm: [x0, y0, x1, y1, …].
  pts: number[];
}

// --- Caves (static world geometry, independent of the save file) ---

// A 2D game point [x, y] in centimeters (same coordinate system as resource nodes).
export type GamePoint = [number, number];

export interface Cave {
  id: string;            // e.g. 'cave1'
  points: GamePoint[];   // outline polygon
  entrances: GamePoint[][]; // each entrance is a [start, end] line segment across the cave mouth
  holes?: GamePoint[][]; // interior cut-outs (rare)
}

export interface CavesData {
  version: number;
  source: string;
  gameVersion: string;
  generated: string;
  caves: Cave[];
}

export interface ManifestSave {
  filename: string;
  path: string;
  displayName: string;
  sessionName: string;
  date: string;
  timestamp: number;
  size: number;
  saveVersion: number;
  buildVersion: number;
}

export interface Manifest {
  version: number;
  generated: string;
  default: string;
  saves: ManifestSave[];
}

export interface InventoryItem {
  item: string;   // shortClass, e.g. 'Desc_IronPlate_C'
  amount: number;
}

export interface BuildingInventory {
  items: InventoryItem[];
  full: boolean; // true when every slot across all inventory components is occupied
}

export interface ParseResult {
  // All markers from the static game database, with collected status from the save file.
  // Markers in unvisited level chunks have collected=false (we can't distinguish
  // "not collected" from "not yet visited").
  markers: CollectibleMarker[];
  // Resource node ids (pathNames) that have an extractor built on them in the save.
  claimedNodes: Set<string>;
  // Every placed building footprint (machines + lightweight foundations/walls/etc.).
  buildings: Building[];
  // Spline buildings (belts/pipes/hypertubes/rails) as connected polylines.
  buildingLines: BuildingLine[];
  // Compact production graph (machines + logistics) for the efficiency feature.
  factory: FactoryGraph;
  sessionName: string;
  saveVersion: number;
  // Fun aggregate statistics derived from the whole save (foundations, belt length, …).
  stats: SaveStats;
  // Schematic class names that have been purchased/unlocked in this save (e.g. 'Schematic_2-5_C').
  // Empty array when the save has no schematic manager data (early versions, custom saves).
  unlockedSchematics: string[];
  // DropPod instanceNames found in this save's objects (looted or not). Used by the
  // caller to build a persistent "ever seen" set so that deconstructed pods (which
  // vanish from both objects and collectables due to a game bug) can still be detected
  // as collected in future parses.
  dropPodIds: string[];
  // Inventory contents per machine/container, keyed by Building.id (actor instanceName).
  // Items are aggregated by class (multiple slots of the same item are summed), sorted
  // by amount descending. Only actors that have non-empty inventory are present.
  inventories: Map<string, BuildingInventory>;
}

// --- Save statistics (Stats tab) ---

// How a stat's numeric value should be formatted for display.
//  - 'number'   raw count with thousands separators
//  - 'distance' value is in meters; rendered as m or km
//  - 'area'     value is in square meters; rendered as m² / km²
//  - 'duration' value is in seconds; rendered as days / hours
export type StatFormat = 'number' | 'distance' | 'area' | 'duration';

export interface StatItem {
  label: string;
  value: number;
  format?: StatFormat; // defaults to 'number'
  hint?: string;       // optional fun comparison / detail, shown under the value
}

export interface StatGroup {
  title: string;
  items: StatItem[];
}

export interface SaveStats {
  groups: StatGroup[];
}

// --- Recipe rates (static game data, public/data/recipes.json) ---

export interface RecipeItemAmount {
  item: string;   // item class, e.g. 'Desc_IronIngot_C'
  amount: number; // per craft, display units (items, or m³ for fluids)
}

export interface Recipe {
  name: string;
  time: number; // seconds per craft at 100% clock
  ingredients: RecipeItemAmount[];
  products: RecipeItemAmount[];
  producedIn: string[]; // building Desc_* classes (fallback / sanity only)
  // Unlock / progression metadata (from generate-recipes.mjs v2+)
  isAlternate: boolean;
  tier: number;          // -1 = MAM/custom; 0 = tutorial; 1-8 = HUB milestones
  schematicType: string; // 'EST_Milestone' | 'EST_Alternate' | 'EST_MAM' | 'EST_Tutorial' | 'EST_Custom'
  schematicName: string;
  schematicClass: string;
}

export interface RecipeData {
  version: number;
  source: string;
  generated: string;
  recipes: Record<string, Recipe>;             // keyed by Recipe_*_C
  items: Record<string, { name: string; liquid: boolean }>; // keyed by Desc_*_C
}

// --- Factory graph (topology + raw runtime props, derived from the save) ---
//
// Compact: machines + logistics routing nodes only (a few thousand), NOT the 75k
// lightweight foundations. Edges come from the FGFactoryConnectionComponent
// mConnectedComponent links; fluid networks are grouped by shared pipe network id.

export type FactoryNodeKind =
  | 'extractor' // miner / oil pump / water pump / fracking
  | 'factory'   // smelter…manufacturer/refinery/blender/etc. (has a recipe)
  | 'splitter'
  | 'merger'
  | 'storage'   // container / buffer — transparent buffer in steady state
  | 'sink'      // AWESOME sink, train/truck/drone station, dimensional depot — absorbs
  | 'other';

export interface FactoryNode {
  id: string;            // actor instanceName
  cls: string;           // shortClass
  kind: FactoryNodeKind;
  x: number;             // game X (cm) — for labels / linking back to the footprint
  y: number;
  z: number;             // game Z (cm), elevation
  recipePath?: string;   // Recipe_*_C (factories)
  clock: number;         // mCurrentPotential (1.0 when unset)
  boost: number;         // mProductionBoost / somersloop multiplier (1.0 when unset)
  productivity: number | null; // game's measured uptime 0..1, or null if unknown
  resourceNodeId?: string;     // extractors: mExtractableResource pathName
  openInputs: number;      // count of unconnected Input#/PipeInputFactory# ports
  openOutputs: number;     // count of unconnected Output#/PipeOutputFactory# ports
  connectedInputs: number;  // count of connected Input#/PipeInputFactory# ports
  connectedOutputs: number; // count of connected Output#/PipeOutputFactory# ports
  hasPower: boolean;    // false only when no power cable is attached
}

export interface FactoryEdge {
  from: string; // producer-side node id (its Output port)
  to: string;   // consumer-side node id (its Input port)
}

export interface FactoryGraph {
  nodes: FactoryNode[];
  edges: FactoryEdge[];        // directed conveyor connections (machine-level)
  pipeNetworks: string[][];    // groups of node ids sharing a fluid network
}

// --- Efficiency analysis (computed lazily from graph + recipes) ---

export type EfficiencyStatus = 'full' | 'starved' | 'blocked' | 'idle' | 'unknown';

export interface EfficiencyNeighbor {
  id: string;
  label: string; // building name + recipe/item, for the panel
}

export interface EfficiencyResult {
  id: string;
  cls: string;
  kind: FactoryNodeKind;
  recipeName?: string;
  item?: string;        // primary output/extracted item, display name
  clock: number;        // multiplier, e.g. 1.5
  maxPerMin: number;    // theoretical max of the primary item/min (clock+boost applied)
  actualPerMin: number; // estimated steady-state of the primary item/min
  utilization: number;  // 0..1 — flow-estimated actual/max
  measuredProductivity: number | null; // 0..1 from the save (ground-truth uptime)
  status: EfficiencyStatus;
  wastedPerMin: number; // producers over-producing: max - actual (0 otherwise)
  neighborsIn: EfficiencyNeighbor[];
  neighborsOut: EfficiencyNeighbor[];
}

export interface EfficiencyReport {
  results: Record<string, EfficiencyResult>; // keyed by node id
  ranked: string[];                          // node ids, worst utilization first
  summary: {
    machines: number;
    underutilized: number; // utilization < ~95%
    starved: number;
    blocked: number;
  };
}
