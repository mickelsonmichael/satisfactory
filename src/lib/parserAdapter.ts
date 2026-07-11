import { Parser } from '@etothepii/satisfactory-file-parser';
import type { Building, BuildingInventory, BuildingLine, CollectibleMarker, ParseResult, StaticMarker } from '../types';
import { computeStats } from './stats';
import { buildFactoryGraph } from './factoryGraph';
import { classify, footprintFor, humanizeRecipe } from './buildings';
import {
  allObjects,
  buildableEntries,
  classNameOf,
  hasProp,
  localToWorldXY,
  parentOf,
  propArray,
  propValue,
  refPath,
  shortClass,
  splinePoints,
  yawOf,
  type SaveLevel,
  type SaveObject,
} from './saveObject';

// Spline-based buildings (belts, pipes, hypertubes, rails) carry their path in
// `mSplineData.values[i].properties.Location.value` as points local to the object's
// transform. Returns the world-space polyline, or null if there is no usable spline.
function splineLine(o: SaveObject): BuildingLine | null {
  const locals = splinePoints(o);
  if (locals.length < 2 || !o.transform) return null;
  const pts: number[] = [];
  for (const loc of locals) {
    const [wx, wy] = localToWorldXY(loc, o.transform);
    pts.push(wx, wy);
  }
  if (pts.length < 4) return null;
  const cls = shortClass(o.typePath ?? '');
  return { cls, category: classify(cls), pts };
}

// Lightweight extraction of DropPod instanceNames for bootstrapping the "seen" set.
// Parses the save synchronously and returns only the pod IDs — cheaper than a full
// parseSaveFile when the caller only needs to seed the deconstructed-pod cache.
export function extractDropPodIds(filename: string, buffer: ArrayBuffer): string[] {
  const save = Parser.ParseSave(filename, buffer);
  const levels = Object.values(save.levels as Record<string, SaveLevel>);
  const ids: string[] = [];
  for (const o of allObjects(levels)) {
    if (o.typePath?.includes('BP_DropPod') && o.instanceName) ids.push(o.instanceName);
  }
  return ids;
}

