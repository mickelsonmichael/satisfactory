import { Parser } from '@etothepii/satisfactory-file-parser';
import type { Building, BuildingLine, CollectibleMarker, ParseResult, StaticMarker } from '../types';
import { computeStats } from './stats';
import { buildFactoryGraph } from './factoryGraph';
import { classify, footprintFor, humanizeRecipe, shortClass } from './buildings';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}
interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}
interface Transform {
  translation?: Vec3;
  rotation?: Quat;
}

// One placement inside a lightweight-buildable entry (foundations/walls/ramps).
interface BuildableInstance {
  transform?: Transform;
}
interface BuildableEntry {
  typeReference?: { pathName?: string };
  instances?: BuildableInstance[];
}

interface SaveObject {
  typePath: string;
  instanceName: string;
  properties?: Record<string, { value: unknown }>;
  transform?: Transform;
  specialProperties?: {
    type?: string;
    buildables?: BuildableEntry[];
  };
}

// Yaw (rotation about Z) in radians from a quaternion. Buildings only rotate about the
// vertical axis, so the X/Y components are ~0 and this reduces to 2*atan2(z, w).
function yawOf(q?: Quat): number {
  if (!q) return 0;
  return 2 * Math.atan2(q.z, q.w);
}

// A spline point's local Location within the object frame.
interface SplinePoint {
  properties?: { Location?: { value?: Vec3 } };
}

// Rotate a local vector by a quaternion (standard v' = v + 2q_w(q×v) + 2q×(q×v)) and add
// the translation, giving world coordinates. Most belts have identity rotation, but pipes
// and angled segments can be rotated, so applying the full quaternion is the safe path.
function localToWorldXY(p: Vec3, t: Transform): [number, number] {
  const q = t.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  const tr = t.translation ?? { x: 0, y: 0, z: 0 };
  // cross = q_xyz × p
  const cx = q.y * p.z - q.z * p.y;
  const cy = q.z * p.x - q.x * p.z;
  const cz = q.x * p.y - q.y * p.x;
  // rotated = p + 2*w*cross + 2*(q_xyz × cross)
  const wx = p.x + 2 * (q.w * cx + (q.y * cz - q.z * cy));
  const wy = p.y + 2 * (q.w * cy + (q.z * cx - q.x * cz));
  return [wx + tr.x, wy + tr.y];
}

