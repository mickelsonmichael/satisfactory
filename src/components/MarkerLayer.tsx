import { useMemo } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';
import type { CollectibleMarker, CollectibleType } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { getIcon } from '../lib/icons';
import { humanize } from '../lib/buildings';

// Items whose icon filename doesn't follow the simple CamelCase-the-display-name rule.
const ITEM_ICON_OVERRIDE: Record<string, string> = {
  'Quickwire':              'IconDesc_HighSpeedWire_256',
  'Screw':                  'IconDesc_IronScrew_256',
  'Black Powder':           'IconDesc_Gunpowder_256',
  'Alclad Aluminum Sheet':  'IconDesc_AluminumPlate_256',
  'Heavy Modular Frame':    'IconDesc_ModularFrameHeavy_256',
  'Solid Biofuel':          'IconDesc_Biofuel_256',
};

function itemIconSrc(item: string): string {
  const override = ITEM_ICON_OVERRIDE[item];
  if (override) return `icons/items/${override}.png`;
  const camel = item.replace(/[-\s]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (_, c: string) => c.toUpperCase());
  return `icons/items/IconDesc_${camel}_256.png`;
}

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
  const map = useMap();
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
          <Popup className="sf-popup" autoPan={false}>
            <div className="sf-pop-header">
              <div className="sf-pop-title">{label}</div>
              <button className="sf-pop-close" onClick={() => map.closePopup()}>×</button>
            </div>
            {m.type === 'hardDrive' && (
              <>
                <div className="sf-pop-cost-label">Required to open</div>
                <div className="sf-pop-cost-section">
                  {(!m.cost || m.cost.length === 0) && !m.power && (
                    <span className="sf-pop-cost-free">✓ Free</span>
                  )}
                  {m.cost?.map(({ item, amount }) => (
                    <div key={item} className="sf-pop-cost-row">
                      <img src={itemIconSrc(item)} alt="" className="sf-pop-cost-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="sf-pop-cost-amount">{amount.toLocaleString()}</span>
                      <span className="sf-pop-cost-name">{humanize(item)}</span>
                    </div>
                  ))}
                  {m.power && (
                    <div className="sf-pop-cost-row">
                      <span className="sf-pop-cost-power-icon">⚡</span>
                      <span className="sf-pop-cost-amount">{m.power}</span>
                      <span className="sf-pop-cost-name">MW</span>
                    </div>
                  )}
                </div>
              </>
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
          <Popup className="sf-popup" autoPan={false}>
            <div className="sf-pop-header">
              <div className="sf-pop-title">{label}</div>
              <button className="sf-pop-close" onClick={() => map.closePopup()}>×</button>
            </div>
            <span className="sf-pop-badge collected">Collected</span>
            {m.type === 'hardDrive' && (
              <div style={{ opacity: 0.6 }}>
                <div className="sf-pop-cost-label">Required to open</div>
                <div className="sf-pop-cost-section">
                  {(!m.cost || m.cost.length === 0) && !m.power && (
                    <span className="sf-pop-cost-free">✓ Free</span>
                  )}
                  {m.cost?.map(({ item, amount }) => (
                    <div key={item} className="sf-pop-cost-row">
                      <img src={itemIconSrc(item)} alt="" className="sf-pop-cost-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="sf-pop-cost-amount">{amount.toLocaleString()}</span>
                      <span className="sf-pop-cost-name">{humanize(item)}</span>
                    </div>
                  ))}
                  {m.power && (
                    <div className="sf-pop-cost-row">
                      <span className="sf-pop-cost-power-icon">⚡</span>
                      <span className="sf-pop-cost-amount">{m.power}</span>
                      <span className="sf-pop-cost-name">MW</span>
                    </div>
                  )}
                </div>
              </div>
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
