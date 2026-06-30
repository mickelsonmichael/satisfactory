#!/usr/bin/env node
/**
 * compact-saves.js — removes no-op saves from public/saves/.
 *
 * A "no-op save" is one whose file size differs by less than SIZE_THRESHOLD bytes
 * from the last retained save. On an idle server (factory running, no players) the
 * compressed save fluctuates ±~2 KB per 15-min autosave interval; real gameplay
 * (new buildings, research, etc.) grows it by 10–18 KB per interval. The 5 KB
 * default reliably separates the two cases without false positives.
 *
 * Comparison is always against the last *kept* save, not the immediate predecessor.
 * This mirrors push-save.sh, which compares the incoming save against the most
 * recently uploaded file in the repo — if a save is skipped, the reference stays
 * the same for the next interval.
 *
 * Usage:
 *   node scripts/compact-saves.js              # dry run (safe default)
 *   node scripts/compact-saves.js --apply      # delete no-op saves + regen manifest
 *   node scripts/compact-saves.js --apply --threshold=3000
 *   node scripts/compact-saves.js --apply --dir=path/to/saves
 *
 * Flags:
 *   --apply          Actually delete files and regenerate manifest. Without this
 *                    flag the script only prints what it would do (dry run).
 *   --threshold=N    Byte delta below which a save is considered a no-op (default 5000).
 *   --dir=PATH       Saves directory (default: public/saves).
 */

import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

const args  = process.argv.slice(2);
const apply = args.includes('--apply');

const thresholdArg = args.find(a => a.startsWith('--threshold='));
const dirArg       = args.find(a => a.startsWith('--dir='));

const SIZE_THRESHOLD = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 5000;
const SAVES_DIR      = dirArg ? resolve(dirArg.split('=')[1]) : resolve('public', 'saves');

const sign = (n) => (n >= 0 ? `+${n}` : String(n));

console.log(`compact-saves  dir=${SAVES_DIR}  threshold=±${SIZE_THRESHOLD} B  mode=${apply ? 'APPLY' : 'dry-run'}`);
console.log('');

const files = readdirSync(SAVES_DIR)
  .filter(f => f.endsWith('.sav'))
  .sort()
  .map(f => ({ name: f, path: join(SAVES_DIR, f), size: statSync(join(SAVES_DIR, f)).size }));

console.log(`Found ${files.length} save file(s).`);
if (files.length < 2) {
  console.log('Nothing to compact.');
  process.exit(0);
}

let kept    = 0;
let removed = 0;

// Always keep the first (oldest) save.
let lastKept = files[0];
console.log(`  KEEP  ${files[0].name}  (${files[0].size} B)  — first`);
kept++;

for (let i = 1; i < files.length; i++) {
  const curr  = files[i];
  const delta = curr.size - lastKept.size;

  if (Math.abs(delta) < SIZE_THRESHOLD) {
    console.log(`  DROP  ${curr.name}  (${curr.size} B, ${sign(delta)} B from last kept)`);
    if (apply) unlinkSync(curr.path);
    removed++;
  } else {
    console.log(`  KEEP  ${curr.name}  (${curr.size} B, ${sign(delta)} B)`);
    lastKept = curr;
    kept++;
  }
}

console.log('');
console.log(`Result: ${kept} kept, ${removed} ${removed === 1 ? 'file' : 'files'} removed${apply ? '' : ' (dry run)'}.`);

if (!apply && removed > 0) {
  console.log('Pass --apply to delete the files and regenerate the manifest.');
}

if (apply && removed > 0) {
  console.log('');
  console.log('Regenerating manifest...');
  execFileSync(process.execPath, ['scripts/generate-manifest.js'], { stdio: 'inherit' });
}
