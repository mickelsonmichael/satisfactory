import { Parser } from '@etothepii/satisfactory-file-parser';
import type { CollectibleMarker, ParseResult, StaticMarker } from '../types';

interface SaveObject {
  typePath: string;
  instanceName: string;
  properties?: Record<string, { value: unknown }>;
}

// An ObjectProperty value references another actor by path.
interface ObjectRef {
  levelName: string;
  pathName: string;
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

  // Paths of DropPods whose hard drive has been TAKEN (they stay in the world, tracked
  // via property). A pod has two distinct states: mHasBeenOpened (the casing was cracked
  // open) and mHasBeenLooted (the hard drive was actually removed). Only the latter means
  // the collectible is gone — a pod can be opened with the drive still sitting inside.
  const lootedDropPodPaths = new Set(
    levels.flatMap((l) =>
      (l.objects ?? [])
        .filter(
          (o) =>
            o.typePath?.includes('BP_DropPod') &&
            o.properties?.['mHasBeenLooted']?.value === true,
        )
        .map((o) => o.instanceName),
    ),
  );

  // Resource nodes a player has built an extractor on are "claimed". Miners, oil pumps,
  // and resource-well extractors all point at their node/satellite via the
  // `mExtractableResource` ObjectProperty, whose pathName matches a resource node id.
  const claimedNodes = new Set<string>();
  for (const l of levels) {
    for (const o of l.objects ?? []) {
      const ref = o.properties?.['mExtractableResource']?.value as ObjectRef | undefined;
      if (ref?.pathName) claimedNodes.add(ref.pathName);
    }
  }

  const markers: CollectibleMarker[] = staticMarkers.map((sm) => ({
    id: sm.id,
    type: sm.type,
    x: sm.x,
    y: sm.y,
    z: sm.z,
    // DropPods can be marked collected two ways: mHasBeenLooted=true (drive taken, pod
    // stays in world) OR appearing in collectables (pod dismantled / removed from world).
    collected: collectedPaths.has(sm.id) || lootedDropPodPaths.has(sm.id),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = (save as any).header ?? {};

  return {
    markers,
    claimedNodes,
    sessionName: header.sessionName ?? header.mapName ?? '',
    saveVersion: header.saveVersion ?? 0,
  };
}
