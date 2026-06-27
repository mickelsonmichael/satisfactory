import { LayerGroup, Marker, Tooltip } from 'react-leaflet';
import type { CollectibleMarker, CollectibleType } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { getIcon } from '../lib/icons';

interface Props {
  markers: CollectibleMarker[];
  type: CollectibleType;
  label: string;
  color: string;
  visible: boolean;
  showCollected: boolean;
}

export default function MarkerLayer({
  markers,
  type,
  label,
  color,
  visible,
  showCollected,
}: Props) {
  if (!visible) return null;

  const typeMarkers = markers.filter((m) => m.type === type);
  const uncollected = typeMarkers.filter((m) => !m.collected);
  const collected = typeMarkers.filter((m) => m.collected);

  return (
    <LayerGroup>
      {uncollected.map((m) => (
        <Marker
          key={m.id}
          position={gameToLatLng(m.x, m.y)}
          icon={getIcon(type, color, false)}
        >
          <Tooltip>
            <strong>{label}</strong>
            <br />
            {Math.round(m.x / 100)}m, {Math.round(m.y / 100)}m, {Math.round(m.z / 100)}m
          </Tooltip>
        </Marker>
      ))}

      {showCollected &&
        collected.map((m) => (
          <Marker
            key={m.id}
            position={gameToLatLng(m.x, m.y)}
            icon={getIcon(type, color, true)}
          >
            <Tooltip>
              <strong>{label}</strong> (collected)
              <br />
              {Math.round(m.x / 100)}m, {Math.round(m.y / 100)}m
            </Tooltip>
          </Marker>
        ))}
    </LayerGroup>
  );
}
