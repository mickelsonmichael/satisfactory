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
  `<div style="position:absolute;right:-2px;bottom:-2px;width:${BADGE}px;height:${BADGE}px;` +
  `border-radius:50%;background:${CHECK_GREEN};border:1.5px solid #fff;box-sizing:border-box;` +
  `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.5)">` +
  `<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" stroke-width="4" ` +
  `stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>` +
  `</div>`;

export function makeCircleIcon(url: string, opacity = 1, collected = false): L.DivIcon {
  const html =
    `<div style="position:relative;width:${SIZE}px;height:${SIZE}px">` +
    `<div style="width:${SIZE}px;height:${SIZE}px;border-radius:50%;background:#fff;` +
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
