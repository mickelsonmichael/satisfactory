import { Fragment, useMemo, useState } from 'react';
import type {
  LayerState,
  CollectibleType,
  ResourceLayer,
  ResourcePurity,
  Building,
  BuildingLine,
  BuildingCategory,
  SaveStats,
  EfficiencyReport,
  EfficiencyResult,
  RecipeData,
  CollectibleMarker,
} from '../types';
import { getCollectibleIconUrl } from '../lib/icons';
import { BUILDING_CATEGORIES, humanize } from '../lib/buildings';
import { headlineUtil, STATUS_COLOR, utilColor } from '../lib/efficiencyDisplay';
import FileUpload from './FileUpload';
import StatsPanel from './StatsPanel';
import EfficiencyPanel from './EfficiencyPanel';
import RecipesPanel from './RecipesPanel';

interface Props {
  layerStates: LayerState[];
  onToggle: (type: CollectibleType) => void;
  showCollected: boolean;
  onToggleCollected: () => void;
  showCaves: boolean;
  onToggleCaves: () => void;
  caveCount: number;
  showHeight: boolean;
  onToggleHeight: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  sessionName: string;
  /** Unix seconds for the displayed manifest save, or null when an uploaded file is shown. */
  saveTimestamp: number | null;
  /** Name of the user-uploaded file currently shown, or null. */
  uploadedFileName: string | null;
  canGoNewer: boolean;
  canGoOlder: boolean;
  onGoNewer: () => void;
  onGoOlder: () => void;
  onGoNewest: () => void;
  onGoOldest: () => void;
  resourceLayers: ResourceLayer[];
  // Per-layer purity visibility: resourcePurity[layerId][purity].
  resourcePurity: Record<string, Record<ResourcePurity, boolean>>;
  onTogglePurity: (id: string, purity: ResourcePurity) => void;
  onSetAllResources: (visible: boolean) => void;
  buildings: Building[];
  buildingLines: BuildingLine[];
  buildingVisibility: Record<BuildingCategory, boolean>;
  onToggleBuildingCategory: (id: BuildingCategory) => void;
  onSetAllBuildings: (visible: boolean) => void;
  onFileSelected: (file: File) => void;
  /** Aggregate stats for the displayed save, or null until one is parsed. */
  stats: SaveStats | null;
  /** Efficiency analysis toggle (heavy flow trace) + its result and selection. */
  showEfficiency: boolean;
  onToggleEfficiency: () => void;
  efficiency: EfficiencyReport | null;
  selectedResult: EfficiencyResult | null;
  onSelectBuilding: (id: string | null) => void;
  onCloseSelected: () => void;
  /** Recipe data + unlock state for the Recipes tab. */
  recipeData: RecipeData | null;
  markers: CollectibleMarker[];
  unlockedSchematics: string[];
  onShowRecipes: () => void;
}

// The set of purities a layer actually contains, so absent ones render no checkbox.
function layerPurities(layer: ResourceLayer): Set<ResourcePurity> {
  const present = new Set<ResourcePurity>();
  for (const m of layer.markers) if (m.purity) present.add(m.purity);
  return present;
}

// Purity options shown in the resource filter, with the accent colors used by the popup badges.
const PURITY_OPTIONS: { value: ResourcePurity; label: string; color: string }[] = [
  { value: 'pure', label: 'Pure', color: '#6fcf6f' },
  { value: 'normal', label: 'Normal', color: '#f2c14e' },
  { value: 'impure', label: 'Impure', color: '#d98a5b' },
];

const ICON_BASE = `${import.meta.env.BASE_URL}icons/resources/`;

