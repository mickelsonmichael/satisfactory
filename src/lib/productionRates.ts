// Production-rate math for the efficiency feature.
//
// The .sav says *which* recipe a machine runs and at what clock, but not the items/minute
// — those come from the committed recipe dataset (public/data/recipes.json, see
// scripts/generate-recipes.mjs). Miner/pump extraction rates aren't recipes; they are
// stable game constants keyed by building tier × node purity, hardcoded here.
//
// Pure module (no React, no I/O): callers pass the loaded RecipeData in.

import type { Recipe, RecipeItemAmount, ResourcePurity } from '../types';

export interface ItemRate {
  item: string;   // Desc_*_C
  perMin: number; // items (or m³) per minute
}

// amount-per-craft → per-minute at a given clock (and output amplification).
function perMin(a: RecipeItemAmount, time: number, mult: number): ItemRate {
  return { item: a.item, perMin: (a.amount * 60) / time * mult };
}

// What a machine running `recipe` consumes per minute at `clock` (somersloops don't
// change ingredient draw, so boost is not applied to inputs).
export function inputsPerMin(recipe: Recipe, clock: number): ItemRate[] {
  return recipe.ingredients.map((i) => perMin(i, recipe.time, clock));
}

// What it produces per minute. Production amplification (`boost`, 1 or 2 with somersloops)
// multiplies output only.
export function outputsPerMin(recipe: Recipe, clock: number, boost: number): ItemRate[] {
  return recipe.products.map((p) => perMin(p, recipe.time, clock * boost));
}

// Base extraction at 100% clock / normal purity, by building tier (items or m³ per min).
const EXTRACTOR_BASE: [RegExp, number][] = [
  [/MinerMk3/, 240],
  [/MinerMk2/, 120],
  [/MinerMk1/, 60],
  [/OilPump/, 120],   // Oil Extractor: 120 m³/min at normal purity
  [/WaterPump/, 120], // Water Extractor: flat 120 m³/min (water nodes have no purity)
];

const PURITY_MULT: Record<ResourcePurity, number> = { impure: 0.5, normal: 1, pure: 2 };

// Extraction rate per minute for a miner/pump, or null when it can't be modelled
// (resource-well pressurizers depend on satellite count/purity we don't resolve).
export function extractorRatePerMin(
  cls: string,
  purity: ResourcePurity | null,
  clock: number,
): number | null {
  const hit = EXTRACTOR_BASE.find(([re]) => re.test(cls));
  if (!hit) return null; // fracking / unknown extractor
  const base = hit[1];
  // Water extractors ignore purity; everything else scales by node purity (normal if unknown).
  const pMult = /WaterPump/.test(cls) ? 1 : PURITY_MULT[purity ?? 'normal'];
  return base * pMult * clock;
}
