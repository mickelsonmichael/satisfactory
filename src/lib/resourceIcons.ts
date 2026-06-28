import L from 'leaflet';
import { makeCircleIcon } from './markerIcon';

// Resource nodes use the official in-game icon PNGs, self-hosted under
// public/icons/resources/ (downloaded by scripts/download-resource-icons.mjs).
const iconCache = new Map<string, L.DivIcon>();

// `claimed` adds a green check badge, marking a node that has an extractor built on it.
export function getResourceIcon(file: string, claimed = false): L.DivIcon {
  const key = `${file}:${claimed}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  // BASE_URL keeps the path correct in dev (/) and on GitHub Pages (/satisfactory/).
  const icon = makeCircleIcon(`${import.meta.env.BASE_URL}icons/resources/${file}`, 1, claimed);
  iconCache.set(key, icon);
  return icon;
}