// Save timestamps are epoch seconds (UTC); display them in the viewer's local time.
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function NavButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `No ${title.toLowerCase()}` : title}
      style={{
        background: 'none',
        border: '1px solid #444',
        borderRadius: 4,
        color: disabled ? '#444' : '#aaa',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12,
        lineHeight: 1,
        padding: '2px 7px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function LayerControls({
  layerStates,
  onToggle,
  showCollected,
  onToggleCollected,
  showCaves,
  onToggleCaves,
  caveCount,
  showHeight,
  onToggleHeight,
  autoRefresh,
  onToggleAutoRefresh,
  sessionName,
  saveTimestamp,
  uploadedFileName,
  canGoNewer,
  canGoOlder,
  onGoNewer,
  onGoOlder,
  onGoNewest,
  onGoOldest,
  resourceLayers,
  resourcePurity,
  onTogglePurity,
  onSetAllResources,
  buildings,
  buildingLines,
  buildingVisibility,
  onToggleBuildingCategory,
  onSetAllBuildings,
  onFileSelected,
  stats,
  showEfficiency,
  onToggleEfficiency,
  efficiency,
  selectedResult,
  onSelectBuilding,
  onCloseSelected,
  recipeData,
  markers,
  unlockedSchematics,
  onShowRecipes,
}: Props) {
  const [resourcesExpanded, setResourcesExpanded] = useState(false);
  const [buildingsExpanded, setBuildingsExpanded] = useState(false);
  const [collectiblesExpanded, setCollectiblesExpanded] = useState(true);
  const [tab, setTab] = useState<'filters' | 'stats' | 'efficiency' | 'recipes'>('filters');
  const [collapsed, setCollapsed] = useState(false);

  // Count placed buildings + connection lines per category for the section's row labels.
  const buildingCounts = useMemo(() => {
    const m = Object.fromEntries(BUILDING_CATEGORIES.map((c) => [c.id, 0])) as Record<
      BuildingCategory,
      number
    >;
    for (const b of buildings) m[b.category] += 1;
    for (const ln of buildingLines) m[ln.category] += 1;
    return m;
  }, [buildings, buildingLines]);

  const hasBuildings = buildings.length > 0 || buildingLines.length > 0;
  const buildingsAllVisible =
    hasBuildings && BUILDING_CATEGORIES.every((c) => buildingVisibility[c.id]);

  // "All" is reached when every present purity of every layer is enabled.
  const allVisible =
    resourceLayers.length > 0 &&
    resourceLayers.every((l) =>
      [...layerPurities(l)].every((p) => resourcePurity[l.id]?.[p]),
    );

  const collectiblesAllVisible = layerStates.length > 0 && layerStates.every((ls) => ls.visible);

  function setAllCollectibles(visible: boolean) {
    layerStates.forEach((ls) => {
      if (ls.visible !== visible) onToggle(ls.type);
    });
  }
  const SIDEBAR_W = 320;

  return (
    <>
    <button
      onClick={() => setCollapsed((v) => !v)}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        position: 'fixed',
        top: 12,
        right: collapsed ? 0 : SIDEBAR_W,
        transition: 'right 0.25s ease',
        zIndex: 1001,
        background: 'rgba(15,15,20,0.92)',
        border: '1px solid #333',
        borderRight: 'none',
        borderRadius: '6px 0 0 6px',
        color: '#aaa',
        cursor: 'pointer',
        fontSize: 13,
        lineHeight: 1,
        padding: '8px 6px',
        backdropFilter: 'blur(6px)',
      }}
    >
      {collapsed ? '‹' : '›'}
    </button>
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(15,15,20,0.92)',
        borderLeft: '1px solid #333',
        padding: '16px 18px',
        color: '#ddd',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        width: SIDEBAR_W,
        overflowY: 'auto',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        transform: collapsed ? 'translateX(100%)' : 'none',
        transition: 'transform 0.25s ease',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#fff' }}>
        {sessionName || 'Satisfactory Map'}
      </div>

      {/* Save timestamp + history navigation (older / newer) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <NavButton label="◀◀" title="Oldest save" disabled={!canGoOlder} onClick={onGoOldest} />
        <NavButton label="◀" title="Older save" disabled={!canGoOlder} onClick={onGoOlder} />
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 12,
            color: '#bbb',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={uploadedFileName ?? undefined}
        >
          {uploadedFileName
            ? `📁 ${uploadedFileName}`
            : saveTimestamp != null
              ? DATE_FMT.format(saveTimestamp * 1000)
              : '—'}
        </span>
        <NavButton label="▶" title="Newer save" disabled={!canGoNewer} onClick={onGoNewer} />
        <NavButton label="▶▶" title="Newest save" disabled={!canGoNewer} onClick={onGoNewest} />
      </div>

      {/* Selected-building efficiency detail (shown above the tabs, on any tab). */}
      {selectedResult && (
        <div style={{ marginTop: 10 }}>
          <EfficiencyPanel result={selectedResult} onSelect={onSelectBuilding} onClose={onCloseSelected} />
        </div>
      )}

      {/* Tab strip: switch the body between filters, stats, efficiency and recipes. */}
      <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
        {(['filters', 'stats', 'efficiency', 'recipes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === 'recipes') onShowRecipes();
            }}
            style={{
              flex: 1,
              background: tab === t ? 'rgba(250,149,73,0.15)' : 'none',
              border: '1px solid',
              borderColor: tab === t ? '#FA9549' : '#333',
              borderRadius: 5,
              color: tab === t ? '#FA9549' : '#aaa',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              padding: '5px 0',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsPanel stats={stats} />}

      {tab === 'recipes' && (
        <RecipesPanel
          recipeData={recipeData}
          markers={markers}
          unlockedSchematics={unlockedSchematics}
        />
      )}

      {tab === 'efficiency' && (
        <EfficiencyReportView
          showEfficiency={showEfficiency}
          report={efficiency}
          selectedId={selectedResult?.id ?? null}
          onSelect={onSelectBuilding}
        />
      )}

      {tab === 'filters' && (
        <>
        <div
          style={{
            borderTop: '1px solid #333',
            paddingTop: 8,
            marginBottom: 10,
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={showCollected}
            onChange={onToggleCollected}
            style={{ width: 14, height: 14 }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>Show collected</span>
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={showCaves}
            onChange={onToggleCaves}
            style={{ accentColor: '#FA9549', width: 14, height: 14 }}
          />
          <span style={{ flex: 1, color: '#888', fontSize: 12 }}>Show caves</span>
          {caveCount > 0 && (
            <span style={{ color: '#888', fontSize: 11 }}>{caveCount}</span>
          )}
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          title="Always show each collectible's elevation next to its marker"
        >
          <input
            type="checkbox"
            checked={showHeight}
            onChange={onToggleHeight}
            style={{ accentColor: '#FA9549', width: 14, height: 14 }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>Always show height</span>
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          title="Automatically re-check for a newer save every 15 minutes and load it when found"
        >
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={onToggleAutoRefresh}
            style={{ accentColor: '#FA9549', width: 14, height: 14 }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>Auto-refresh (15 min)</span>
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          title="Trace every conveyor & pipe network and estimate item flow to find bottlenecks. Colors machines by utilization and enables the Efficiency tab — a heavy step that can take a moment on large saves."
        >
          <input
            type="checkbox"
            checked={showEfficiency}
            onChange={onToggleEfficiency}
            style={{ accentColor: '#FA9549', width: 14, height: 14 }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>Show efficiency ⚠</span>
        </label>
      </div>

      {layerStates.length > 0 && (
        <div style={{ borderTop: '1px solid #333', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setCollectiblesExpanded((v) => !v)}
              title={collectiblesExpanded ? 'Collapse' : 'Expand'}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                width: 12,
                lineHeight: 1,
              }}
            >
              {collectiblesExpanded ? '▼' : '▶'}
            </button>
            <span
              style={{ flex: 1, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setCollectiblesExpanded((v) => !v)}
            >
              Collectibles
            </span>
            <button
              onClick={() => setAllCollectibles(!collectiblesAllVisible)}
              style={{
                background: 'none',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 10,
                padding: '1px 6px',
              }}
            >
              {collectiblesAllVisible ? 'None' : 'All'}
            </button>
          </div>

          {collectiblesExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {layerStates.map((ls) => (
                <label
                  key={ls.type}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={ls.visible}
                    onChange={() => onToggle(ls.type)}
                    style={{ accentColor: ls.color, width: 14, height: 14 }}
                  />
                  <img
                    src={getCollectibleIconUrl(ls.type)}
                    alt=""
                    width={16}
                    height={16}
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  <span style={{ flex: 1 }}>{ls.label}</span>
                  <span style={{ color: '#888', fontSize: 11 }}>
                    {ls.uncollectedCount}
                    {ls.collectedCount > 0 && (
                      <span style={{ color: '#555' }}> / {ls.collectedCount}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {resourceLayers.length > 0 && (
        <div style={{ borderTop: '1px solid #333', marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setResourcesExpanded((v) => !v)}
              title={resourcesExpanded ? 'Collapse' : 'Expand'}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                width: 12,
                lineHeight: 1,
              }}
            >
              {resourcesExpanded ? '▼' : '▶'}
            </button>
            <span
              style={{ flex: 1, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setResourcesExpanded((v) => !v)}
            >
              Resource Nodes
            </span>
            <button
              onClick={() => onSetAllResources(!allVisible)}
              style={{
                background: 'none',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 10,
                padding: '1px 6px',
              }}
            >
              {allVisible ? 'None' : 'All'}
            </button>
          </div>

          {resourcesExpanded && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 46px 46px 46px',
                alignItems: 'center',
                rowGap: 5,
                marginTop: 8,
              }}
            >
              {/* Purity column headers */}
              <span />
              {PURITY_OPTIONS.map((p) => (
                <span
                  key={p.value}
                  style={{
                    textAlign: 'center',
                    fontSize: 10,
                    color: p.color,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {p.label}
                </span>
              ))}

              {resourceLayers.map((layer, i) => {
                const prev = resourceLayers[i - 1];
                const groupBreak = i === 0 || prev.group !== layer.group;
                const present = layerPurities(layer);
                const states = resourcePurity[layer.id];
                return (
                  <Fragment key={layer.id}>
                    {groupBreak && (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          color: '#666',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          margin: i === 0 ? '0' : '6px 0 0',
                        }}
                      >
                        {layer.group === 'well' ? 'Resource Wells' : 'Nodes'}
                      </div>
                    )}
                    {/* Layer (name + icon) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <img
                        src={`${ICON_BASE}${layer.icon}`}
                        alt=""
                        width={16}
                        height={16}
                        style={{ flexShrink: 0, objectFit: 'contain' }}
                      />
                      <span
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {layer.name}
                      </span>
                    </div>
                    {/* One checkbox per purity column; a dash where the layer has none */}
                    {PURITY_OPTIONS.map((p) =>
                      present.has(p.value) ? (
                        <div key={p.value} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={states?.[p.value] ?? false}
                            onChange={() => onTogglePurity(layer.id, p.value)}
                            title={`${layer.name} — ${p.label}`}
                            style={{ accentColor: p.color, width: 14, height: 14, cursor: 'pointer' }}
                          />
                        </div>
                      ) : (
                        <span key={p.value} style={{ textAlign: 'center', color: '#444' }}>
                          –
                        </span>
                      ),
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hasBuildings && (
        <div style={{ borderTop: '1px solid #333', marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setBuildingsExpanded((v) => !v)}
              title={buildingsExpanded ? 'Collapse' : 'Expand'}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                width: 12,
                lineHeight: 1,
              }}
            >
              {buildingsExpanded ? '▼' : '▶'}
            </button>
            <span
              style={{ flex: 1, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setBuildingsExpanded((v) => !v)}
            >
              Buildings
            </span>
            <button
              onClick={() => onSetAllBuildings(!buildingsAllVisible)}
              style={{
                background: 'none',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 10,
                padding: '1px 6px',
              }}
            >
              {buildingsAllVisible ? 'None' : 'All'}
            </button>
          </div>

          {buildingsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {BUILDING_CATEGORIES.map((cat) => (
                <label
                  key={cat.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={buildingVisibility[cat.id] ?? false}
                    onChange={() => onToggleBuildingCategory(cat.id)}
                    style={{ accentColor: cat.color, width: 14, height: 14 }}
                  />
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      flexShrink: 0,
                      borderRadius: 3,
                      background: cat.color,
                      opacity: 0.85,
                    }}
                  />
                  <span style={{ flex: 1 }}>{cat.label}</span>
                  <span style={{ color: '#888', fontSize: 11 }}>
                    {buildingCounts[cat.id].toLocaleString()}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
        </>
      )}

      <div style={{ borderTop: '1px solid #333', marginTop: 'auto', paddingTop: 12 }}>
        <FileUpload onFileSelected={onFileSelected} />
      </div>
    </div>
    </>
  );
}

// Maximum number of ranked machines to list — the worst offenders are what matter, and a
// few dozen rows keeps the panel responsive.
const REPORT_LIMIT = 100;

function EfficiencyReportView({
  showEfficiency,
  report,
  selectedId,
  onSelect,
}: {
  showEfficiency: boolean;
  report: EfficiencyReport | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!showEfficiency) {
    return (
      <div style={{ color: '#888', fontSize: 12, padding: '12px 0', lineHeight: 1.5 }}>
        Enable <strong style={{ color: '#bbb' }}>Show efficiency</strong> in the Filters tab to
        trace conveyor &amp; pipe networks and rank your least-utilized miners and factories.
      </div>
    );
  }
  if (!report) {
    return <div style={{ color: '#888', fontSize: 12, padding: '12px 0' }}>Analyzing factory…</div>;
  }

  const { summary } = report;
  return (
    <div style={{ paddingTop: 6 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginBottom: 10,
          fontSize: 12,
        }}
      >
        <Stat label="Machines" value={summary.machines} />
        <Stat label="Underutilized" value={summary.underutilized} color="#f2c14e" />
        <Stat label="Starved" value={summary.starved} color={STATUS_COLOR.starved} />
        <Stat label="Blocked" value={summary.blocked} color={STATUS_COLOR.blocked} />
      </div>

      <div style={{ color: '#666', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        Least utilized
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {report.ranked.slice(0, REPORT_LIMIT).map((id) => {
          const r = report.results[id];
          const util = Math.round(headlineUtil(r) * 100);
          const active = id === selectedId;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                background: active ? 'rgba(250,149,73,0.15)' : 'none',
                border: '1px solid',
                borderColor: active ? '#FA9549' : 'transparent',
                borderRadius: 4,
                color: '#ccc',
                cursor: 'pointer',
                padding: '4px 6px',
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                title={r.status}
                style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 2, background: STATUS_COLOR[r.status] }}
              />
              <span style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {humanize(r.cls)}
                </span>
                {(r.recipeName || r.item) && (
                  <span
                    style={{
                      display: 'block',
                      color: '#777',
                      fontSize: 10.5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.recipeName ?? r.item}
                  </span>
                )}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 700, color: utilColor(headlineUtil(r)) }}>{util}%</span>
            </button>
          );
        })}
      </div>
      {report.ranked.length > REPORT_LIMIT && (
        <div style={{ color: '#666', fontSize: 11, marginTop: 8 }}>
          +{report.ranked.length - REPORT_LIMIT} more…
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ border: '1px solid #333', borderRadius: 5, padding: '5px 8px' }}>
      <div style={{ color: color ?? '#fff', fontWeight: 700, fontSize: 16 }}>{value.toLocaleString()}</div>
      <div style={{ color: '#888', fontSize: 10.5 }}>{label}</div>
    </div>
  );
}
