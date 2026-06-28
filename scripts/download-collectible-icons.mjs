#!/usr/bin/env node
// Downloads the official in-game collectible icons into public/icons/collectibles/
// for local hosting. Icons are gitignored and fetched during CI build (or manually
// before local dev), mirroring download-resource-icons.mjs.
// Filenames here must match COLLECTIBLE_ICONS in src/lib/icons.ts.
// Usage: node scripts/download-collectible-icons.mjs

import { mkdir, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import path from 'path';

const OUT_DIR = 'public/icons/collectibles';
const BASE = 'https://static.satisfactory-calculator.com/img/gameStable1.0';

// NOTE: the cassette-tape (Boom_Box.png) and helmet (B-374_Helmet.png) icons are NOT
// listed here — they have no clean SCIM source, so they are committed to the repo
// directly (see .gitignore exceptions) rather than fetched in CI.
//
// type -> source filename (the local file keeps the same basename)
const ICONS = [
  'HardDrive_256.png',         // hardDrive
  'Wat_2_256.png',             // mercerSphere
  'Wat_1_256.png',             // somersloop
  'PowerSlugGreen_256.png',    // slugBlue (SCIM calls the mk1 slug "Green")
  'PowerSlugYellow_256.png',   // slugYellow
  'PowerSlugPurple_256.png',   // slugPurple
];

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

async function downloadIcon(file) {
  const dest = path.join(OUT_DIR, file);
  try {
    await access(dest);
    return; // already downloaded
  } catch {
    /* not cached */
  }
  await downloadFile(`${BASE}/${file}`, dest);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`Downloading ${ICONS.length} collectible icons…`);

let done = 0;
await Promise.all(
  ICONS.map((file) =>
    downloadIcon(file)
      .then(() => process.stdout.write(`\r  ${++done}/${ICONS.length}`))
      .catch((e) => console.error(`\n  FAIL ${file}: ${e.message}`)),
  ),
);

console.log('\nDone.');
