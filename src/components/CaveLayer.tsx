import { useMemo } from 'react';
import { LayerGroup, Polygon, Polyline } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { Cave } from '../types';
import { gameToLatLng } from '../lib/coordinates';

interface Props {
  caves: Cave[];
  visible: boolean;
}

// Satisfactory-orange theme, matching the marker ring color used elsewhere.
const CAVE_COLOR = '#FA9549';
// Entrances are drawn brighter/thicker so the cave mouths stand out from the outline.
const ENTRANCE_COLOR = '#FFD9A0';

const project = (pt: [number, number]): LatLngExpression => gameToLatLng(pt[0], pt[1]);

interface ProjectedCave {
  id: string;
  // Polygon positions: [outerRing, ...holeRings] — Leaflet renders holes as cut-outs.
  rings: LatLngExpression[][];
  entrances: LatLngExpression[][];
}

export default function CaveLayer({ caves, visible }: Props) {
  // Project every cave's geometry to lat/lng once; gameToLatLng is constant per point.
  const projected = useMemo<ProjectedCave[]>(
    () =>
      caves.map((c) => ({
        id: c.id,
        rings: [c.points.map(project), ...(c.holes ?? []).map((h) => h.map(project))],
        entrances: c.entrances.map((seg) => seg.map(project)),
      })),
    [caves],
  );

  if (!visible) return null;

  return (
    <LayerGroup>
      {projected.map((c) => (
        <LayerGroup key={c.id}>
          <Polygon
            positions={c.rings}
            pathOptions={{
              color: CAVE_COLOR,
              weight: 1.5,
              opacity: 0.8,
              fillColor: CAVE_COLOR,
              fillOpacity: 0.15,
            }}
          />
          {c.entrances.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg}
              pathOptions={{ color: ENTRANCE_COLOR, weight: 4, opacity: 0.95 }}
            />
          ))}
        </LayerGroup>
      ))}
    </LayerGroup>
  );
}
