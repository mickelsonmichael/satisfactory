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
}

export interface StaticMarker {
  id: string;
  type: CollectibleType;
  x: number;
  y: number;
  z: number;
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
  sessionName: string;
  saveVersion: number;
  // Fun aggregate statistics derived from the whole save (foundations, belt length, …).
  stats: SaveStats;
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
