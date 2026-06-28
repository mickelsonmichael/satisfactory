export type CollectibleType =
  | 'hardDrive'
  | 'mercerSphere'
  | 'somersloop'
  | 'slugBlue'
  | 'slugYellow'
  | 'slugPurple';

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
  sessionName: string;
  saveVersion: number;
}
