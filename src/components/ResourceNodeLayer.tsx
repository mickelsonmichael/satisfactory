import { useMemo } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';
import type { ResourceLayer, ResourcePurity } from '../types';
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
  // Which of this layer's purities are shown. Undefined until the data loads.
  // A marker shows when its purity is enabled here; the layer renders nothing when none are.
  purity: Record<ResourcePurity, boolean> | undefined;
  // Current map viewport; markers outside it are not mounted. null = show all (initial render).
  bounds: LatLngBounds | null;
  // Node ids that have an extractor built on them in the loaded save.
  claimedNodes: Set<string>;
}

function purityLabel(p: PositionedNode['purity']): string {
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function ResourceNodeLayer({ layer, purity, bounds, claimedNodes }: Props) {
  const anyVisible = !!purity && (purity.pure || purity.normal || purity.impure);
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
    if (!anyVisible || !purity) return [];
    // A marker shows when its purity is enabled. Markers with no purity (none in the
    // current data) fall back to showing whenever any purity is enabled.
    const passesPurity = (m: PositionedNode) => (m.purity ? purity[m.purity] : true);
    const visibleByPurity = positioned.filter(passesPurity);
    if (!bounds) return visibleByPurity;
    const padded = bounds.pad(0.3);
    return visibleByPurity.filter((m) => padded.contains([m.lat, m.lng]));
  }, [positioned, bounds, anyVisible, purity]);

  if (!anyVisible) return null;

  const icon = getResourceIcon(layer.icon);
  const claimedIcon = getResourceIcon(layer.icon, true);

  return (
    <LayerGroup>
      {inView.map((m) => {
        const claimed = claimedNodes.has(m.id);
        return (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={claimed ? claimedIcon : icon}>
          <Popup className="sf-popup">
            <div className="sf-pop-title">{layer.name}</div>
            {claimed && <span className="sf-pop-badge collected">Claimed</span>}
            {m.purity && (
              <span className={`sf-pop-badge purity-${m.purity}`}>{purityLabel(m.purity)}</span>
            )}
            <dl className="sf-pop-coords">
              <dt>X</dt>
              <dd>{Math.round(m.x / 100)} m</dd>
              <dt>Y</dt>
              <dd>{Math.round(m.y / 100)} m</dd>
              <dt>Z</dt>
              <dd>{Math.round(m.z / 100)} m</dd>
            </dl>
          </Popup>
        </Marker>
        );
      })}
    </LayerGroup>
  );
}
