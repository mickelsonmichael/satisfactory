# Satisfactory Save File Format

This document describes the binary format of Satisfactory `.sav` files as
understood from game version **1.2** (SaveVersion 60). It is intended to help
future agents parse or inspect save files without reverse-engineering them from
scratch.

The canonical reference implementation used by this project is
[`@etothepii/satisfactory-file-parser`](https://github.com/etothepii4/satisfactory-file-parser)
(npm package), a TypeScript library that supports U1.0–U1.2.

---

## 1. Overview

- **Encoding**: Little-endian throughout
- **Format**: Unreal Engine 5 save format — binary header followed by a
  zlib-compressed body
- **Chunk size**: Body is split into 131,072-byte uncompressed chunks
- **Magic number**: `0x9E2A83C1` (4 bytes, LE) marks each chunk boundary

Satisfactory save files are large (3–10 MB compressed; 30+ MB uncompressed
for active worlds).

---

## 2. Version History

The two key version numbers to check are `saveHeaderType` and `saveVersion`,
both `int32LE` at the start of the file.

| Game Version | saveHeaderType | saveVersion | Notes |
|---|---|---|---|
| U1.0.0.x | 14 | 46–52 | First stable release |
| U1.1.x.x | 14 | 58 | Mid-cycle update |
| U1.2.0.0 | 14 | 60 | Added new content |
| This save (`satisfactory.20260627.sav`) | 14 | 60 | buildVersion 495413 |

The `saveHeaderType` has been 14 since at least U1.0. When parsing, check
`saveVersion` to gate on format-specific fields — see the parser source for
the exact thresholds.

---

## 3. File Header Layout

All fields are little-endian. FString encoding is described in §6.

| Offset | Type | Field | Value in example save |
|--------|------|-------|-----------------------|
| 0 | int32 | saveHeaderType | 14 |
| 4 | int32 | saveVersion | 60 |
| 8 | int32 | buildVersion | 495413 |
| 12 | FString | saveName | "SKY CITY 2_autosave_4" |
| +N | FString | mapName | "Persistent_Level" |
| +N | FString | mapOptions | "" (usually empty) |
| +N | FString | sessionName | "SKY CITY 2" |
| +N | int32 | playDurationSeconds | 1191888 (~13.8 days) |
| +N | int64 | saveDateTime | Windows FILETIME ticks |
| +N | uint8 | sessionVisibility | 0 (private) |
| +N | int32 | editorObjectVersion | 40 |
| +N | FString | modMetadata | "" (vanilla) |
| +N | int32 | isModdedSave | 0 |
| +N | FString | saveIdentifier | "PBuwZUQ0TtKbx4K-lcyyiw" |
| +N | bool | partitionEnabledFlag | true |
| +N | FMD5Hash | consistencyHashBytes | 16-byte MD5 |
| +N | bool | creativeModeEnabled | false |

> **Note on field order**: The binary order of `saveName` comes **before**
> `mapName`. Early documentation sometimes lists them in the opposite order —
> trust the binary, not the table.

The body begins immediately after the last header field. In the example save,
the first chunk magic number `0x9E2A83C1` appears at byte offset `0x9E` (158).

---

## 4. Zlib Chunk Structure

Each chunk has a 48-byte header followed by zlib-compressed data:

```
[4 bytes]  magic          = 0x9E2A83C1 (LE)
[4 bytes]  archiveHeader  = 0x22222222 (v2 format flag)
[8 bytes]  maxChunkSize   = 131072 (uncompressed max per chunk)
[1 byte]   compressorNum  = compression algorithm (2 = zlib)
[8 bytes]  compressedSize
[8 bytes]  uncompressedSize
[8 bytes]  compressedSizeRepeat   (validation copy)
[8 bytes]  uncompressedSizeRepeat (validation copy)
[N bytes]  zlib-compressed data
```

After decompressing all chunks and concatenating them, the result starts with
an `int64` giving the total uncompressed size, followed by the body objects.

---

## 5. Body Structure (Decompressed)

The decompressed body is organized into **streaming levels**. Each level is
identified by a unique key (an alphanumeric ID like `"8XA9Y6NF2O9EGM8WJ77CF79NM"`).

```
int64                                   total decompressed size
FSaveObjectVersionData                  (saveVersion >= 53)
FWorldPartitionValidationData
TMap<FString, FPerStreamingLevelSaveData>   per-level data
FPersistentAndRuntimeSaveData
FUnresolvedWorldSaveData
```

Each level entry contains:
- `objects: SaveObject[]` — entities still present in the world (uncollected items, buildings, etc.)
- `collectables: { levelName, pathName }[]` — references to destroyed/collected actors (no position data)

---

## 6. String Encoding (FString)

```
int32 LE: length
  if length == 0: empty string, no further bytes
  if length > 0:  UTF-8 bytes, (length) bytes total including null terminator
  if length < 0:  UTF-16LE, |length| × 2 bytes including null terminator
```

Example — "SKY CITY 2" (10 chars + null = 11 bytes):
```
0B 00 00 00   53 4B 59 20 43 49 54 59 20 32 00
(len=11)      S  K  Y     C  I  T  Y     2  \0
```

---

## 7. Object Types

### SaveEntity
An actor placed in the world. Has a `FTransform3f` with position, rotation,
and scale. Collectibles are always `SaveEntity` instances.

### SaveComponent
A component attached to an entity (e.g., a belt segment on a constructor).
Has no independent transform.

When filtering for collectibles, only check `SaveEntity` instances (those
with a non-null `transform.translation`).

---

## 8. FTransform3f Layout

Each `FTransform3f` is three consecutive `float32[3]` arrays, little-endian:

```
float32[4]  rotation    quaternion (x, y, z, w)
float32[3]  translation (x, y, z) in centimeters
float32[3]  scale3d     (x, y, z)
```

**Coordinate system** (Unreal Engine, left-handed):
- `X` increases northward (up on the map image)
- `Y` increases eastward (right on the map image)
- `Z` is elevation (meters when divided by 100)

Leaflet CRS.Simple mapping: `lat = gameX`, `lng = gameY`.

---

## 9. Collectible Types

The following actor class paths are tracked by this project. All are confirmed
from parsing `saves/satisfactory.20260627.sav` (SaveVersion 60).

| Display Name | typePath | Notes |
|---|---|---|
| Hard Drive | `/Game/FactoryGame/World/Benefit/DropPod/BP_DropPod.BP_DropPod_C` | DropPod stays in world. Two bool flags: `mHasBeenOpened` (casing cracked) and `mHasBeenLooted` (drive taken). Use `mHasBeenLooted` to mark collected |
| Mercer Sphere | `/Game/FactoryGame/Prototype/WAT/BP_WAT2.BP_WAT2_C` | "WAT2" = Mercer Sphere pickup actor |
| Somersloop | `/Game/FactoryGame/Prototype/WAT/BP_WAT1.BP_WAT1_C` | "WAT1" = Somersloop pickup actor |
| Blue Power Slug | `/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal.BP_Crystal_C` | mk1 |
| Yellow Power Slug | `/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal_mk2.BP_Crystal_mk2_C` | mk2 |
| Purple Power Slug | `/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal_mk3.BP_Crystal_mk3_C` | mk3 |
| Cassette Tape | Not yet found | Not present as a dedicated actor in this save; TBD |

### Decoration types (not tracked as collectibles)

| Class | Notes |
|---|---|
| `BP_MercerShrine_C` | Shrine decoration for Mercer Sphere; separate from the WAT2 pickup |
| `BP_Ship_C` | Crashed FICSIT freighter debris |
| `BP_CrashSiteDebris_C` | Additional crash site decoration |

---

## 10. Collected / Destroyed Actors

When a player picks up a collectible:

1. **Non-DropPod types** (slugs, WAT1, WAT2): the actor is removed from
   `level.objects` and a reference is added to `level.collectables` as
   `{ levelName: string, pathName: string }`. The pathName contains the class
   name and instance identifier, e.g.:
   ```
   "Persistent_Level:PersistentLevel.BP_WAT135"
   "Persistent_Level:PersistentLevel.BP_WAT1_C_UAID_04421A9713F0C46101_..."
   ```

2. **DropPods (Hard Drives)**: the DropPod actor **stays in `level.objects`**
   and exposes two boolean flags, `mHasBeenOpened` (casing cracked) and
   `mHasBeenLooted` (drive taken). In practice both are serialized onto the
   actor **together**, the moment the pod is looted — an untouched pod omits
   them entirely.

   ⚠️ **Do not test the boolean *value*.** The
   `@etothepii/satisfactory-file-parser` build we use mis-reads every
   `BoolProperty` as `false` (0 of ~1600 bools in a real save parse as `true`),
   so `mHasBeenLooted === true` never matches. Test for the **presence** of the
   `mHasBeenLooted` property instead — UE only writes it once the pod has been
   interacted with, so presence is the reliable "drive taken" signal.

   A pod that is *dismantled* is removed from `level.objects` and instead
   appears in `level.collectables`. So to mark a hard drive collected: check
   for the presence of `mHasBeenLooted` **or** presence in `collectables`.
   Looted DropPods retain their world position — useful for showing "already
   collected" markers.

To match a pathName to a collectible type, use the base class identifier
(before the first `.` in the last path segment) with a regex that tolerates
both naming conventions:
```typescript
// baseName = "BP_WAT1" (from typePath "…/BP_WAT1.BP_WAT1_C")
new RegExp('(?:[.:]|^)' + baseName + '(?:[^A-Za-z]|$)')
```

---

## 11. Save Counts (Reference — `satisfactory.20260627.sav`)

Parsed counts from SaveVersion 60, session "SKY CITY 2":

| Type | Uncollected | Collected | Total |
|------|-------------|-----------|-------|
| Hard Drives (DropPods) | 91 | 1 | 92 |
| Mercer Spheres (WAT2) | 189 | 18 | 207 |
| Somersloops (WAT1) | 71 | 11 | 82 |
| Blue Power Slugs | 376 | 80 | 456 |
| Yellow Power Slugs | 257 | 39 | 296 |
| Purple Power Slugs | 180 | 24 | 204 |

---

## 12. World Bounds

Game world extents in centimeters (Unreal Engine units):

```
X: -324,698 to 425,298  (north–south, ~7.5 km)
Y: -375,000 to 375,000  (east–west, ~7.5 km)
```

The map image overlay uses these exact bounds in Leaflet `CRS.Simple`.

---

## 13. Adding a New Game Version

When a new Satisfactory update ships:

1. Parse the new `.sav` file using the npm library (it usually updates quickly).
2. Check `saveVersion` and `saveHeaderType` in the header; update the version
   table in §2.
3. Inspect `Object.keys(save.levels[anyLevel].objects[0])` for new fields.
4. Search for new collectible class paths by iterating all `obj.typePath`
   values.
5. Add new `typePath` entries to `src/lib/collectibles.ts`.
6. Update the counts table in §11.
7. Commit a new `.sav` file to `saves/` and run `node scripts/generate-manifest.js`.
