#!/usr/bin/env node
// Generates public/data/caves.json from SCIM's published map data.
// Caves are static world geometry (never "collected", independent of any save), so —
// like resource nodes — they ship as committed static data rather than coming from the .sav.
//
// SCIM stores caves as a single "caves" layer whose markers are polygons: each cave has an
// outline (`points`), one or more `entrances` (line segments across the cave mouth), and
// occasionally `holes` (interior cut-outs). All coordinates are game centimeters (x, y),
// the same system used by resource nodes, so the viewer projects them with gameToLatLng().
//
// Usage: node scripts/generate-caves.mjs
// Re-run when SCIM updates its map data, then commit the regenerated JSON.

import { writeFile, mkdir } from 'fs/promises';
import https from 'https';
import path from 'path';

const MAP_DATA_URL =
  'https://static.satisfactory-calculator.com/data/json/mapData/en-Stable.json';
const OUT_FILE = 'public/data/caves.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

// The caves layer is nested several levels deep inside the tab/category/sub-layer tree,
// at an index that isn't stable across game versions. Walk the structure and grab the
// first object that declares `layerId === 'caves'` with a `markers` map.
function findCavesLayer(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.layerId === 'caves' && node.markers) return node;
  for (const v of Object.values(node)) {
    const found = findCavesLayer(v);
    if (found) return found;
  }
  return null;
}

async function main() {
  console.log(`Fetching ${MAP_DATA_URL} …`);
  const data = await fetchJson(MAP_DATA_URL);

  const layer = findCavesLayer(data);
  if (!layer) throw new Error('No "caves" layer found in map data');

  // Each marker keyed by cave id -> { points, entrances, holes? }. Keep only the geometry
  // fields and round coordinates to integers (centimeters) to shrink the committed JSON.
  const round2 = (pt) => [Math.round(pt[0]), Math.round(pt[1])];
  const caves = Object.entries(layer.markers).map(([id, c]) => {
    const cave = {
      id,
      points: (c.points || []).map(round2),
      entrances: (c.entrances || []).map((seg) => seg.map(round2)),
    };
    if (Array.isArray(c.holes) && c.holes.length) {
      cave.holes = c.holes.map((ring) => ring.map(round2));
    }
    return cave;
  });

  const totalEntrances = caves.reduce((n, c) => n + c.entrances.length, 0);
  const out = {
    version: 1,
    source: 'satisfactory-calculator.com/en/interactive-map (mapData)',
    gameVersion: String(data.version ?? ''),
    generated: new Date().toISOString().slice(0, 10),
    caves,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(`Wrote ${OUT_FILE}: ${caves.length} caves, ${totalEntrances} entrances.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
