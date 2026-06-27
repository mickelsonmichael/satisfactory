import L from 'leaflet';
import type { CollectibleType } from '../types';

const SIZE = 22;

function makeIcon(
  svgBody: string,
  color: string,
  opacity: number,
  w = SIZE,
  h = SIZE,
  viewBox = '0 0 20 20',
): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" style="color:${color};display:block;opacity:${opacity}">${svgBody}</svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    tooltipAnchor: [0, -h / 2],
  });
}

// Hard Drive: HDD with drive bay and indicators (viewBox: 0 -32 576 576)
const HARD_DRIVE = `
  <path fill="currentColor" d="M576 304v96c0 26.51-21.49 48-48 48H48c-26.51 0-48-21.49-48-48v-96c0-26.51 21.49-48 48-48h480c26.51 0 48 21.49 48 48zm-48-80a79.557 79.557 0 0 1 30.777 6.165L462.25 85.374A48.003 48.003 0 0 0 422.311 64H153.689a48 48 0 0 0-39.938 21.374L17.223 230.165A79.557 79.557 0 0 1 48 224h480zm-48 96c-17.673 0-32 14.327-32 32s14.327 32 32 32 32-14.327 32-32-14.327-32-32-32zm-96 0c-17.673 0-32 14.327-32 32s14.327 32 32 32 32-14.327 32-32-14.327-32-32-32z"/>
  <circle cx="480" cy="352" r="32" fill="rgba(255,255,255,0.5)"/>
  <circle cx="384" cy="352" r="32" fill="rgba(255,255,255,0.3)"/>
`;

// Mercer Sphere: concentric circles
const MERCER_SPHERE = `
  <circle cx="10" cy="10" r="9" fill="currentColor" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
  <circle cx="10" cy="10" r="4.5" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
`;

// Somersloop: "Cool S" silhouette with construction lines (viewBox: -12 -12 84 174)
const SOMERSLOOP = `
  <path d="M30,0 L60,30 L60,60 L45,75 L60,90 L60,120 L30,150 L0,120 L0,90 L15,75 L0,60 L0,30 Z"
        fill="currentColor"/>
  <g stroke="rgba(0,0,0,0.3)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M0,30 L0,60"/>
    <path d="M30,30 L30,60"/>
    <path d="M60,30 L60,60"/>
    <path d="M0,90 L0,120"/>
    <path d="M30,90 L30,120"/>
    <path d="M60,90 L60,120"/>
    <path d="M0,60 L30,90"/>
    <path d="M30,60 L60,90"/>
    <path d="M0,30 L30,0 L60,30"/>
    <path d="M0,120 L30,150 L60,120"/>
    <path d="M0,90 L15,75"/>
    <path d="M60,60 L45,75"/>
  </g>
`;

// Power Slug silhouette (viewBox: 0 0 512 512, shared by all three tiers)
const SLUG = `
  <path fill="currentColor" d="M477.19,33.677c-19.215,0-34.793,15.578-34.793,34.792c0,13.354,7.518,24.935,18.538,30.763v33.723
    c0,8.245-6.69,14.942-14.942,14.942h-32.502c-8.253,0-14.95-6.697-14.95-14.942V99.231c11.02-5.828,18.546-17.409,18.546-30.763
    c0-19.214-15.586-34.792-34.802-34.792c-19.215,0-34.801,15.578-34.801,34.792c0,14.048,8.328,26.106,20.302,31.624
    c0,22.543,0,45.562,0,79.987c0,5.987-0.861,12.476-2.551,19.248c0,51.391-103.918,147.717-215.228,177.685
    c-59.142,14.458-119.981,36.691-135.5,39.794c-26.364,5.276-15.82,37.786,23.73,43.94c30.996,4.816,31.364,17.576,62.737,17.576
    c31.373,0,31.373-17.576,62.754-17.576c31.365,0,31.365,17.576,62.738,17.576s31.373-17.576,62.746-17.576
    c31.381,0,31.381,17.576,62.754,17.576c36.909,0,142.366-19.332,142.366-159.055c0-124.296,0-199.877,0-220.53
    C504.867,92.76,512,81.463,512,68.469C512,49.254,496.413,33.677,477.19,33.677z"/>
`;
const SLUG_BLUE = SLUG;
const SLUG_YELLOW = SLUG;
const SLUG_PURPLE = SLUG;

const SHAPES: Record<CollectibleType, string> = {
  hardDrive: HARD_DRIVE,
  mercerSphere: MERCER_SPHERE,
  somersloop: SOMERSLOOP,
  slugBlue: SLUG_BLUE,
  slugYellow: SLUG_YELLOW,
  slugPurple: SLUG_PURPLE,
};

// Somersloop icon is taller than wide (84:174 aspect ratio from its viewBox)
const SOMERSLOOP_W = Math.round(SIZE * 84 / 174);

export function getIcon(type: CollectibleType, color: string, collected: boolean): L.DivIcon {
  const opacity = collected ? 0.3 : 1;
  if (type === 'hardDrive') {
    return makeIcon(SHAPES.hardDrive, color, opacity, SIZE, SIZE, '0 -32 576 576');
  }
  if (type === 'somersloop') {
    return makeIcon(SHAPES.somersloop, color, opacity, SOMERSLOOP_W, SIZE, '-12 -12 84 174');
  }
  if (type === 'slugBlue' || type === 'slugYellow' || type === 'slugPurple') {
    return makeIcon(SHAPES[type], color, opacity, SIZE, SIZE, '0 0 512 512');
  }
  return makeIcon(SHAPES[type], color, opacity);
}
