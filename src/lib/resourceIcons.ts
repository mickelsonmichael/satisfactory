import L from 'leaflet';
import { makeCircleIcon } from './markerIcon';

// Resource nodes use the official in-game icon PNGs, self-hosted under
// public/icons/resources/ (downloaded by scripts/download-resource-icons.mjs).
const iconCache = new Map<string, L.DivIcon>();

export function getResourceIcon(file: string): L.DivIcon {
  const cached = iconCache.get(file);
  if (cached) return cached;

  // BASE_URL keeps the path correct in dev (/) and on GitHub Pages (/satisfactory/).
  const icon = makeCircleIcon(`${import.meta.env.BASE_URL}icons/resources/${file}`);
  iconCache.set(file, icon);
  return icon;
}
