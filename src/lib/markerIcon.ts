import L from 'leaflet';

// Shared marker style for collectibles and resource nodes: the official in-game
// icon PNG centered in a white disc with a "Satisfactory orange" ring and a soft
// shadow, so markers stand out against the busy map.
const SIZE = 28;          // outer circle diameter
const BORDER = 2;         // ring thickness
const SAT_ORANGE = '#FA9549';

export function makeCircleIcon(url: string, opacity = 1): L.DivIcon {
  const html =
    `<div style="width:${SIZE}px;height:${SIZE}px;border-radius:50%;background:#fff;` +
    `border:${BORDER}px solid ${SAT_ORANGE};box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.5);opacity:${opacity}">` +
    `<img src="${url}" alt="" style="width:70%;height:70%;object-fit:contain;display:block"/>` +
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
