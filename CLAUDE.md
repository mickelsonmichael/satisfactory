# Satisfactory Map — Agent Instructions

## Reference: AnthorNet SC-InteractiveMap (SCIM)

When investigating Satisfactory save file format questions, consult the SCIM source:
- **Repository:** https://github.com/AnthorNet/SC-InteractiveMap
- **Key file:** `src/SaveParser/Read.js` — binary save parser; shows how each actor type's
  extra binary data is laid out (power lines, circuit subsystem, conveyors, vehicles, etc.)

SCIM is the canonical open-source Satisfactory map tool and its save parser is kept up to
date with each game version. Use it to verify property names, data layouts, and edge cases
before implementing save-parsing logic.

## Parser Notes

We use `@etothepii/satisfactory-file-parser` (npm) for binary parsing.

**`src/lib/saveObject.ts` is the single shared model of parsed save output.** It owns the
`SaveObject`/`SaveLevel`/`Transform`/`ObjectRef` types and the helpers that encode every
parser quirk: `shortClass`/`classNameOf`/`parentOf` (path handling), `propValue`/`refPath`/
`propArray`/`hasProp` (property access), `splinePoints`/`splineLengthCm` (belt/pipe/rail
splines), `yawOf`/`localToWorldXY` (transforms), and `allObjects`/`buildableEntries`
(iteration incl. lightweight buildables). New save-reading code must import from there
rather than redefining raw-object types or property-access logic.

Key parser quirks (all encoded in `saveObject.ts`):

- **BoolProperty bug**: all BoolProperty values parse as `false`. Detect booleans by
  property *presence* rather than value (e.g., `obj.properties['mHasBeenLooted'] !== undefined`).
- **PowerLineSpecialProperties**: power line actors expose `source` and `target` as
  `ObjectReference { levelName, pathName }` in `specialProperties`. The pathName is the
  `FGPowerConnectionComponent` instance on each end; `parentOf(pathName)` gives the machine
  actor. This is more reliable than reading `mPowerCircuit` on connection components.
- **ObjectProperty**: `value` is `{ levelName: string, pathName: string }`.
- **PropertiesMap**: `object.properties` is keyed by property name, each entry is
  `AbstractBaseProperty & { value: unknown }`.
