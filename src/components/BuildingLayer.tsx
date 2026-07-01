import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Building, BuildingInventory, BuildingLine, BuildingCategory, EfficiencyResult } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { BUILDING_CATEGORIES, humanize } from '../lib/buildings';
import { headlineUtil, STATUS_COLOR, STATUS_LABEL, utilColor } from '../lib/efficiencyDisplay';

const ITEM_ICON_OVERRIDE: Record<string, string> = {
  'Quickwire':              'IconDesc_HighSpeedWire_256',
  'Screw':                  'IconDesc_IronScrew_256',
  'Black Powder':           'IconDesc_Gunpowder_256',
  'Alclad Aluminum Sheet':  'IconDesc_AluminumPlate_256',
  'Heavy Modular Frame':    'IconDesc_ModularFrameHeavy_256',
  'Solid Biofuel':          'IconDesc_Biofuel_256',
};

function itemIconSrc(humanName: string): string {
  const override = ITEM_ICON_OVERRIDE[humanName];
  if (override) return `icons/items/${override}.png`;
  const camel = humanName
    .replace(/[-\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
  return `icons/items/IconDesc_${camel}_256.png`;
}

interface Props {
  buildings: Building[];
  // Spline buildings (belts/pipes/rails) drawn as connected polylines.
  lines: BuildingLine[];
  // Which categories are shown. A building draws only when its category is true here.
  visibility: Record<BuildingCategory, boolean>;
  // Inventory contents per building, keyed by Building.id.
  inventories: Map<string, BuildingInventory>;
  // Efficiency results keyed by building id (null unless the toggle is on).
  efficiency: Record<string, EfficiencyResult> | null;
  showEfficiency: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Canvas opacity (0..1). Scales all fill/stroke alphas so that 1.0 = fully opaque
  // and 0.4 (the default) reproduces the original appearance.
  opacity: number;
}

// Color for a production machine with no efficiency result (e.g. idle, unmodelled).
const EFF_MISSING = '#6b7280';
// Painted back-to-front: structure first, machines last so they sit on top.
const DRAW_ORDER: BuildingCategory[] = [
  'foundation',
  'wall',
  'logistics',
  'storage',
  'power',
  'vehicle',
  'misc',
  'production',
];
// Spatial-hash cell size (cm). Larger than any building, so a building only ever falls in
// the cell of its center for both viewport-culled drawing and hover hit-testing.
const CELL = 5000;
// Max building half-extent (cm) — pads the cell sweep so big footprints straddling the
// viewport edge are still drawn.
const CELL_PAD = 2500;
// Level-of-detail: footprints projecting smaller than this (px) are invisible, so skip
// them entirely. This drops belts/poles/small machines when zoomed out.
const MIN_DRAW_PX = 0.7;
// Outlines only help when footprints are reasonably large; below this on-screen size
// (px for an 8 m foundation) we skip stroking — it is invisible and doubles draw cost.
const STROKE_MIN_PX = 12;
// Structural categories carry no interesting per-building stats, so they are excluded
// from hover hit-testing — hovering them would only ever surface a coordinate.
const HOVERABLE: Record<BuildingCategory, boolean> = {
  foundation: false,
  wall: false,
  production: true,
  power: true,
  logistics: true,
  storage: true,
  vehicle: true,
  misc: true,
};

const CAT_LABEL: Record<BuildingCategory, string> = Object.fromEntries(
  BUILDING_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<BuildingCategory, string>;
const CAT_COLOR: Record<BuildingCategory, string> = Object.fromEntries(
  BUILDING_CATEGORIES.map((c) => [c.id, c.color]),
) as Record<BuildingCategory, string>;

// Building plus its precomputed rotation, so the draw/hit-test loops do no trig.
interface Prep extends Building {
  cos: number;
  sin: number;
}

// Affine game(x,y) -> container(px,py): [a b c; d e f]. Recomputed each redraw from three
// reference points, then applied with plain arithmetic so the hot loop makes no Leaflet calls.
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface Hover {
  b: Building;
  px: number; // building center in container pixels (tooltip is pinned here)
  py: number;
}

// Efficiency coloring state passed into paint (kept in a single object to avoid a long
// parameter list).
interface EffView {
  results: Record<string, EfficiencyResult> | null;
  show: boolean;
}

// Inverse-project a container point back to game coordinates.
function gameAt(aff: Affine, px: number, py: number): [number, number] {
  const det = aff.a * aff.e - aff.b * aff.d;
  const ox = px - aff.c;
  const oy = py - aff.f;
  return [(ox * aff.e - oy * aff.b) / det, (-ox * aff.d + oy * aff.a) / det];
}

// The fill color for a footprint: utilization tier when efficiency coloring is on and the
// building is a machine with a result, otherwise its category color.
function fillColor(p: Prep, eff: EffView): string {
  if (eff.show && p.category === 'production') {
    const r = p.id ? eff.results?.[p.id] : undefined;
    return r ? utilColor(headlineUtil(r)) : EFF_MISSING;
  }
  return CAT_COLOR[p.category];
}

// Append a footprint's rotated rectangle to a Path2D, given the affine + half-extents.
function addRect(path: Path2D, aff: Affine, p: Prep): void {
  const hw = p.w / 2;
  const hd = p.d / 2;
  const cx = aff.a * p.x + aff.b * p.y + aff.c;
  const cy = aff.d * p.x + aff.e * p.y + aff.f;
  const exx = (aff.a * p.cos + aff.b * p.sin) * hw;
  const exy = (aff.d * p.cos + aff.e * p.sin) * hw;
  const eyx = (aff.b * p.cos - aff.a * p.sin) * hd;
  const eyy = (aff.e * p.cos - aff.d * p.sin) * hd;
  path.moveTo(cx - exx - eyx, cy - exy - eyy);
  path.lineTo(cx + exx - eyx, cy + exy - eyy);
  path.lineTo(cx + exx + eyx, cy + exy + eyy);
  path.lineTo(cx - exx + eyx, cy - exy + eyy);
  path.closePath();
}

// Repaint every visible footprint. Batches each fill color into a single path filled once —
// the single biggest win over per-building fill/stroke — and only visits grid cells that
// overlap the viewport, so a zoomed-in view never iterates the whole base.
function paint(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  aff: Affine,
  grid: Map<string, Prep[]>,
  linesByCat: Record<BuildingCategory, BuildingLine[]>,
  visibility: Record<BuildingCategory, boolean>,
  eff: EffView,
  opacity: number,
  hovered: Prep | null,
): void {
  // Scale all alphas so that opacity=0.4 (default) reproduces the original hardcoded
  // constants and opacity=1.0 makes everything fully opaque.
  const fillAlpha = opacity;
  const strokeAlpha = Math.min(1, opacity * 1.25);   // 0.5 / 0.4
  const lineAlpha = Math.min(1, opacity * 1.875);    // 0.75 / 0.4
  const effFill = Math.min(1, opacity * 1.5);        // 0.6 / 0.4
  const effStroke = Math.min(1, opacity * 1.75);     // 0.7 / 0.4
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!BUILDING_CATEGORIES.some((cat) => visibility[cat.id])) return;

  // On-screen scale (px per cm) along each game axis, for level-of-detail decisions.
  const sx = Math.hypot(aff.a, aff.d);
  const sy = Math.hypot(aff.b, aff.e);
  const scale = Math.max(sx, sy);
  const minSizeCm = MIN_DRAW_PX / scale; // skip footprints smaller than this
  const doStroke = 800 * scale >= STROKE_MIN_PX;

  // Game-space bounding box of the viewport (from the four projected-back corners), padded
  // by the largest building extent, converted to the inclusive grid-cell range to sweep.
  const corners = [gameAt(aff, 0, 0), gameAt(aff, W, 0), gameAt(aff, 0, H), gameAt(aff, W, H)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [gx, gy] of corners) {
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gy < minY) minY = gy;
    if (gy > maxY) maxY = gy;
  }
  const ci0 = Math.floor((minX - CELL_PAD) / CELL);
  const ci1 = Math.floor((maxX + CELL_PAD) / CELL);
  const cj0 = Math.floor((minY - CELL_PAD) / CELL);
  const cj1 = Math.floor((maxY + CELL_PAD) / CELL);

  // One path per category; production splits into per-tier-color paths when efficiency
  // coloring is on (keyed by color string), preserving the category draw order.
  const paths = {} as Record<BuildingCategory, Path2D>;
  for (const cat of DRAW_ORDER) if (visibility[cat]) paths[cat] = new Path2D();
  const prodTier = new Map<string, Path2D>();
  const prodOn = eff.show && visibility.production;

  for (let i = ci0; i <= ci1; i++) {
    for (let j = cj0; j <= cj1; j++) {
      const bucket = grid.get(`${i},${j}`);
      if (!bucket) continue;
      for (const p of bucket) {
        if (!visibility[p.category]) continue;
        if (p.w < minSizeCm && p.d < minSizeCm) continue; // sub-pixel: invisible
        if (prodOn && p.category === 'production') {
          const col = fillColor(p, eff);
          let path = prodTier.get(col);
          if (!path) prodTier.set(col, (path = new Path2D()));
          addRect(path, aff, p);
        } else {
          addRect(paths[p.category], aff, p);
        }
      }
    }
  }

  c.lineWidth = 1;
  for (const cat of DRAW_ORDER) {
    if (prodOn && cat === 'production') continue; // drawn as tier buckets below
    const path = paths[cat];
    if (!path) continue;
    // Filling the whole category as one path also avoids the seams/over-darkening you get
    // when thousands of translucent rectangles overlap edge to edge.
    c.globalAlpha = fillAlpha;
    c.fillStyle = CAT_COLOR[cat];
    c.fill(path);
    if (doStroke) {
      c.globalAlpha = strokeAlpha;
      c.strokeStyle = CAT_COLOR[cat];
      c.stroke(path);
    }
  }
  // Production machines colored by efficiency tier, more opaque so the status reads clearly.
  if (prodOn) {
    for (const [col, path] of prodTier) {
      c.globalAlpha = effFill;
      c.fillStyle = col;
      c.fill(path);
      if (doStroke) {
        c.globalAlpha = effStroke;
        c.strokeStyle = col;
        c.stroke(path);
      }
    }
  }

  // Connection lines (belts/pipes/rails) drawn on top so the routed network is legible.
  // One batched path per category, stroked once; viewport-culled per line.
  const lineW = Math.max(1, Math.min(5, 130 * scale)); // ~1.3 m belt width, clamped
  c.lineWidth = lineW;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalAlpha = lineAlpha;
  const lm = lineW + 2; // cull margin in px
  for (const cat of DRAW_ORDER) {
    if (!visibility[cat]) continue;
    const list = linesByCat[cat];
    if (!list || list.length === 0) continue;
    const path = new Path2D();
    for (const line of list) {
      const pts = line.pts;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      // Project once, recording the screen bbox so fully-offscreen lines are skipped.
      const proj: number[] = new Array(pts.length);
      for (let k = 0; k < pts.length; k += 2) {
        const gx = pts[k], gy = pts[k + 1];
        const x = aff.a * gx + aff.b * gy + aff.c;
        const y = aff.d * gx + aff.e * gy + aff.f;
        proj[k] = x; proj[k + 1] = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (maxX < -lm || minX > W + lm || maxY < -lm || minY > H + lm) continue;
      path.moveTo(proj[0], proj[1]);
      for (let k = 2; k < proj.length; k += 2) path.lineTo(proj[k], proj[k + 1]);
    }
    c.strokeStyle = CAT_COLOR[cat];
    c.stroke(path);
  }
  c.globalAlpha = 1;

  // Hover highlight — a bright outline (plus a slightly larger halo) around the building
  // under the cursor so it stands out against the tier coloring.
  if (hovered) {
    const ring = new Path2D();
    addRect(ring, aff, hovered);
    c.lineJoin = 'round';
    c.globalAlpha = 1;
    c.lineWidth = 3;
    c.strokeStyle = '#000';
    c.stroke(ring);
    c.lineWidth = 1.5;
    c.strokeStyle = '#fff';
    c.stroke(ring);
    c.globalAlpha = 1;
  }
}

export default function BuildingLayer({
  buildings,
  lines,
  visibility,
  inventories,
  efficiency,
  showEfficiency,
  selectedId: _selectedId,
  onSelect,
  opacity,
}: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const affineRef = useRef<Affine | null>(null);
  const visRef = useRef(visibility);
  const opacityRef = useRef(opacity);
  const redrawRef = useRef<() => void>(() => {});
  const hoverIdRef = useRef<Prep | null>(null);
  const popoverBuildingRef = useRef<Building | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  // Tracks which building's inventory "show more" is expanded. Switching buildings
  // auto-collapses because the new b.id won't match this stored id.
  const [expandedInventoryId, setExpandedInventoryId] = useState<string | null>(null);
  // Leaflet listens to native DOM events, so React's synthetic stopPropagation has no
  // effect. Attach a native Leaflet click guard to the popover div via a callback ref
  // so clicks inside the panel never reach the map's click handler.
  const popoverRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node) L.DomEvent.disableClickPropagation(node);
  }, []);

  // Keep live refs fresh so map-event handlers always read the latest props.
  opacityRef.current = opacity;

  // Precompute rotation once per save, and index every building into the spatial grid by
  // its center cell. Both the renderer and the hit-test reuse this single structure.
  const grid = useMemo(() => {
    const g = new Map<string, Prep[]>();
    for (const b of buildings) {
      const p: Prep = { ...b, cos: Math.cos(b.yaw), sin: Math.sin(b.yaw) };
      const key = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
      const bucket = g.get(key);
      if (bucket) bucket.push(p);
      else g.set(key, [p]);
    }
    return g;
  }, [buildings]);

  // Group connection lines by category so the renderer strokes each category in one batch.
  const linesByCat = useMemo(() => {
    const m = {
      foundation: [], wall: [], production: [], power: [],
      logistics: [], storage: [], vehicle: [], misc: [],
    } as Record<BuildingCategory, BuildingLine[]>;
    for (const ln of lines) m[ln.category].push(ln);
    return m;
  }, [lines]);

  // Live refs so the map-event handlers (registered once) always read the latest props.
  const effRef = useRef<EffView>({ results: efficiency, show: showEfficiency });
  effRef.current = {
    results: efficiency,
    show: showEfficiency,
  };

  useEffect(() => {
    visRef.current = visibility;
  }, [visibility]);

  useEffect(() => {
    const canvas = L.DomUtil.create('canvas', 'sf-building-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none'; // never steal map drags / marker clicks
    canvas.style.left = '0';
    canvas.style.top = '0';
    map.getPanes().overlayPane.appendChild(canvas);
    canvasRef.current = canvas;

    // Light repaint — reuses the current affine without resizing or repositioning the canvas.
    // Called on mousemove so the hover outline updates cheaply without a full reset.
    function repaint() {
      const aff = affineRef.current;
      if (!aff) return;
      const size = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ctx = canvas.getContext('2d');
      if (ctx)
        paint(ctx, size.x, size.y, dpr, aff, grid, linesByCat, visRef.current, effRef.current, opacityRef.current, hoverIdRef.current);
    }
    redrawRef.current = repaint;

    // Pin the canvas to the top-left of the viewport (in layer coords) so it pans with the
    // map between redraws, then draw every footprint in container-pixel space.
    function reset() {
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      // Build the affine from three non-collinear game reference points.
      const ref = (gx: number, gy: number) => {
        const [lat, lng] = gameToLatLng(gx, gy);
        return map.latLngToContainerPoint([lat, lng]);
      };
      const S = 100000;
      const p0 = ref(0, 0);
      const pX = ref(S, 0);
      const pY = ref(0, S);
      affineRef.current = {
        a: (pX.x - p0.x) / S,
        d: (pX.y - p0.y) / S,
        b: (pY.x - p0.x) / S,
        e: (pY.y - p0.y) / S,
        c: p0.x,
        f: p0.y,
      };
      repaint();
    }

    // Pick the smallest hoverable building under a container point (a machine wins over the
    // foundation beneath it).
    function pick(cx: number, cy: number): Prep | null {
      const aff = affineRef.current;
      if (!aff) return null;
      const [gx, gy] = gameAt(aff, cx, cy);
      const vis = visRef.current;
      const ci = Math.floor(gx / CELL);
      const cj = Math.floor(gy / CELL);
      let best: Prep | null = null;
      let bestArea = Infinity;
      for (let i = ci - 1; i <= ci + 1; i++) {
        for (let j = cj - 1; j <= cj + 1; j++) {
          const bucket = grid.get(`${i},${j}`);
          if (!bucket) continue;
          for (const b of bucket) {
            if (!vis[b.category] || !HOVERABLE[b.category]) continue;
            const dx = gx - b.x;
            const dy = gy - b.y;
            const lx = dx * b.cos + dy * b.sin;
            const ly = -dx * b.sin + dy * b.cos;
            if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.d / 2) {
              const area = b.w * b.d;
              if (area < bestArea) { bestArea = area; best = b; }
            }
          }
        }
      }
      return best;
    }

    // Hover: update the canvas outline when the building under the cursor changes.
    // Only repaints when the hovered building changes, so rapid mouse movement doesn't churn.
    function onMove(e: L.LeafletMouseEvent) {
      const best = pick(e.containerPoint.x, e.containerPoint.y);
      if (best === hoverIdRef.current) return;
      hoverIdRef.current = best;
      repaint();
    }

    // Click: show the popover for the building under the cursor, or close it on empty ground.
    // Close any open Leaflet popup first so only one popover is visible at a time.
    function onClick(e: L.LeafletMouseEvent) {
      const best = pick(e.containerPoint.x, e.containerPoint.y);
      onSelect(best?.id ?? null);
      popoverBuildingRef.current = best;
      if (!best) {
        setHover(null);
      } else {
        map.closePopup();
        const [lat, lng] = gameToLatLng(best.x, best.y);
        const pt = map.latLngToContainerPoint([lat, lng]);
        setHover({ b: best, px: pt.x, py: pt.y });
      }
    }

    // When a Leaflet popup (resource/disconnection marker) opens, close the building popover.
    function onPopupOpen() {
      popoverBuildingRef.current = null;
      setHover(null);
      onSelect(null);
    }

    // Pan/zoom: keep the popover pinned to its building's current screen position.
    function onMapMove() {
      const b = popoverBuildingRef.current;
      if (!b) return;
      const [lat, lng] = gameToLatLng(b.x, b.y);
      const pt = map.latLngToContainerPoint([lat, lng]);
      setHover((prev) => (prev ? { ...prev, px: pt.x, py: pt.y } : null));
    }

    // Mouseout: clear the hover outline only — the click popover persists until dismissed.
    const clear = () => {
      hoverIdRef.current = null;
      repaint();
    };

    map.on('moveend zoomend resize', reset);
    map.on('move zoom', onMapMove);
    map.on('mousemove', onMove);
    map.on('mouseout', clear);
    map.on('click', onClick);
    map.on('popupopen', onPopupOpen);
    reset();

    return () => {
      map.off('moveend zoomend resize', reset);
      map.off('move zoom', onMapMove);
      map.off('mousemove', onMove);
      map.off('mouseout', clear);
      map.off('click', onClick);
      map.off('popupopen', onPopupOpen);
      canvas.remove();
      canvasRef.current = null;
      redrawRef.current = () => {};
    };
  }, [map, grid, linesByCat, onSelect]);

  // Repaint when visibility, efficiency, or opacity changes (no map event fires for these).
  useEffect(() => {
    redrawRef.current();
  }, [visibility, efficiency, showEfficiency, opacity]);

  if (!hover) return null;
  const { b } = hover;
  const eff = showEfficiency && b.id ? efficiency?.[b.id] : undefined;
  const inv = b.id ? inventories.get(b.id) : undefined;
  const showAllInv = expandedInventoryId === b.id;
  const SHOW_LIMIT = 5;

  function closePopover() {
    popoverBuildingRef.current = null;
    setHover(null);
    onSelect(null);
  }
  return (
    <div
      ref={popoverRef}
      className="sf-building-tip"
      style={{
        '--cat-clr': CAT_COLOR[b.category],
        left: hover.px,
        top: hover.py - 10,
        transform: 'translateX(-50%) translateY(-100%)',
      } as React.CSSProperties}
    >
      <div className="sf-pop-header">
        <div className="sf-pop-title" style={{ color: CAT_COLOR[b.category] }}>
          {humanize(b.cls)}
        </div>
        <button className="sf-pop-close" onClick={closePopover}>×</button>
      </div>
      <div className="sf-building-tip-cat">{CAT_LABEL[b.category]}</div>
      {b.recipe && (
        <div className="sf-building-tip-recipe">
          <span>Recipe</span> {b.recipe}
        </div>
      )}
      {eff && (
        <div className="sf-building-tip-recipe">
          <span style={{ color: STATUS_COLOR[eff.status] }}>{STATUS_LABEL[eff.status]}</span>{' '}
          {Math.round(headlineUtil(eff) * 100)}% utilized
        </div>
      )}
      {inv && inv.items.length > 0 && (
        <div className="sf-building-tip-inv">
          <div className="sf-building-tip-inv-header">
            <div className="sf-building-tip-inv-label">Contents</div>
            {inv.full && <span className="sf-building-tip-inv-full">FULL</span>}
          </div>
          <div className="sf-pop-cost-section">
            {(showAllInv ? inv.items : inv.items.slice(0, SHOW_LIMIT)).map(({ item, amount }) => {
              const name = humanize(item);
              return (
                <div key={item} className="sf-pop-cost-row">
                  <img
                    src={itemIconSrc(name)}
                    alt=""
                    className="sf-pop-cost-icon"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="sf-pop-cost-amount">{amount.toLocaleString()}</span>
                  <span className="sf-pop-cost-name">{name}</span>
                </div>
              );
            })}
          </div>
          {!showAllInv && inv.items.length > SHOW_LIMIT && (
            <button
              className="sf-building-tip-inv-more"
              onClick={() => setExpandedInventoryId(b.id ?? null)}
            >
              Show {inv.items.length - SHOW_LIMIT} more
            </button>
          )}
        </div>
      )}
      <dl className="sf-pop-coords">
        <dt>X</dt>
        <dd>{Math.round(b.x / 100)} m</dd>
        <dt>Y</dt>
        <dd>{Math.round(b.y / 100)} m</dd>
        <dt>Z</dt>
        <dd>{Math.round(b.z / 100)} m</dd>
      </dl>
    </div>
  );
}
