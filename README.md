# Satisfactory Map

An interactive web map for [Satisfactory](https://www.satisfactorygame.com/) save files.
Parses `.sav` files in the browser and displays collectibles on the world map.

**Live site**: https://mickelsonmichael.github.io/satisfactory/

## Features

- Auto-loads the most recent save from `saves/`
- Drag-and-drop or upload your own `.sav` file
- Interactive Leaflet map with the full Satisfactory world
- Markers for: Hard Drives, Mercer Spheres, Somersloops, Power Slugs (Blue/Yellow/Purple)
- Resource node markers: ore/oil nodes (11 types) and resource wells (oil, nitrogen, water, geysers), with purity in the popup
- Toggle visibility per collectible type and per resource type
- Show/hide already-collected items

## Local Development

```bash
npm install

# Download the map image (gitignored; fetched by CI automatically)
mkdir -p public/map
curl -L --user-agent "Mozilla/5.0" \
  -o public/map/satisfactory-map.jpg \
  "https://satisfactory.wiki.gg/images/8/8b/Map.jpg"

# Generate the save manifest (lists available .sav files)
npm run generate-manifest

# Download marker icons (gitignored; fetched by CI automatically)
npm run download-resource-icons
npm run download-collectible-icons

# Start dev server
npm run dev
```

Open http://localhost:5173 — the site auto-loads the most recent save.

## Adding a New Save

1. Copy the `.sav` file from the game server into `saves/` with the naming
   convention `<name>.<YYYYMMDD>.sav`, e.g. `satisfactory.20260701.sav`.
2. Run `npm run generate-manifest` to update `saves/manifest.json`.
3. Commit and push — GitHub Pages redeploys automatically.

See `.github/workflows/generate-manifest.yml` for a stub that automates
this from a game server using a cron job.

## Resource Nodes

Resource nodes are static world geology (they're never "collected" and don't
depend on the save file), so they ship as committed static data in
`public/data/resourceNodes.json`, generated from the
[satisfactory-calculator.com](https://satisfactory-calculator.com/en/interactive-map)
map data:

```bash
# Regenerate the node database when the game/map data changes (commit the result)
npm run generate-resource-nodes

# Fetch the official in-game icons (gitignored; CI runs this automatically)
npm run download-resource-icons
```

## Save File Format

See [`docs/SAVE_FILE_FORMAT.md`](docs/SAVE_FILE_FORMAT.md) for a detailed
reference on the binary format, version history, and collectible class paths.
This is the ground truth for future agents adding new collectible types.

## Tech Stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [Leaflet.js](https://leafletjs.com/) / [react-leaflet](https://react-leaflet.js.org/) with `CRS.Simple`
- [`@etothepii/satisfactory-file-parser`](https://github.com/etothepii4/satisfactory-file-parser) for binary parsing
- GitHub Pages for hosting

## Coordinate Validation

After first deployment, verify that markers appear in the correct locations:
1. Find a known Hard Drive crash site on the Satisfactory in-game map
2. Check that the marker for that site appears in the same location on this map
3. If markers are mirrored north-south or east-west, flip the axis in
   `src/lib/coordinates.ts` (`gameToLatLng`)
