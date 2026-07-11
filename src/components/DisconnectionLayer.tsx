import { useMemo } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FactoryGraph } from '../types';
import { gameToLatLng } from '../lib/coordinates';
import { humanize } from '../lib/buildings';

interface Props {
  factory: FactoryGraph | null;
  visible: boolean;
  onSelectBuilding?: (id: string) => void;
}

// Only production machines and extractors are checked — they always require power.
const CHECKED_KINDS = new Set(['factory', 'extractor']);
// FrackingCore is a passive well-centre node, and FrackingExtractor is the small
// satellite Resource Well Extractor placed on sub-nodes — per the wiki, satellites
// "do not require power" (only the central FrackingSmasher/Pressurizer does), so
// neither should be flagged for missing power.
const EXCLUDED_CLS_RE = /FrackingCore|FrackingExtractor/i;

// Broken lightning bolt: two halves of a standard bolt with a visible gap.
const BROKEN_BOLT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="13" height="13">
  <path fill="#fff" d="M12 2L4.5 11H9.5L12 2Z"/>
  <path fill="#fff" d="M10.5 14L8.5 19.5L16.5 11H11.5L10.5 14Z"/>
</svg>`;

// Broken chain link: two rectangles with broken link lines between them.
const BROKEN_CONN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="12" height="12">
  <g fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1" y="6.5" width="7" height="7" rx="2.5"/>
    <rect x="12" y="6.5" width="7" height="7" rx="2.5"/>
    <line x1="7.5" y1="9" x2="9.5" y2="7"/>
    <line x1="10.5" y1="13" x2="12.5" y2="11"/>
  </g>
</svg>`;

function makeIcon(bg: string, svg: string, badge?: string) {
  const html = `<div style="position:relative;width:26px;height:26px;background:${bg};border-radius:50%;border:2px solid rgba(255,255,255,0.85);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.55);">${svg}${badge ?? ''}</div>`;
  return L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
}

const BADGE = `<div style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;background:#dc2626;border-radius:50%;border:1.5px solid #fff;"></div>`;

const ICON_POWER = makeIcon('#dc2626', BROKEN_BOLT_SVG);
const ICON_CONN  = makeIcon('#f97316', BROKEN_CONN_SVG);
const ICON_BOTH  = makeIcon('#f97316', BROKEN_CONN_SVG, BADGE);

export default function DisconnectionLayer({ factory, visible, onSelectBuilding }: Props) {
  const map = useMap();
  const issues = useMemo(() => {
    if (!factory) return [];
    return factory.nodes.filter(
      (n) =>
        CHECKED_KINDS.has(n.kind) &&
        !EXCLUDED_CLS_RE.test(n.cls) &&
        (
          // Power: no cable at all
          !n.hasPower ||
          // Inputs: machine has input ports but zero are connected (recipe doesn't excuse ALL being open)
          (n.openInputs > 0 && n.connectedInputs === 0) ||
          // Outputs: same logic for output side
          (n.openOutputs > 0 && n.connectedOutputs === 0)
        ),
    );
  }, [factory]);

  if (!visible || issues.length === 0) return null;

  return (
    <LayerGroup>
      {issues.map((node) => {
        const [lat, lng] = gameToLatLng(node.x, node.y);
        const hasConnIssue =
          (node.openInputs > 0 && node.connectedInputs === 0) ||
          (node.openOutputs > 0 && node.connectedOutputs === 0);
        const hasPowerIssue = !node.hasPower;
        const icon = hasConnIssue && hasPowerIssue ? ICON_BOTH : hasPowerIssue ? ICON_POWER : ICON_CONN;

        return (
          <Marker key={node.id} position={[lat, lng]} icon={icon} zIndexOffset={500}>
            <Popup className="sf-popup" autoPan={false}>
              <div className="sf-pop-header">
                <div className="sf-pop-title">{humanize(node.cls)}</div>
                <button className="sf-pop-close" onClick={() => map.closePopup()}>×</button>
              </div>

              {hasPowerIssue && (
                <div className="sf-pop-issue-power">
                  <span>⚡</span>
                  <span>No power cable connected</span>
                </div>
              )}
              {node.openInputs > 0 && (
                <div className="sf-pop-issue-conn">
                  ↓ {node.openInputs} open input{node.openInputs !== 1 ? 's' : ''}
                </div>
              )}
              {node.openOutputs > 0 && (
                <div className="sf-pop-issue-conn">
                  ↑ {node.openOutputs} open output{node.openOutputs !== 1 ? 's' : ''}
                </div>
              )}

              <dl className="sf-pop-coords">
                {node.clock !== 1 && (
                  <>
                    <dt>Clock</dt>
                    <dd>{Math.round(node.clock * 100)}%</dd>
                  </>
                )}
                <dt>X</dt>
                <dd>{Math.round(node.x / 100)} m</dd>
                <dt>Y</dt>
                <dd>{Math.round(node.y / 100)} m</dd>
                <dt>Z</dt>
                <dd>{Math.round(node.z / 100)} m</dd>
              </dl>

              {onSelectBuilding && (
                <button className="sf-pop-btn" onClick={() => onSelectBuilding(node.id)}>
                  Show in efficiency panel
                </button>
              )}
            </Popup>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}
