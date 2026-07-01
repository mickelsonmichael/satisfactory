// IndexedDB-backed LRU cache for parsed save results.
//
// Save files are large (30+ MB uncompressed) and parsing is slow. This cache
// avoids re-parsing the same save on navigation, refresh, or auto-refresh when
// the save hasn't changed.
//
// LRU eviction caps storage at MAX_ENTRIES saves. A typical ParseResult is
// 10–25 MB serialized, so the default cap of 3 keeps storage under ~75 MB.

import type { ParseResult } from '../types';

const DB_NAME = 'satisfactory-parse-cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;
const MAX_ENTRIES = 3;

type InventoryValue = ParseResult['inventories'] extends Map<string, infer V> ? V : never;

// Serialized form — Set and Map aren't natively structured-cloneable in all
// IndexedDB implementations, so we convert them explicitly.
interface SerializedParseResult extends Omit<ParseResult, 'claimedNodes' | 'inventories'> {
  claimedNodes: string[];
  inventories: [string, InventoryValue][];
}

interface CacheEntry {
  key: string;
  lastAccessed: number;
  data: SerializedParseResult;
}

function serialize(result: ParseResult): SerializedParseResult {
  return {
    ...result,
    claimedNodes: Array.from(result.claimedNodes),
    inventories: Array.from(result.inventories.entries()),
  };
}

function deserialize(data: SerializedParseResult): ParseResult {
  return {
    ...data,
    claimedNodes: new Set(data.claimedNodes),
    inventories: new Map(data.inventories),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeCacheKey(filename: string, byteLength: number): string {
  return `${filename}::${byteLength}`;
}

export async function getCached(key: string): Promise<ParseResult | null> {
  try {
    const db = await openDb();
    const result = await new Promise<ParseResult | null>((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      t.onerror = () => reject(t.error);

      const store = t.objectStore(STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const entry = getReq.result as CacheEntry | undefined;
        if (!entry) { resolve(null); return; }
        // Update LRU timestamp in the same transaction.
        store.put({ ...entry, lastAccessed: Date.now() });
        resolve(deserialize(entry.data));
      };
      getReq.onerror = () => reject(getReq.error);
    });

    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearAllCached(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.objectStore(STORE_NAME).clear();
  });
  db.close();
}

export async function putCached(key: string, result: ParseResult): Promise<void> {
  try {
    const db = await openDb();
    const data = serialize(result);

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE_NAME, 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);

      const store = t.objectStore(STORE_NAME);

      // Chain: read all → evict oldest → write new. All within the same transaction
      // so we don't leave the store in a partially-written state.
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = getAllReq.result as CacheEntry[];

        if (all.length >= MAX_ENTRIES) {
          const toEvict = all
            .filter((e) => e.key !== key)
            .sort((a, b) => a.lastAccessed - b.lastAccessed)
            .slice(0, all.length - MAX_ENTRIES + 1);
          for (const e of toEvict) store.delete(e.key);
        }

        store.put({ key, lastAccessed: Date.now(), data } satisfies CacheEntry);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });

    db.close();
  } catch {
    // Cache write failure is non-fatal — parsing still works without it.
  }
}
