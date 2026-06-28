import L from 'leaflet';
import type { CollectibleType } from '../types';
import { makeCircleIcon } from './markerIcon';

// Collectibles use the official in-game icon PNGs, self-hosted under
// public/icons/collectibles/ (downloaded by scripts/download-collectible-icons.mjs),
// rendered in the same circular style as resource nodes. Collected items are dimmed.
export const COLLECTIBLE_ICONS: Record<CollectibleType, string> = {
  hardDrive: 'HardDrive_256.png',
  mercerSphere: 'Wat_2_256.png',
  somersloop: 'Wat_1_256.png',
  slugBlue: 'PowerSlugGreen_256.png', // SCIM names the blue (mk1) slug "Green"
  slugYellow: 'PowerSlugYellow_256.png',
  slugPurple: 'PowerSlugPurple_256.png',
};

const iconCache = new Map<string, L.DivIcon>();

export function getIcon(type: CollectibleType, collected: boolean): L.DivIcon {
  const key = `${type}:${collected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  // BASE_URL keeps the path correct in dev (/) and on GitHub Pages (/satisfactory/).
  const url = `${import.meta.env.BASE_URL}icons/collectibles/${COLLECTIBLE_ICONS[type]}`;
  const icon = makeCircleIcon(url, collected ? 0.35 : 1);
  iconCache.set(key, icon);
  return icon;
}
