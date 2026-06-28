import L from 'leaflet';

// Shared marker style for collectibles and resource nodes: the official in-game
// icon PNG centered in a white disc with a "Satisfactory orange" ring and a soft
// shadow, so markers stand out against the busy map.
const SIZE = 28;          // outer circle diameter
const BORDER = 2;         // ring thickness
const SAT_ORANGE = '#FA9549';
const CHECK_GREEN = '#3Fae4f';
const BADGE = 14;         // checkmark badge diameter

// Green check badge overlaid on the bottom-right of the disc to mark a
// collectible that has been claimed in the save (more legible than dimming alone).
const checkBadge =
  // z-index 2 keeps the badge above the disc (z-index 1) — the height tab sits below at 0.
  `<div style="position:absolute;right:-2px;bottom:-2px;z-index:2;width:${BADGE}px;height:${BADGE}px;` +
  `border-radius:50%;background:${CHECK_GREEN};border:1.5px solid #fff;box-sizing:border-box;` +
  `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.5)">` +
  `<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" stroke-width="4" ` +
  `stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>` +
  `</div>`;

// A "tab" pinned behind the circle that slides out to its right, used by the
// "Always show height" toggle to label a marker's elevation. Its left edge starts
// at the circle's center (z-index below the disc) so the disc overlaps it, making
// the label look like it emerges from beneath the node.
function heightTab(label: string): string {
  return (
    `<div style="position:absolute;top:50%;left:${SIZE / 2}px;transform:translateY(-50%);z-index:0;` +
    `background:rgba(15,15,20,0.85);border:1px solid ${SAT_ORANGE};border-left:none;` +
    `border-radius:0 3px 3px 0;padding:0 6px 0 ${SIZE / 2 + 4}px;` +
    `color:#f1f3f5;font-family:'Consolas','SFMono-Regular',monospace;font-size:10px;` +
    `font-weight:700;line-height:15px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.5)">` +
    `${label}</div>`
  );
}

export function makeCircleIcon(
  url: string,
  opacity = 1,
  collected = false,
  heightLabel: string | null = null,
): L.DivIcon {
  const html =
    `<div style="position:relative;width:${SIZE}px;height:${SIZE}px">` +
    (heightLabel ? heightTab(heightLabel) : '') +
    `<div style="position:relative;z-index:1;width:${SIZE}px;height:${SIZE}px;border-radius:50%;background:#fff;` +
    `border:${BORDER}px solid ${SAT_ORANGE};box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.5);opacity:${opacity}">` +
    `<img src="${url}" alt="" style="width:70%;height:70%;object-fit:contain;display:block"/>` +
    `</div>` +
    (collected ? checkBadge : '') +
    `</div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
    popupAnchor: [0, -SIZE / 2],
    tooltipAnchor: [0, -SIZE / 2],
  });
}
