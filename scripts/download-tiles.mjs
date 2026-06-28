#!/usr/bin/env node
// Downloads SCIM realistic layer map tiles for local hosting.
// Tiles are gitignored and fetched during CI build (or manually before local dev).
// Usage: node scripts/download-tiles.mjs

import { mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import path from 'path';

const BASE_URL = 'https://static.satisfactory-calculator.com/imgMap/realisticLayer/Stable';
const OUT_DIR  = 'public/tiles/realisticLayer/Stable';
const MIN_ZOOM = 3;
const MAX_ZOOM = 5;   // 525 tiles total; zoom 6+ is ~190 MB+
const CONCURRENCY = 20;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req  = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        file.destroy();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', resolve);
    });
    req.on('error', reject);
    file.on('error', reject);
  });
}

async function downloadTile(z, x, y) {
  const url  = `${BASE_URL}/${z}/${x}/${y}.png`;
  const dest = path.join(OUT_DIR, String(z), String(x), `${y}.png`);
  try {
    await access(dest);
    return; // already downloaded
  } catch { /* not cached */ }
  await mkdir(path.dirname(dest), { recursive: true });
  await downloadFile(url, dest);
}

// Build full tile list: at zoom z, tiles per axis = 5 * 2^(z-3)
const tiles = [];
for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
  const n = 5 * Math.pow(2, z - 3);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      tiles.push([z, x, y]);
    }
  }
}

console.log(`Downloading ${tiles.length} tiles (zoom ${MIN_ZOOM}–${MAX_ZOOM}) with concurrency ${CONCURRENCY}…`);

let done = 0;
for (let i = 0; i < tiles.length; i += CONCURRENCY) {
  const batch = tiles.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(([z, x, y]) =>
      downloadTile(z, x, y).catch((e) => console.error(`  FAIL ${z}/${x}/${y}: ${e.message}`))
    )
  );
  done += batch.length;
  process.stdout.write(`\r  ${done}/${tiles.length}`);
}

console.log('\nDone.');
