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
  sessionName: string;
  saveVersion: number;
}
