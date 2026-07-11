// Shared model of a parsed Satisfactory save + helpers for reading it.
//
// This is the single place that encodes the shape of @etothepii/satisfactory-file-parser
// output and its quirks (see CLAUDE.md "Parser Notes" and docs/SAVE_FILE_FORMAT.md).
// Every module that walks save objects — parserAdapter.ts, stats.ts, factoryGraph.ts,
// efficiency.ts — imports these types and helpers instead of redefining them.
//
// Pure data/util module: no React, no I/O, no parser import.

// --- Geometry ---

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  translation?: Vec3;
  rotation?: Quat;
}

// --- Save object shape ---

// An ObjectProperty / ObjectReference value: points at another actor or component.
export interface ObjectRef {
  levelName?: string;
  pathName?: string;
}

// A property in `object.properties`. Scalar properties expose `.value`; array-ish
// properties expose either `.value` (an array) or `.values` depending on the property
// kind and parser version — use propArray() to normalize.
export interface SaveProperty {
  value?: unknown;
  values?: unknown[];
}

// One placement inside a lightweight-buildable entry (foundations/walls/ramps).
export interface BuildableInstance {
  transform?: Transform;
}

// One class of lightweight buildable on the BuildableSubsystem, with all its placements.
export interface BuildableEntry {
  typeReference?: { pathName?: string };
  instances?: BuildableInstance[];
}

export interface SaveObject {
  typePath?: string;
  instanceName?: string;
  properties?: Record<string, SaveProperty | undefined>;
  transform?: Transform;
  // Actor-type-specific extra binary data. Power lines expose source/target here;
  // the BuildableSubsystem exposes its packed lightweight buildables.
  specialProperties?: {
    type?: string;
    buildables?: BuildableEntry[];
    source?: ObjectRef;
    target?: ObjectRef;
  };
}

export interface SaveCollectable {
  pathName: string;
}

export interface SaveLevel {
  objects?: SaveObject[];
  collectables?: SaveCollectable[];
}

// --- Iteration ---

// Every object across every streaming level, in save order.
export function* allObjects(levels: SaveLevel[]): Generator<SaveObject> {
  for (const level of levels) {
    for (const o of level.objects ?? []) yield o;
  }
}

// Lightweight buildables (foundations/walls/ramps…) packed on the BuildableSubsystem
// actor. Since Satisfactory 1.0 these are NOT individual save objects — a megabase has
// tens of thousands, so they live as one entry per class with an instances[] array.
// Returns [] for every other object.
export function buildableEntries(o: SaveObject): BuildableEntry[] {
  const sp = o.specialProperties;
  return sp?.type === 'BuildableSubsystemSpecialProperties' && Array.isArray(sp.buildables)
    ? sp.buildables
    : [];
}

// --- Name / path helpers ---

// "/Game/.../Build_SmelterMk1.Build_SmelterMk1_C" -> "Build_SmelterMk1"
// (asset name: last path segment, before the dot — no "_C" suffix).
export function shortClass(path: string): string {
  const seg = path.split('/').pop() ?? path;
  return seg.split('.')[0];
}

// "/Game/…/Recipe_IngotIron.Recipe_IngotIron_C" -> "Recipe_IngotIron_C"
// (UE class name: segment after the LAST dot, keeping the "_C" suffix). Use this when
// matching keys that retain the suffix, e.g. recipes.json recipe keys and greeny's
// schematic keys — shortClass() would drop the suffix and not match.
export function classNameOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

// Actor instanceName for a component instanceName
// ("…Build_X_C_1.StorageInventory" → "…Build_X_C_1").
export function parentOf(instanceName: string): string {
  const i = instanceName.lastIndexOf('.');
  return i >= 0 ? instanceName.slice(0, i) : instanceName;
}

// --- Property access ---

// `.value` of a named property, or undefined if absent.
export function propValue(o: SaveObject, name: string): unknown {
  return o.properties?.[name]?.value;
}

// pathName out of an ObjectProperty/ObjectReference value, tolerating undefined.
export function refPath(v: unknown): string | undefined {
  return v && typeof v === 'object' && 'pathName' in v
    ? (v as ObjectRef).pathName
    : undefined;
}

// True when the named property is serialized on the object at all.
//
// This is the ONLY correct way to read a BoolProperty with our parser build: it
// mis-reads every BoolProperty as `false` (0 of ~1600 bools in a real save parse as
// true), so testing the value never matches. UE omits properties that still hold their
// class-default value, so presence itself is the signal (e.g. `mHasBeenLooted` only
// appears once a drop pod has been looted).
export function hasProp(o: SaveObject, name: string): boolean {
  return o.properties?.[name] !== undefined;
}

// Elements of an array-valued property, whether the parser put them in `.value`
// (as an array) or `.values`.
export function propArray(prop: SaveProperty | undefined): unknown[] {
  if (!prop) return [];
  if (Array.isArray(prop.value)) return prop.value;
  if (Array.isArray(prop.values)) return prop.values;
  return [];
}

// --- Splines (belts, pipes, hypertubes, rails) ---

// A spline point's local Location within the object frame.
interface SplinePointRaw {
  properties?: { Location?: { value?: Vec3 } };
}

// Local-frame points from `mSplineData.values[i].properties.Location.value`.
// Note mSplineData exposes `.values` directly (no `.value` wrapper).
export function splinePoints(o: SaveObject): Vec3[] {
  const vals = (o.properties?.['mSplineData'] as { values?: SplinePointRaw[] } | undefined)
    ?.values;
  if (!Array.isArray(vals)) return [];
  const pts: Vec3[] = [];
  for (const v of vals) {
    const p = v?.properties?.Location?.value;
    if (p) pts.push(p);
  }
  return pts;
}

// Straight-line length (cm) through a spline's saved points. Belts/pipes/tracks are
// slightly curved, so this very mildly underestimates, but it is plenty accurate for a
// headline number.
export function splineLengthCm(o: SaveObject): number {
  const pts = splinePoints(o);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(
      pts[i].x - pts[i - 1].x,
      pts[i].y - pts[i - 1].y,
      pts[i].z - pts[i - 1].z,
    );
  }
  return len;
}

// --- Transforms ---

// Yaw (rotation about Z) in radians from a quaternion. Buildings only rotate about the
// vertical axis, so the X/Y components are ~0 and this reduces to 2*atan2(z, w).
export function yawOf(q?: Quat): number {
  if (!q) return 0;
  return 2 * Math.atan2(q.z, q.w);
}

// Rotate a local vector by a quaternion (standard v' = v + 2q_w(q×v) + 2q×(q×v)) and add
// the translation, giving world coordinates. Most belts have identity rotation, but pipes
// and angled segments can be rotated, so applying the full quaternion is the safe path.
export function localToWorldXY(p: Vec3, t: Transform): [number, number] {
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
