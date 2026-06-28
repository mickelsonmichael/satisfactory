import type { LatLngBoundsExpression } from 'leaflet';

// Raw game world extents in Unreal Engine centimeters.
const RAW_WEST  = -324698.832031;
const RAW_EAST  =  425301.832031;
const RAW_NORTH =  -375000;
const RAW_SOUTH =   375000;

const rawWidth  = RAW_EAST - RAW_WEST;   // 750000.664062
const rawHeight = RAW_SOUTH - RAW_NORTH; // 750000

// SCIM: backgroundSize starts at 32768 (raw world), then += 2 * extraBackgroundSize (4096)
// The extra 4096 pixels are added as a uniform border on EACH side in pixel space, not game space.
const EXTRA_BACKGROUND = 4096;
const RAW_BG = 32768;
const BACKGROUND_SIZE = RAW_BG + 2 * EXTRA_BACKGROUND; // 40960
const ZOOM_RATIO = Math.ceil(Math.log2(BACKGROUND_SIZE / 256)); // 8
const TILE_SCALE = Math.pow(2, ZOOM_RATIO); // 256

// Full tile extent in Leaflet CRS.Simple units.
export const WORLD_BOUNDS: LatLngBoundsExpression = [
  [-(BACKGROUND_SIZE / TILE_SCALE), 0],  // [-160, 0]  SW
  [0, BACKGROUND_SIZE / TILE_SCALE],      // [0,  160]  NE
];

// Convert game-world centimeters to Leaflet CRS.Simple [lat, lng].
// The raw 32768-px world is inset by EXTRA_BACKGROUND pixels on each side,
// so the game world maps to pixel range [4096, 36864] within [0, 40960].
export function gameToLatLng(x: number, y: number): [number, number] {
  const rasterX = (x - RAW_WEST)  / rawWidth  * RAW_BG + EXTRA_BACKGROUND;
  const rasterY = (y - RAW_NORTH) / rawHeight * RAW_BG + EXTRA_BACKGROUND;
  return [-rasterY / TILE_SCALE, rasterX / TILE_SCALE];
}

export const WORLD = { minX: RAW_WEST, maxX: RAW_EAST, minY: RAW_NORTH, maxY: RAW_SOUTH } as const;
