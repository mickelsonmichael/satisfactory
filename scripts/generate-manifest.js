#!/usr/bin/env node
// Scans the saves/ directory, reads raw binary headers, and writes saves/manifest.json.
// Runs without any npm deps — uses only Node built-ins and DataView on the binary header.
// Usage: node scripts/generate-manifest.js

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const SAVES_DIR = resolve('saves');
const MANIFEST_PATH = join(SAVES_DIR, 'manifest.json');

/**
 * Read a length-prefixed Satisfactory string from a DataView.
 * Positive length = UTF-8 (length includes null terminator).
 * Negative length = UTF-16LE (absolute value = char count including null).
 * Returns [string, nextByteOffset].
 */
function readFString(view, offset) {
  const len = view.getInt32(offset, true);
  offset += 4;
  if (len === 0) return ['', offset];
  if (len > 0) {
    // UTF-8, length includes null terminator
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, len - 1);
    const str = new TextDecoder('utf-8').decode(bytes);
    return [str, offset + len];
  }
  // Negative: UTF-16LE, |len| chars including null
  const charCount = -len;
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, (charCount - 1) * 2);
  const str = new TextDecoder('utf-16le').decode(bytes);
  return [str, offset + charCount * 2];
}

/**
 * Parse only the fields we need from the save header binary.
 * Layout (all little-endian):
 *   [0]  int32  saveHeaderType
 *   [4]  int32  saveVersion
 *   [8]  int32  buildVersion
 *   [12] FString mapName
 *   [??] FString mapOptions
 *   [??] FString sessionName
 *   [??] int32   playDurationSeconds
 */
function parseSaveHeader(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const saveHeaderType = view.getInt32(0, true);
  const saveVersion   = view.getInt32(4, true);
  const buildVersion  = view.getInt32(8, true);

  let offset = 12;
  // Actual binary order: saveName, mapName, mapOptions, sessionName, playDuration
  const [saveName,    o1] = readFString(view, offset);  offset = o1;
  const [mapName,     o2] = readFString(view, offset);  offset = o2;
  const [,            o3] = readFString(view, offset);  offset = o3;  // mapOptions (unused)
  const [sessionName, o4] = readFString(view, offset);  offset = o4;
  const playDuration = view.getInt32(offset, true);

  return { saveHeaderType, saveVersion, buildVersion, saveName, mapName, sessionName, playDuration };
}

/**
 * Extract a YYYYMMDD date string from filenames like "name.20260627.sav".
 * Returns null if no date pattern is found.
 */
function extractDateFromFilename(filename) {
  const m = filename.match(/\.(\d{8})\./);
  if (!m) return null;
  const raw = m[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

const saveFiles = readdirSync(SAVES_DIR)
  .filter((f) => f.endsWith('.sav'))
  .sort();

const saves = [];

for (const filename of saveFiles) {
  const fullPath = join(SAVES_DIR, filename);
  const stat = statSync(fullPath);

  // Only read first 512 bytes — header is always much smaller than that
  const fd = readFileSync(fullPath);
  const header512 = fd.slice(0, 512);

  let headerInfo;
  try {
    headerInfo = parseSaveHeader(header512);
  } catch {
    console.warn(`Skipping ${filename}: failed to parse header`);
    continue;
  }

  const dateFromName = extractDateFromFilename(filename);
  // Fall back to mtime if no date in filename
  const date = dateFromName ?? stat.mtime.toISOString().slice(0, 10);
  const timestamp = dateFromName
    ? new Date(date + 'T00:00:00Z').getTime() / 1000
    : Math.floor(stat.mtimeMs / 1000);

  saves.push({
    filename,
    path: `saves/${filename}`,
    displayName: `${headerInfo.sessionName} (${date})`,
    saveName: headerInfo.saveName,
    sessionName: headerInfo.sessionName,
    mapName: headerInfo.mapName,
    date,
    timestamp,
    size: stat.size,
    saveHeaderType: headerInfo.saveHeaderType,
    saveVersion: headerInfo.saveVersion,
    buildVersion: headerInfo.buildVersion,
    playDurationSeconds: headerInfo.playDuration,
  });
}

// Sort newest first
saves.sort((a, b) => b.timestamp - a.timestamp);

const manifest = {
  version: 1,
  generated: new Date().toISOString(),
  default: saves[0]?.filename ?? '',
  saves,
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${MANIFEST_PATH} with ${saves.length} save(s).`);
if (saves[0]) {
  console.log(`  Default: ${saves[0].displayName} (${saves[0].filename})`);
}
