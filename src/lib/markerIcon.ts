import L from 'leaflet';

// Shared marker style for collectibles and resource nodes: the official in-game
// icon PNG centered in a white disc with a "Satisfactory orange" ring and a soft
// shadow, so markers stand out against the busy map.
const BASE_SIZE = 22;     // reference disc diameter (size at the floor zoom)
const SAT_ORANGE = '#FA9549';
const CHECK_GREEN = '#3Fae4f';

// --- Zoom-responsive sizing -------------------------------------------------
// Marker icons are Leaflet divIcons, which keep a constant *screen* pixel size at
// every zoom unless we resize them — so they look smaller and smaller relative to
// the terrain as you zoom in. To keep them proportional, we grow the icon with the
// zoom. Below MIN_SIZE_ZOOM the size is clamped to a floor so the most zoomed-out
// levels stop shrinking (the last zoom level stays the same size as the one above
// it), and MAX_SIZE keeps icons from dominating the dense overzoom levels.
const MIN_SIZE_ZOOM = 3;       // icons stop shrinking at/below this zoom
const GROWTH_PER_ZOOM = 1.25;  // size multiplier per zoom level above the floor
const MAX_SIZE = 46;           // upper clamp so icons don't swallow the map

export function iconSizeForZoom(zoom: number): number {
  const z = Math.max(zoom, MIN_SIZE_ZOOM);
  const size = BASE_SIZE * GROWTH_PER_ZOOM ** (z - MIN_SIZE_ZOOM);
  return Math.round(Math.min(size, MAX_SIZE));
}

// Green check badge overlaid on the bottom-right of the disc to mark a
// collectible that has been claimed in the save (more legible than dimming alone).
function checkBadge(size: number): string {
  const badge = Math.round(size * (14 / BASE_SIZE)); // badge diameter scales with the disc
  const check = Math.round(badge * (9 / 14));
  // z-index 2 keeps the badge above the disc (z-index 1) — the height tab sits below at 0.
  return (
    `<div style="position:absolute;right:-2px;bottom:-2px;z-index:2;width:${badge}px;height:${badge}px;` +
    `border-radius:50%;background:${CHECK_GREEN};border:1.5px solid #fff;box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.5)">` +
    `<svg viewBox="0 0 24 24" width="${check}" height="${check}" fill="none" stroke="#fff" stroke-width="4" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>` +
    `</div>`
  );
}

// A "tab" pinned behind the circle that slides out to its right, used by the
// "Always show height" toggle to label a marker's elevation. Its left edge starts
// at the circle's center (z-index below the disc) so the disc overlaps it, making
// the label look like it emerges from beneath the node.
function heightTab(label: string, size: number): string {
  const font = Math.round(size * (10 / BASE_SIZE));
  const line = Math.round(size * (15 / BASE_SIZE));
  return (
    `<div style="position:absolute;top:50%;left:${size / 2}px;transform:translateY(-50%);z-index:0;` +
    `background:rgba(15,15,20,0.85);border:1px solid ${SAT_ORANGE};border-left:none;` +
    `border-radius:0 3px 3px 0;padding:0 6px 0 ${size / 2 + 4}px;` +
    `color:#f1f3f5;font-family:'Consolas','SFMono-Regular',monospace;font-size:${font}px;` +
    `font-weight:700;line-height:${line}px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.5)">` +
    `${label}</div>`
  );
}

export function makeCircleIcon(
  url: string,
  opacity = 1,
  collected = false,
  heightLabel: string | null = null,
  size = BASE_SIZE,
): L.DivIcon {
  const border = Math.max(2, Math.round(size * (2 / BASE_SIZE))); // ring thickness scales with disc

  const html =
    `<div style="position:relative;width:${size}px;height:${size}px">` +
    (heightLabel ? heightTab(heightLabel, size) : '') +
    `<div style="position:relative;z-index:1;width:${size}px;height:${size}px;border-radius:50%;background:#fff;` +
    `border:${border}px solid ${SAT_ORANGE};box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.5);opacity:${opacity}">` +
    `<img src="${url}" alt="" style="width:70%;height:70%;object-fit:contain;display:block"/>` +
    `</div>` +
    (collected ? checkBadge(size) : '') +
    `</div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    tooltipAnchor: [0, -size / 2],
  });
}