// Spline-based buildings (belts, pipes, hypertubes, rails) carry their path in
// `mSplineData.values[i].properties.Location.value` as points local to the object's
// transform. Returns the world-space polyline, or null if there is no usable spline.
function splineLine(o: SaveObject): BuildingLine | null {
  // mSplineData exposes `.values` directly (no `.value` wrapper), matching stats.ts.
  const vals = (o.properties?.['mSplineData'] as { values?: SplinePoint[] } | undefined)?.values;
  if (!Array.isArray(vals) || vals.length < 2 || !o.transform) return null;
  const pts: number[] = [];
  for (const v of vals) {
    const loc = v.properties?.Location?.value;
    if (!loc) continue;
    const [wx, wy] = localToWorldXY(loc, o.transform);
    pts.push(wx, wy);
  }
  if (pts.length < 4) return null;
  const cls = shortClass(o.typePath);
  return { cls, category: classify(cls), pts };
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

// Lightweight extraction of DropPod instanceNames for bootstrapping the "seen" set.
// Parses the save synchronously and returns only the pod IDs — cheaper than a full
// parseSaveFile when the caller only needs to seed the deconstructed-pod cache.
export function extractDropPodIds(filename: string, buffer: ArrayBuffer): string[] {
  const save = Parser.ParseSave(filename, buffer);
  const levels = Object.values(save.levels as Record<string, SaveLevel>);
  return levels.flatMap((l) =>
    (l.objects ?? [])
      .filter((o) => (o as SaveObject).typePath?.includes('BP_DropPod'))
      .map((o) => (o as SaveObject).instanceName),
  );
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
  // NOTE: we test for the *presence* of mHasBeenLooted, not its boolean value. The
  // @etothepii/satisfactory-file-parser build we use mis-reads every BoolProperty as
  // `false` (0 of ~1600 bools in a real save parse as true), so `value === true` would
  // never match and no hard drive would ever show collected. UE only serializes these
  // properties once the pod has been interacted with — an untouched pod omits them
  // entirely — so presence is the reliable "drive taken" signal.
  const lootedDropPodPaths = new Set(
    levels.flatMap((l) =>
      (l.objects ?? [])
        .filter(
          (o) =>
            o.typePath?.includes('BP_DropPod') &&
            o.properties?.['mHasBeenLooted'] !== undefined,
        )
        .map((o) => o.instanceName),
    ),
  );

  // ALL DropPod instanceNames present in this save's objects (looted or not). Used for
  // two purposes: returned as dropPodIds so the caller can accumulate the "ever seen"
  // set across saves, and used below to detect the "absent = deconstructed" case.
  const allDropPodIds = new Set(
    levels.flatMap((l) =>
      (l.objects ?? [])
        .filter((o) => o.typePath?.includes('BP_DropPod'))
        .map((o) => o.instanceName),
    ),
  );

  // mActivationCost on each Drop Pod: TArray<FItemAmount> with ItemClass (ObjectRef)
  // and Amount (int). The parser may expose the array under .value or .values, and each
  // struct element's fields may or may not be wrapped in an extra .value layer, so we
  // try both access patterns defensively.
  const dropPodCosts = new Map<string, Array<{ item: string; amount: number }>>();
  for (const l of levels) {
    for (const o of l.objects ?? []) {
      if (!o.typePath?.includes('BP_DropPod')) continue;
      const prop = o.properties?.['mActivationCost'] as
        | { value?: unknown; values?: unknown[] }
        | undefined;
      if (!prop) continue;
      const entries: unknown[] = Array.isArray(prop.value)
        ? prop.value
        : Array.isArray(prop.values)
        ? prop.values
        : [];
      const cost = entries.flatMap((entry: unknown) => {
        // Struct may be the entry itself, or nested in entry.value
        const s = (entry as { value?: unknown })?.value ?? entry;
        if (!s || typeof s !== 'object') return [];
        // ItemClass is an ObjectRef (pathName) possibly under .value
        const cls = s as { ItemClass?: unknown };
        const ref = cls.ItemClass as { pathName?: string; value?: { pathName?: string } } | undefined;
        const path = ref?.pathName ?? ref?.value?.pathName;
        // Amount is an integer possibly under .value
        const amtRaw = (s as { Amount?: unknown }).Amount;
        const amount = typeof amtRaw === 'number' ? amtRaw
          : typeof (amtRaw as { value?: unknown })?.value === 'number'
          ? (amtRaw as { value: number }).value : 0;
        if (!path || amount <= 0) return [];
        const itemCls = path.split('.').pop() ?? '';
        return itemCls ? [{ item: itemCls, amount }] : [];
      });
      if (cost.length > 0) dropPodCosts.set(o.instanceName, cost);
    }
  }

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

  // Every placed building, as a flat footprint list. Two sources:
  //  1. Full `Build_*` objects with a transform — machines, generators, belts, poles.
  //  2. Lightweight buildables packed on the BuildableSubsystem — foundations/walls/ramps,
  //     stored as one entry per class with an `instances[]` array of placements.
  const buildings: Building[] = [];
  // Spline buildings (belts/pipes/hypertubes/rails) drawn as connected polylines so the
  // network is visible instead of a dot at each origin.
  const buildingLines: BuildingLine[] = [];
  for (const l of levels) {
    for (const o of l.objects ?? []) {
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
          const recipe = o.properties?.['mCurrentRecipe']?.value;
          const recipePath = (recipe as { pathName?: string } | undefined)?.pathName;
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

      const sp = o.specialProperties;
      if (sp?.type === 'BuildableSubsystemSpecialProperties' && Array.isArray(sp.buildables)) {
        for (const entry of sp.buildables) {
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
      }
    }
  }

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
    cost: sm.type === 'hardDrive' ? dropPodCosts.get(sm.id) : undefined,
  }));

  // Extract purchased/unlocked schematics from the SchematicManager. The manager object
  // stores mPurchasedSchematics (bought at HUB) and mAvailableSchematics (can buy now).
  // We try several property names to be resilient across save versions.
  const unlockedSchematicSet = new Set<string>();
  const SCHEMATIC_PROPS = ['mPurchasedSchematics', 'mAvailableSchematics', 'mObtainedSchematics'];

  for (const l of levels) {
    for (const o of l.objects ?? []) {
      for (const propName of SCHEMATIC_PROPS) {
        const prop = o.properties?.[propName];
        if (!prop) continue;
        // Array values may sit in .value (array) or .values depending on parser version.
        const raw = prop.value;
        const items: unknown[] = Array.isArray(raw)
          ? raw
          : Array.isArray((prop as { values?: unknown[] }).values)
          ? (prop as { values?: unknown[] }).values!
          : [];
        for (const item of items) {
          // Each item is an ObjectRef with a pathName like:
          //   /Game/FactoryGame/Schematics/Schematic_2-5.Schematic_2-5_C
          // UE convention: "Package.ClassName_C" — the class name is the part AFTER the
          // last dot (shortClass takes the part BEFORE the dot, which is the asset name
          // without _C and would not match greeny's schematic keys).
          const path =
            (item as { pathName?: string })?.pathName ??
            (item as { value?: { pathName?: string } })?.value?.pathName;
          if (path) {
            const cls = path.split('.').pop() ?? '';
            if (cls.startsWith('Schematic_') || cls.startsWith('Research_')) {
              unlockedSchematicSet.add(cls);
            }
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = (save as any).header ?? {};

  return {
    markers,
    claimedNodes,
    buildings,
    buildingLines,
    factory: buildFactoryGraph(levels as unknown as Parameters<typeof buildFactoryGraph>[0]),
    sessionName: header.sessionName ?? header.mapName ?? '',
    saveVersion: header.saveVersion ?? 0,
    stats: computeStats(
      levels as unknown as Parameters<typeof computeStats>[0],
      header.playDurationSeconds ?? 0,
    ),
    unlockedSchematics: [...unlockedSchematicSet],
    dropPodIds: [...allDropPodIds],
  };
}
