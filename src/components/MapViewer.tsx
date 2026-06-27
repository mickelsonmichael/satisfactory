import { MapContainer, ImageOverlay } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ParseResult, LayerState } from '../types';
import { WORLD_BOUNDS } from '../lib/coordinates';
import MarkerLayer from './MarkerLayer';

interface Props {
  result: ParseResult | null;
  layerStates: LayerState[];
  showCollected: boolean;
}

export default function MapViewer({ result, layerStates, showCollected }: Props) {
  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={WORLD_BOUNDS}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ width: '100%', height: '100%' }}
      minZoom={-5}
      maxZoom={4}
      zoomSnap={0.5}
      zoomDelta={0.5}
    >
      <ImageOverlay
        url="/map/satisfactory-map.jpg"
        bounds={WORLD_BOUNDS}
        opacity={1}
      />

      {result &&
        layerStates.map((ls) => (
          <MarkerLayer
            key={ls.type}
            markers={result.markers}
            type={ls.type}
            label={ls.label}
            color={ls.color}
            visible={ls.visible}
            showCollected={showCollected}
          />
        ))}
    </MapContainer>
  );
}
