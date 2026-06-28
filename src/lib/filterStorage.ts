// Persists the user's selected filters (which collectibles / resources are shown)
// to localStorage so they survive page refreshes. Intentionally does NOT persist
// the "marked"/"unmarked" collected state — only the filter selections.

import type { CollectibleType, ResourcePurity } from '../types';

const COLLECTIBLE_KEY = 'satisfactory-map:collectible-filters';
const RESOURCE_KEY = 'satisfactory-map:resource-filters';
const CAVES_KEY = 'satisfactory-map:show-caves';
const HEIGHT_KEY = 'satisfactory-map:show-height';
const AUTO_REFRESH_KEY = 'satisfactory-map:auto-refresh';

type ResourcePurityState = Record<string, Record<ResourcePurity, boolean>>;

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
