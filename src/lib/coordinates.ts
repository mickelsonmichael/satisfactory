import type { LatLngBoundsExpression } from 'leaflet';

// Satisfactory world extents in centimeters (Unreal Engine units).
// X = east-west axis (increases eastward / rightward on the map image).
// Y = north-south axis, but INCREASES GOING SOUTH (negative Y = north, positive Y = south).
// This matches Unreal Engine's left-handed screen convention used by Satisfactory.
export const WORLD = {
  minX: -324698,  // westernmost
  maxX:  425298,  // easternmost
  minY: -375000,  // northernmost (most negative Y = furthest north)
  maxY:  375000,  // southernmost (most positive Y = furthest south)
} as const;

// Normalize the 750,000-unit cm range into [0, NORM_SIZE] for Leaflet CRS.Simple.
// Using raw cm values (hundreds of thousands) causes fitBounds and floating-point
// precision to break at the extreme negative zoom levels required.
const NORM_SIZE = 10000;

export const WORLD_BOUNDS: LatLngBoundsExpression = [[0, 0], [NORM_SIZE, NORM_SIZE]];

// Convert game-world centimeters to Leaflet CRS.Simple [lat, lng].
// lat (north-south) and lng (east-west) are both in [0, NORM_SIZE].
// Orientation: lat increases northward (up), lng increases eastward (right).
// Game X = east-west → lng (positive X = east).
// Game Y = INVERTED north-south → (maxY - y) for lat, because positive Y = south in game coords.
export function gameToLatLng(x: number, y: number): [number, number] {
  const lat = ((WORLD.maxY - y) / (WORLD.maxY - WORLD.minY)) * NORM_SIZE;
  const lng = ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * NORM_SIZE;
  return [lat, lng];
}
