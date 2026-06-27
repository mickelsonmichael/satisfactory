import { Parser } from '@etothepii/satisfactory-file-parser';
import type { CollectibleMarker, ParseResult, StaticMarker } from '../types';

interface SaveObject {
  typePath: string;
  instanceName: string;
  properties?: Record<string, { value: unknown }>;
}

interface SaveCollectable {
  pathName: string;
}

interface SaveLevel {
  objects: SaveObject[];
  collectables?: SaveCollectable[];
}

export async function parseSaveFile(
  filename: string,
  buffer: ArrayBuffer,
  staticMarkers: StaticMarker[],
  onProgress?: (pct: number, msg: string) => void,
): Promise<ParseResult> {
  const save = Parser.ParseSave(filename, buffer, {
    onProgressCallback: onProgress
      ? (pct: number, msg?: string) => onProgress(pct, msg ?? '')
      : undefined,
  });

  const levels = Object.values(save.levels as Record<string, SaveLevel>);

  // Paths of all collected non-DropPod items (removed from world, no longer have positions)
  const collectedPaths = new Set(
    levels.flatMap((l) => (l.collectables ?? []).map((c) => c.pathName)),
  );

  // Paths of DropPods the player has opened (they stay in the world, tracked via property)
  const openedDropPodPaths = new Set(
    levels.flatMap((l) =>
      (l.objects ?? [])
        .filter(
          (o) =>
            o.typePath?.includes('BP_DropPod') &&
            o.properties?.['mHasBeenOpened']?.value === true,
        )
        .map((o) => o.instanceName),
    ),
  );

  const markers: CollectibleMarker[] = staticMarkers.map((sm) => ({
    id: sm.id,
    type: sm.type,
    x: sm.x,
    y: sm.y,
    z: sm.z,
    // DropPods can be marked collected two ways: mHasBeenOpened=true (stays in world)
    // OR appearing in collectables (removed from world on some game versions).
    collected: collectedPaths.has(sm.id) || openedDropPodPaths.has(sm.id),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = (save as any).header ?? {};

  return {
    markers,
    sessionName: header.sessionName ?? header.mapName ?? '',
    saveVersion: header.saveVersion ?? 0,
  };
}
