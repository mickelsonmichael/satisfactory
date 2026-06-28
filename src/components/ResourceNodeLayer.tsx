import { useMemo } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';
import type { ResourceLayer } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { getResourceIcon } from '../lib/resourceIcons';

interface PositionedNode {
  id: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  z: number;
  purity: ResourceLayer['markers'][number]['purity'];
}

interface Props {
  layer: ResourceLayer;
  visible: boolean;
  // Current map viewport; markers outside it are not mounted. null = show all (initial render).
  bounds: LatLngBounds | null;
}

function purityLabel(p: PositionedNode['purity']): string {
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function ResourceNodeLayer({ layer, visible, bounds }: Props) {
  // Project this layer's markers to lat/lng once; gameToLatLng never changes for a marker.
  const positioned = useMemo<PositionedNode[]>(
    () =>
      layer.markers.map((m) => {
        const [lat, lng] = gameToLatLng(m.x, m.y);
        return { id: m.id, lat, lng, x: m.x, y: m.y, z: m.z, purity: m.purity };
      }),
    [layer],
  );

  // Only mount markers within the viewport (padded so edges aren't bare while panning),
  // matching MarkerLayer — keeps the DOM small across hundreds of nodes.
  const inView = useMemo(() => {
    if (!visible) return [];
    if (!bounds) return positioned;
    const padded = bounds.pad(0.3);
    return positioned.filter((m) => padded.contains([m.lat, m.lng]));
  }, [positioned, bounds, visible]);

  if (!visible) return null;

  const icon = getResourceIcon(layer.icon);

  return (
    <LayerGroup>
      {inView.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={icon}>
          <Popup>
            <strong>{layer.name}</strong>
            {m.purity && <> &middot; {purityLabel(m.purity)}</>}
            <br />
            {Math.round(m.x / 100)}m, {Math.round(m.y / 100)}m, {Math.round(m.z / 100)}m
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