export async function parseSaveFile(
  filename: string,
  buffer: ArrayBuffer,
  staticMarkers: StaticMarker[],
  seenDropPodIds: ReadonlySet<string>,
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
  // via property). A pod tracks mHasBeenOpened (casing cracked) and mHasBeenLooted (drive
  // removed); both are serialized onto the actor together the moment it is looted.
  //
  // NOTE: hasProp tests for the *presence* of mHasBeenLooted, not its boolean value —
  // the parser mis-reads every BoolProperty as `false` (see saveObject.hasProp). UE only
  // serializes these properties once the pod has been interacted with, so presence is
  // the reliable "drive taken" signal.
  const lootedDropPodPaths = new Set<string>();
  // ALL DropPod instanceNames present in this save's objects (looted or not). Used for
  // two purposes: returned as dropPodIds so the caller can accumulate the "ever seen"
  // set across saves, and used below to detect the "absent = deconstructed" case.
  const allDropPodIds = new Set<string>();
  // Resource nodes a player has built an extractor on are "claimed". Miners, oil pumps,
  // and resource-well extractors all point at their node/satellite via the
  // `mExtractableResource` ObjectProperty, whose pathName matches a resource node id.
  const claimedNodes = new Set<string>();

  // Every placed building, as a flat footprint list. Two sources:
  //  1. Full `Build_*` objects with a transform — machines, generators, belts, poles.
  //  2. Lightweight buildables packed on the BuildableSubsystem — foundations/walls/ramps,
  //     stored as one entry per class with an `instances[]` array of placements.
  const buildings: Building[] = [];
  // Spline buildings (belts/pipes/hypertubes/rails) drawn as connected polylines so the
  // network is visible instead of a dot at each origin.
  const buildingLines: BuildingLine[] = [];

  // Inventory contents: scan every object for mInventoryStacks (present on
  // FGInventoryComponent sub-objects). The component's instanceName parent (strip last
  // ".ComponentName") is the machine actor's instanceName, which matches Building.id.
  // Items are aggregated by class and sorted by amount descending.
  // "full" = every slot in at least one inventory component is occupied, meaning nothing
  // more can enter. Machines can have multiple components (input/output); any component
  // being fully occupied sets the flag (e.g. a backed-up output inventory).
  const rawInventories = new Map<string, Map<string, number>>();
  const fullActors = new Set<string>();

  // Purchased/unlocked schematics from the SchematicManager. The manager object stores
  // mPurchasedSchematics (bought at HUB) and mAvailableSchematics (can buy now). We try
  // several property names to be resilient across save versions.
  const unlockedSchematicSet = new Set<string>();
  const SCHEMATIC_PROPS = ['mPurchasedSchematics', 'mAvailableSchematics', 'mObtainedSchematics'];

  for (const o of allObjects(levels)) {
    // --- drop pods ---
    if (o.typePath?.includes('BP_DropPod') && o.instanceName) {
      allDropPodIds.add(o.instanceName);
      if (hasProp(o, 'mHasBeenLooted')) lootedDropPodPaths.add(o.instanceName);
    }

    // --- claimed resource nodes ---
    const resourceRef = refPath(propValue(o, 'mExtractableResource'));
    if (resourceRef) claimedNodes.add(resourceRef);

    // --- buildings & spline lines ---
    const t = o.transform;
    if (o.typePath?.includes('/Buildable/') && t?.translation) {
      // Belts/pipes/etc. carry a spline — render their path, not a footprint.
      const line = splineLine(o);
      if (line) {
        buildingLines.push(line);
      } else {
        const cls = shortClass(o.typePath);
        // The *production* recipe (what the machine is currently making) is the interesting
        // stat. mBuiltWithRecipe just restates the building type, so it is ignored.
        const recipePath = refPath(propValue(o, 'mCurrentRecipe'));
        const { w, d } = footprintFor(cls);
        buildings.push({
          cls,
          category: classify(cls),
          x: t.translation.x,
          y: t.translation.y,
          z: t.translation.z,
          yaw: yawOf(t.rotation),
          w,
          d,
          recipe: recipePath ? humanizeRecipe(recipePath) : undefined,
          // Keep the actor id so a clicked footprint can find its FactoryGraph node.
          id: o.instanceName,
        });
      }
    }

    // --- lightweight buildables (foundations/walls/ramps on the BuildableSubsystem) ---
    for (const entry of buildableEntries(o)) {
      const cls = shortClass(entry.typeReference?.pathName ?? '');
      if (!cls) continue;
      const category = classify(cls);
      const { w, d } = footprintFor(cls);
      for (const inst of entry.instances ?? []) {
        const it = inst.transform;
        if (!it?.translation) continue;
        buildings.push({
          cls,
          category,
          x: it.translation.x,
          y: it.translation.y,
          z: it.translation.z,
          yaw: yawOf(it.rotation),
          w,
          d,
        });
      }
    }

    // --- inventories ---
    const stacks = propArray(o.properties?.['mInventoryStacks']);
    if (stacks.length > 0 && o.instanceName) {
      const actorId = parentOf(o.instanceName);
      let occupiedSlots = 0;
      for (const stackVal of stacks) {
        const sv = stackVal as { properties?: Record<string, unknown> } | undefined;
        // Item is a StructProperty whose value is FInventoryItem { itemReference: ObjectReference }.
        const itemProp = sv?.properties?.['Item'] as { value?: { itemReference?: { pathName?: string } } } | undefined;
        const itemPath = itemProp?.value?.itemReference?.pathName;
        const numItems = (sv?.properties?.['NumItems'] as { value?: unknown } | undefined)?.value;
        if (itemPath && typeof numItems === 'number' && numItems > 0) {
          occupiedSlots++;
          const cls = shortClass(itemPath);
          let actorMap = rawInventories.get(actorId);
          if (!actorMap) { actorMap = new Map(); rawInventories.set(actorId, actorMap); }
          actorMap.set(cls, (actorMap.get(cls) ?? 0) + numItems);
        }
      }
      if (occupiedSlots >= stacks.length) fullActors.add(actorId);
    }

    // --- schematics ---
    for (const propName of SCHEMATIC_PROPS) {
      const prop = o.properties?.[propName];
      if (!prop) continue;
      for (const item of propArray(prop)) {
        // Each item is an ObjectRef with a pathName like:
        //   /Game/FactoryGame/Schematics/Schematic_2-5.Schematic_2-5_C
        // UE convention: "Package.ClassName_C" — greeny's schematic keys use the class
        // name (after the last dot, keeping "_C"), so classNameOf, not shortClass.
        const path =
          refPath(item) ?? refPath((item as { value?: unknown } | undefined)?.value);
        if (path) {
          const cls = classNameOf(path);
          if (cls.startsWith('Schematic_') || cls.startsWith('Research_')) {
            unlockedSchematicSet.add(cls);
          }
        }
      }
    }
  }

  const inventories = new Map<string, BuildingInventory>();
  for (const [actorId, itemMap] of rawInventories) {
    inventories.set(actorId, {
      items: [...itemMap.entries()]
        .map(([item, amount]) => ({ item, amount }))
        .sort((a, b) => b.amount - a.amount),
      full: fullActors.has(actorId),
    });
  }

  // Hard-drive unlock costs (mActivationCost) are defined in the Blueprint asset, not
  // serialized as save-file instance data, so they cannot be read from the save. They
  // ship as static data in collectibles.json (the `cost` field on each hard-drive
  // marker) and pass through via StaticMarker here.
  const markers: CollectibleMarker[] = staticMarkers.map((sm) => ({
    id: sm.id,
    type: sm.type,
    x: sm.x,
    y: sm.y,
    z: sm.z,
    // DropPods can be marked collected three ways:
    //  1. In level.collectables — pod dismantled and properly tracked by the game.
    //  2. In objects with mHasBeenLooted present — drive taken, pod still standing.
    //  3. Absent from objects AND previously seen in a past save — Satisfactory has a
    //     bug where deconstructing a pod sometimes removes it from the save entirely
    //     (skipping collectables). "Was seen before, now gone" = deconstructed = collected.
    collected:
      collectedPaths.has(sm.id) ||
      lootedDropPodPaths.has(sm.id) ||
      (sm.type === 'hardDrive' && seenDropPodIds.has(sm.id) && !allDropPodIds.has(sm.id)),
    cost: sm.type === 'hardDrive' ? sm.cost : undefined,
    power: sm.type === 'hardDrive' ? sm.power : undefined,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = (save as any).header ?? {};

  return {
    markers,
    claimedNodes,
    buildings,
    buildingLines,
    factory: buildFactoryGraph(levels),
    sessionName: header.sessionName ?? header.mapName ?? '',
    saveVersion: header.saveVersion ?? 0,
    stats: computeStats(levels, header.playDurationSeconds ?? 0),
    unlockedSchematics: [...unlockedSchematicSet],
    dropPodIds: [...allDropPodIds],
    inventories,
  };
}
