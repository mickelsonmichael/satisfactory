import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import L, { type LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ParseResult, LayerState, ResourceData, ResourcePurity, Cave } from '../types';
import { WORLD_BOUNDS } from '../lib/coordinates';
import MarkerLayer from './MarkerLayer';
import ResourceNodeLayer from './ResourceNodeLayer';
import CaveLayer from './CaveLayer';

// Map tiles are self-hosted under public/tiles/ (downloaded by scripts/download-tiles.mjs).
// Vite's BASE_URL ensures the path works both in local dev (/) and on GitHub Pages (/satisfactory/).
const TILE_URL = `${import.meta.env.BASE_URL}tiles/realisticLayer/Stable/{z}/{x}/{y}.png`;

// Tiles only exist natively up to zoom 5. Allowing 3 levels of overzoom (maxZoom 8) lets
// users inspect dense marker clusters without forcing Leaflet to stretch a 256px tile to
// 32,768px (the 128x blur you'd get at zoom 12) — which wastes GPU texture memory for no
// added detail.
const MAX_NATIVE_ZOOM = 5;
const MAX_ZOOM = 8;

// Stable empty set used before a save loads, so the claimedNodes prop reference is constant.
const EMPTY_CLAIMED: Set<string> = new Set();

interface Props {
  result: ParseResult | null;
  layerStates: LayerState[];
  showCollected: boolean;
  localCollected: Set<string>;
  onMarkCollected: (id: string) => void;
  resourceData: ResourceData | null;
  // Per-layer purity visibility: resourcePurity[layerId][purity].
  resourcePurity: Record<string, Record<ResourcePurity, boolean>>;
  caves: Cave[];
  showCaves: boolean;
}

// Reports the visible bounds after the map settles so MarkerLayer can cull offscreen markers.
// Updates fire on moveend/zoomend only (not mid-gesture), so culling never runs during animation.
function ViewportTracker({ onChange }: { onChange: (b: LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });
  // Seed the initial viewport (the map's `load` event may fire before this mounts).
  useEffect(() => {
    onChange(map.getBounds());
  }, [map, onChange]);
  return null;
}

export default function MapViewer({ result, layerStates, showCollected, localCollected, onMarkCollected, resourceData, resourcePurity, caves, showCaves }: Props) {
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);

  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={WORLD_BOUNDS}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ width: '100%', height: '100%', background: '#000' }}
      minZoom={2}
      maxZoom={MAX_ZOOM}
      zoomSnap={0.25}
      zoomDelta={0.25}
    >
      <ViewportTracker onChange={setBounds} />

      <TileLayer
        url={TILE_URL}
        tileSize={256}
        minNativeZoom={3}
        maxNativeZoom={MAX_NATIVE_ZOOM}
        noWrap={true}
        bounds={WORLD_BOUNDS}
        keepBuffer={4}
        updateWhenZooming={false}
        updateWhenIdle={true}
      />

      {result &&
        layerStates.map((ls) => (
          <MarkerLayer
            key={ls.type}
            markers={result.markers}
            type={ls.type}
            label={ls.label}
            visible={ls.visible}
            showCollected={showCollected}
            localCollected={localCollected}
            bounds={bounds}
            onMarkCollected={onMarkCollected}
          />
        ))}

      {/* Resource nodes are static world geology — rendered regardless of whether a save is loaded.
          A node gets a "claimed" check when the loaded save has an extractor built on it. */}
      {resourceData?.layers.map((layer) => (
        <ResourceNodeLayer
          key={layer.id}
          layer={layer}
          purity={resourcePurity[layer.id]}
          bounds={bounds}
          claimedNodes={result?.claimedNodes ?? EMPTY_CLAIMED}
        />
      ))}

      {/* Cave outlines — static world geometry, toggled by the "Show Caves" checkbox. */}
      <CaveLayer caves={caves} visible={showCaves} />
    </MapContainer>
  );
}
