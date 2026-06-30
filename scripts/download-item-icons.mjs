#!/usr/bin/env node
// Downloads item icons for every item referenced in public/data/recipes.json.
// Primary source: SCIM CDN (static.satisfactory-calculator.com) using IconDesc_{Name}_256.png.
// Fallback: Satisfactory Wiki thumbnails (satisfactory.wiki.gg) at 128px, using the
//           item's display name as the wiki page title.
// SCIM requests run in parallel; wiki fallbacks are serialized to avoid rate limiting.
// Saved to public/icons/items/ for local hosting (gitignored, fetched during CI build).
// Usage: node scripts/download-item-icons.mjs

import { mkdir, access, unlink, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import path from 'path';

const DATA_FILE = 'public/data/recipes.json';
const OUT_DIR = 'public/icons/items';
const SCIM_BASE = 'https://static.satisfactory-calculator.com/img/gameStable1.0/';
const WIKI_BASE = 'https://satisfactory.wiki.gg/images/thumb/';
const UA = 'curl/7.88.1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        file.destroy();
        unlink(dest).catch(() => {});
        reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on('finish', resolve);
    });
    req.on('error', (e) => { file.destroy(); unlink(dest).catch(() => {}); reject(e); });
    file.on('error', reject);
  });
}

async function tryScim(filename) {
  await downloadFile(SCIM_BASE + filename, path.join(OUT_DIR, filename));
}

async function tryWiki(filename, wikiUrl, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await downloadFile(wikiUrl, path.join(OUT_DIR, filename));
      return;
    } catch (e) {
      if (e.status === 429 && i < retries - 1) {
        await sleep(3000 * (i + 1)); // 3s, 6s, 9s, 12s
      } else {
        throw e;
      }
    }
  }
}

const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));

// Some items have display names that differ from their wiki page title.
const WIKI_NAME_OVERRIDES = {
  Screw: 'Screws',
  'Non-fissile Uranium': 'Non-Fissile_Uranium',
  'Hover Pack': 'Hoverpack',
};

const icons = Object.entries(data.items).map(([cls, item]) => {
  const name = cls.replace(/^Desc_/, '').replace(/_C$/, '');
  const filename = `IconDesc_${name}_256.png`;
  const wikiName = (WIKI_NAME_OVERRIDES[item.name] ?? item.name.replace(/ /g, '_'));
  const wikiUrl = `${WIKI_BASE}${wikiName}.png/128px-${wikiName}.png`;
  return { filename, wikiUrl };
});

await mkdir(OUT_DIR, { recursive: true });

// Phase 1: try all SCIM downloads in parallel (fast, CDN can handle it)
console.log(`Phase 1: trying SCIM CDN for ${icons.length} icons…`);
const needsWiki = [];
let scimOk = 0, cached = 0;

await Promise.all(
  icons.map(async ({ filename, wikiUrl }) => {
    const dest = path.join(OUT_DIR, filename);
    try { await access(dest); cached++; return; } catch { /* not cached */ }
    try {
      await tryScim(filename);
      scimOk++;
    } catch {
      needsWiki.push({ filename, wikiUrl });
    }
  }),
);

console.log(`  ${scimOk} from SCIM, ${cached} cached, ${needsWiki.length} need wiki fallback`);

// Phase 2: wiki fallbacks serialized with small delays to avoid 429
console.log(`Phase 2: fetching ${needsWiki.length} icons from wiki (serialized)…`);
let wikiOk = 0, failed = 0;

for (let i = 0; i < needsWiki.length; i++) {
  const { filename, wikiUrl } = needsWiki[i];
  process.stdout.write(`\r  ${i + 1}/${needsWiki.length}`);
  try {
    await tryWiki(filename, wikiUrl);
    wikiOk++;
  } catch (e) {
    failed++;
    console.error(`\n  FAIL ${filename}: ${e.message}`);
  }
  if (i < needsWiki.length - 1) await sleep(500); // 2 req/s — stays well under wiki rate limit
}

console.log(`\nDone. ${cached} cached, ${scimOk} from SCIM, ${wikiOk} from wiki, ${failed} failed.`);
