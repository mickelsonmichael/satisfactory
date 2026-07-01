import { useMemo } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';
import type { CollectibleMarker, CollectibleType } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { getIcon } from '../lib/icons';
import { humanize } from '../lib/buildings';

interface PositionedMarker extends CollectibleMarker {
  lat: number;
  lng: number;
}

interface Props {
  markers: CollectibleMarker[];
  type: CollectibleType;
  label: string;
  visible: boolean;
  showCollected: boolean;
  localCollected: Set<string>;
  // Current map viewport; markers outside it are not mounted. null = show all (initial render).
  bounds: LatLngBounds | null;
  onMarkCollected: (id: string) => void;
  // When true, each marker shows a permanent elevation label (baked into the icon)
  // so the user can read a collectible's height without opening its popup.
  showHeight: boolean;
  // Disc diameter in px for the current zoom (icons grow as the map zooms in).
  iconSize: number;
}

// Elevation label drawn into the marker icon, in meters (game units are cm).
const heightLabel = (z: number) => `${Math.round(z / 100)} m`;

export default function MarkerLayer({
  markers,
  type,
  label,
  visible,
  showCollected,
  localCollected,
  bounds,
  onMarkCollected,
  showHeight,
  iconSize,
}: Props) {
  // Project this layer's markers to lat/lng once; gameToLatLng never changes for a marker.
  const ofType = useMemo<PositionedMarker[]>(
    () =>
      markers
        .filter((m) => m.type === type)
        .map((m) => {
          const [lat, lng] = gameToLatLng(m.x, m.y);
          return { ...m, lat, lng };
        }),
    [markers, type],
  );

  const { uncollected, collected } = useMemo(() => {
    const u: PositionedMarker[] = [];
    const c: PositionedMarker[] = [];
    for (const m of ofType) {
      if (m.collected || localCollected.has(m.id)) c.push(m);
      else u.push(m);
    }
    return { uncollected: u, collected: c };
  }, [ofType, localCollected]);

  // Only mount markers within the viewport (padded so edges aren't bare while panning).
  // This keeps the DOM small (~dozens instead of ~1,764), so zoom/pan don't stall on
  // repositioning offscreen nodes.
  const visibleUncollected = useMemo(() => {
    if (!bounds) return uncollected;
    const padded = bounds.pad(0.3);
    return uncollected.filter((m) => padded.contains([m.lat, m.lng]));
  }, [uncollected, bounds]);

  const visibleCollected = useMemo(() => {
    if (!showCollected) return [];
    if (!bounds) return collected;
    const padded = bounds.pad(0.3);
    return collected.filter((m) => padded.contains([m.lat, m.lng]));
  }, [collected, bounds, showCollected]);

  if (!visible) return null;

  return (
    <LayerGroup>
      {visibleUncollected.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={getIcon(type, false, showHeight ? heightLabel(m.z) : null, iconSize)}
        >
          <Popup className="sf-popup">
            <div className="sf-pop-title">{label}</div>
            {m.cost && m.cost.length > 0 && (
              <dl className="sf-pop-coords sf-pop-cost">
                {m.cost.map(({ item, amount }) => (
                  <>
                    <dt key={`${item}-dt`}>{humanize(item)}</dt>
                    <dd key={`${item}-dd`}>{amount.toLocaleString()}</dd>
                  </>
                ))}
              </dl>
            )}
            <dl className="sf-pop-coords">
              <dt>X</dt>
              <dd>{Math.round(m.x / 100)} m</dd>
              <dt>Y</dt>
              <dd>{Math.round(m.y / 100)} m</dd>
              <dt>Z</dt>
              <dd>{Math.round(m.z / 100)} m</dd>
            </dl>
            <button className="sf-pop-btn" onClick={() => onMarkCollected(m.id)}>
              Mark Collected
            </button>
          </Popup>
        </Marker>
      ))}

      {visibleCollected.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={getIcon(type, true, showHeight ? heightLabel(m.z) : null, iconSize)}
        >
          <Popup className="sf-popup">
            <div className="sf-pop-title">{label}</div>
            <span className="sf-pop-badge collected">Collected</span>
            {m.cost && m.cost.length > 0 && (
              <dl className="sf-pop-coords sf-pop-cost" style={{ opacity: 0.6 }}>
                {m.cost.map(({ item, amount }) => (
                  <>
                    <dt key={`${item}-dt`}>{humanize(item)}</dt>
                    <dd key={`${item}-dd`}>{amount.toLocaleString()}</dd>
                  </>
                ))}
              </dl>
            )}
            <dl className="sf-pop-coords">
              <dt>X</dt>
              <dd>{Math.round(m.x / 100)} m</dd>
              <dt>Y</dt>
              <dd>{Math.round(m.y / 100)} m</dd>
            </dl>
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
