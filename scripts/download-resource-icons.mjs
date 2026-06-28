#!/usr/bin/env node
// Downloads the official in-game resource icons referenced by resourceNodes.json
// into public/icons/resources/ for local hosting. Icons are gitignored and fetched
// during CI build (or manually before local dev), mirroring download-tiles.mjs.
// Usage: node scripts/download-resource-icons.mjs

import { mkdir, access, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import path from 'path';

const DATA_FILE = 'public/data/resourceNodes.json';
const OUT_DIR = 'public/icons/resources';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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

async function downloadIcon(file, url) {
  const dest = path.join(OUT_DIR, file);
  try {
    await access(dest);
    return; // already downloaded
  } catch {
    /* not cached */
  }
  await downloadFile(url, dest);
}

const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));

// Several categories share an icon (e.g. crude oil node + well), so dedupe by filename.
const icons = new Map();
for (const layer of data.layers) {
  if (layer.icon && layer.iconUrl) icons.set(layer.icon, layer.iconUrl);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`Downloading ${icons.size} resource icons…`);

let done = 0;
await Promise.all(
  [...icons].map(([file, url]) =>
    downloadIcon(file, url)
      .then(() => process.stdout.write(`\r  ${++done}/${icons.size}`))
      .catch((e) => console.error(`\n  FAIL ${file}: ${e.message}`)),
  ),
);

console.log('\nDone.');
