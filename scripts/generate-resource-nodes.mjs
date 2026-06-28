#!/usr/bin/env node
// Generates public/data/resourceNodes.json from SCIM's published map data.
// Resource nodes are static world geology (never "collected", independent of any save),
// so they ship as committed static data — unlike collectibles, they don't come from the .sav.
//
// Pulls the resource_nodes and resource_wells tabs from satisfactory-calculator.com,
// flattens each category's purity sub-layers into one layer with per-marker purity,
// and records the source icon URL so scripts/download-resource-icons.mjs can fetch it.
//
// Usage: node scripts/generate-resource-nodes.mjs
// Re-run when SCIM updates its map data, then commit the regenerated JSON.

import { writeFile, mkdir } from 'fs/promises';
import https from 'https';
import path from 'path';

const MAP_DATA_URL =
  'https://static.satisfactory-calculator.com/data/json/mapData/en-Stable.json';
const OUT_FILE = 'public/data/resourceNodes.json';

// Only these tabs hold mineable world resources. Other tabs (power_slugs, artifacts,
// collectibles) are save-dependent and handled elsewhere.
const TABS = {
  resource_nodes: 'node',
  resource_wells: 'well',
};

const PURITY = {
  RP_Inpure: 'impure',
  RP_Normal: 'normal',
  RP_Pure: 'pure',
};

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

function slug(name) {
  return name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

// SCIM icon URLs carry a ?v= cache-buster; the local file uses just the basename.
function iconFileName(url) {
  return path.basename(url.split('?')[0]);
}

async function main() {
  console.log(`Fetching ${MAP_DATA_URL} …`);
  const data = await fetchJson(MAP_DATA_URL);

  const layers = [];
  for (const [tabId, group] of Object.entries(TABS)) {
    const tab = (data.options || []).find((t) => t.tabId === tabId);
    if (!tab) {
      console.warn(`  tab ${tabId} not found, skipping`);
      continue;
    }
    for (const cat of tab.options || []) {
      const markers = [];
      let iconUrl = '';
      for (const sub of cat.options || []) {
        if (sub.icon && !iconUrl) iconUrl = sub.icon;
        for (const m of sub.markers || []) {
          markers.push({
            id: m.pathName,
            x: m.x,
            y: m.y,
            z: m.z,
            purity: PURITY[m.purity] ?? null,
          });
        }
      }
      if (markers.length === 0) continue; // skip empty "Unknown" buckets
      layers.push({
        id: `${group}-${slug(cat.name)}`,
        name: cat.name,
        group,
        type: cat.type,
        icon: iconUrl ? iconFileName(iconUrl) : '',
        iconUrl,
        markers,
      });
    }
  }

  const total = layers.reduce((n, l) => n + l.markers.length, 0);
  const out = {
    version: 1,
    source: 'satisfactory-calculator.com/en/interactive-map (mapData)',
    gameVersion: String(data.version ?? ''),
    generated: new Date().toISOString().slice(0, 10),
    layers,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(
    `Wrote ${OUT_FILE}: ${layers.length} layers, ${total} markers ` +
      `(${layers.filter((l) => l.group === 'node').length} node, ` +
      `${layers.filter((l) => l.group === 'well').length} well).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
