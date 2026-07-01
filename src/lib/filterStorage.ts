// Persists the user's selected filters (which collectibles / resources are shown)
// to localStorage so they survive page refreshes. Intentionally does NOT persist
// the "marked"/"unmarked" collected state — only the filter selections.

import type { BuildingCategory, CollectibleType, ResourcePurity } from '../types';

const COLLECTIBLE_KEY = 'satisfactory-map:collectible-filters';
const RESOURCE_KEY = 'satisfactory-map:resource-filters';
const BUILDING_KEY = 'satisfactory-map:building-filters';
const CAVES_KEY = 'satisfactory-map:show-caves';
const HEIGHT_KEY = 'satisfactory-map:show-height';
const AUTO_REFRESH_KEY = 'satisfactory-map:auto-refresh';
const AUTO_REFRESH_INTERVAL_KEY = 'satisfactory-map:auto-refresh-interval';
const BUILDING_OPACITY_KEY = 'satisfactory-map:building-opacity';
const SHOW_DISCONNECTIONS_KEY = 'satisfactory-map:show-disconnections';
const SEEN_PODS_KEY = 'satisfactory-map:seen-drop-pod-ids';

type ResourcePurityState = Record<string, Record<ResourcePurity, boolean>>;
type BuildingVisibility = Partial<Record<BuildingCategory, boolean>>;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode, quota, etc.) — filters just won't persist.
  }
}

// --- Collectible layer visibility (stored as the list of visible types) ---

export function loadVisibleCollectibles(): Set<CollectibleType> | null {
  const types = read<CollectibleType[]>(COLLECTIBLE_KEY);
  return Array.isArray(types) ? new Set(types) : null;
}

export function saveVisibleCollectibles(types: CollectibleType[]): void {
  write(COLLECTIBLE_KEY, types);
}

// --- Resource purity selection (per-layer { pure, normal, impure }) ---

export function loadResourcePurity(): ResourcePurityState | null {
  return read<ResourcePurityState>(RESOURCE_KEY);
}

export function saveResourcePurity(state: ResourcePurityState): void {
  write(RESOURCE_KEY, state);
}

// --- Building category visibility (per-category on/off; default all off) ---

export function loadBuildingVisibility(): BuildingVisibility | null {
  return read<BuildingVisibility>(BUILDING_KEY);
}

export function saveBuildingVisibility(state: BuildingVisibility): void {
  write(BUILDING_KEY, state);
}

// --- Caves overlay visibility (single boolean toggle) ---

export function loadShowCaves(): boolean {
  return read<boolean>(CAVES_KEY) ?? false;
}

export function saveShowCaves(value: boolean): void {
  write(CAVES_KEY, value);
}

// --- Always-show-height toggle (permanent elevation labels on markers) ---

export function loadShowHeight(): boolean {
  return read<boolean>(HEIGHT_KEY) ?? false;
}

export function saveShowHeight(value: boolean): void {
  write(HEIGHT_KEY, value);
}

// --- Auto-refresh toggle (periodically re-check the manifest for a newer save) ---

export function loadAutoRefresh(): boolean {
  return read<boolean>(AUTO_REFRESH_KEY) ?? false;
}

export function saveAutoRefresh(value: boolean): void {
  write(AUTO_REFRESH_KEY, value);
}

// --- Auto-refresh interval in minutes ---

export type AutoRefreshInterval = 5 | 15 | 30 | 60;
const VALID_INTERVALS: AutoRefreshInterval[] = [5, 15, 30, 60];

export function loadAutoRefreshInterval(): AutoRefreshInterval {
  const v = read<number>(AUTO_REFRESH_INTERVAL_KEY);
  return VALID_INTERVALS.includes(v as AutoRefreshInterval) ? (v as AutoRefreshInterval) : 15;
}

export function saveAutoRefreshInterval(v: AutoRefreshInterval): void {
  write(AUTO_REFRESH_INTERVAL_KEY, v);
}

// --- Building overlay opacity (0..1, default 1) ---

export function loadBuildingOpacity(): number {
  const v = read<number>(BUILDING_OPACITY_KEY);
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5;
}

export function saveBuildingOpacity(v: number): void {
  write(BUILDING_OPACITY_KEY, v);
}

// --- Show disconnections toggle ---

export function loadShowDisconnections(): boolean {
  return read<boolean>(SHOW_DISCONNECTIONS_KEY) ?? false;
}

export function saveShowDisconnections(value: boolean): void {
  write(SHOW_DISCONNECTIONS_KEY, value);
}

// --- Seen DropPod instance names (for deconstructed-pod detection across saves) ---
//
// When a player deconstructs a DropPod, Satisfactory sometimes removes it from the
// save entirely (neither in objects nor in collectables) instead of moving it to
// collectables. Tracking which pods we've ever seen in any save's objects lets us
// detect the "was seen before, now absent" = deconstructed = collected case.

export function loadSeenDropPodIds(): Set<string> {
  const ids = read<string[]>(SEEN_PODS_KEY);
  return new Set(Array.isArray(ids) ? ids : []);
}

export function mergeSeenDropPodIds(newIds: string[]): boolean {
  if (newIds.length === 0) return false;
  const existing = loadSeenDropPodIds();
  let changed = false;
  for (const id of newIds) {
    if (!existing.has(id)) {
      existing.add(id);
      changed = true;
    }
  }
  if (changed) write(SEEN_PODS_KEY, [...existing]);
  return changed;
}
