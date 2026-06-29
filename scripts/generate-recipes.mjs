#!/usr/bin/env node
// Generates public/data/recipes.json — the items/minute reference behind the factory
// efficiency feature. Recipe rates aren't in the .sav (only which recipe each machine
// runs), so they ship as committed static data, like resourceNodes.json.
//
// Source: greeny/SatisfactoryTools data/data.json (MIT) — the canonical community dump
// of game recipes. Amounts there are already per-craft in display units (m³ for fluids,
// items for solids), so rate/min = amount * 60 / time uniformly.
//
// A save's mCurrentRecipe pathName ("…/Recipe_IronPlate.Recipe_IronPlate_C") reduces
// (shortClass) to "Recipe_IronPlate_C", which is exactly a key here.
//
// Usage: node scripts/generate-recipes.mjs
// Re-run when the game updates, then commit the regenerated JSON.

import { writeFile, mkdir } from 'fs/promises';
import https from 'https';
import path from 'path';

const DATA_URL =
  'https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data.json';
const OUT_FILE = 'public/data/recipes.json';

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

async function main() {
  console.log(`Fetching ${DATA_URL} …`);
  const data = await fetchJson(DATA_URL);

  // Recipes: keep only machine-automatable ones (a placed machine's mCurrentRecipe is
  // always one of these). Slim each to what the efficiency math needs.
  const recipes = {};
  for (const [key, r] of Object.entries(data.recipes ?? {})) {
    if (!r.inMachine) continue; // skip hand/workshop/build-gun recipes
    if (!r.time || r.time <= 0) continue;
    recipes[key] = {
      name: r.name,
      time: r.time,
      ingredients: (r.ingredients ?? []).map((i) => ({ item: i.item, amount: i.amount })),
      products: (r.products ?? []).map((p) => ({ item: p.item, amount: p.amount })),
      // producedIn classNames (Desc_*), useful as a fallback / sanity check.
      producedIn: r.producedIn ?? [],
    };
  }

  // Items: just the display name + whether it is a fluid (different units / pipes).
  const items = {};
  for (const [key, it] of Object.entries(data.items ?? {})) {
    items[key] = { name: it.name, liquid: !!it.liquid };
  }

  const out = {
    version: 1,
    source: 'greeny/SatisfactoryTools data/data.json (MIT)',
    generated: new Date().toISOString().slice(0, 10),
    recipes,
    items,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(
    `Wrote ${OUT_FILE}: ${Object.keys(recipes).length} recipes, ${Object.keys(items).length} items.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
